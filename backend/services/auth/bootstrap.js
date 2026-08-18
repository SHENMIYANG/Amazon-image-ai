import { getDatabaseClient, isPersistenceEnabled } from '../persistence/client.js'
import { hashPassword } from './password.js'

function organizationSlug(name = '') {
  return String(name || 'default')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'default'
}

export async function ensureBootstrapAdmin() {
  if (!isPersistenceEnabled() || process.env.AUTH_ENABLED === 'false') return null

  const loginName = String(process.env.BOOTSTRAP_ADMIN_LOGIN || '').trim().toLowerCase()
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '')
  if (!loginName || !password) {
    console.warn('[auth] 未配置初始管理员。请设置 BOOTSTRAP_ADMIN_LOGIN 和 BOOTSTRAP_ADMIN_PASSWORD。')
    return null
  }

  const db = await getDatabaseClient()
  const existing = await db.user.findUnique({ where: { loginName } })
  if (existing) return existing

  const name = String(process.env.BOOTSTRAP_ORGANIZATION_NAME || 'Default Organization').trim() || 'Default Organization'
  const organization = await db.organization.upsert({
    where: { slug: organizationSlug(process.env.DATABASE_DEFAULT_ORGANIZATION_SLUG || name) },
    update: {},
    create: { name, slug: organizationSlug(process.env.DATABASE_DEFAULT_ORGANIZATION_SLUG || name) }
  })
  const user = await db.user.create({
    data: {
      loginName,
      email: String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim() || null,
      displayName: String(process.env.BOOTSTRAP_ADMIN_NAME || loginName).trim() || loginName,
      passwordHash: await hashPassword(password),
      memberships: { create: { organizationId: organization.id, role: 'ADMIN' } }
    }
  })
  console.info(`[auth] 已创建初始管理员：${loginName}`)
  return user
}
