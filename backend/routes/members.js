import express from 'express'
import { getDatabaseClient } from '../services/persistence/client.js'
import { hashPassword } from '../services/auth/password.js'
import { MEMBERSHIP_ROLES } from '../services/auth/permissions.js'
import { isAuthEnabled } from '../services/auth/session.js'

const router = express.Router()

function normalizeLoginName(value = '') {
  return String(value || '').trim().toLowerCase()
}

function serializeMember(membership) {
  return {
    membershipId: membership.id,
    role: membership.role,
    createdAt: membership.createdAt,
    user: {
      id: membership.user.id,
      loginName: membership.user.loginName,
      email: membership.user.email,
      displayName: membership.user.displayName,
      isActive: membership.user.isActive,
      lastLoginAt: membership.user.lastLoginAt,
      createdAt: membership.user.createdAt
    }
  }
}

function assertRole(role) {
  return MEMBERSHIP_ROLES.includes(role)
}

function unavailable(res) {
  return res.status(503).json({ success: false, message: '成员管理需要先配置并迁移 PostgreSQL。' })
}

router.get('/', async (req, res, next) => {
  if (!isAuthEnabled()) return unavailable(res)
  try {
    const db = await getDatabaseClient()
    const memberships = await db.membership.findMany({
      where: { organizationId: req.auth.organizationId },
      include: { user: true },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }]
    })
    res.json({ success: true, members: memberships.map(serializeMember) })
  } catch (error) {
    next(error)
  }
})

router.post('/', async (req, res, next) => {
  if (!isAuthEnabled()) return unavailable(res)
  try {
    const loginName = normalizeLoginName(req.body?.loginName)
    const displayName = String(req.body?.displayName || '').trim() || loginName
    const email = String(req.body?.email || '').trim().toLowerCase() || null
    const password = String(req.body?.password || '')
    const role = String(req.body?.role || 'OPERATOR').trim().toUpperCase()

    if (!loginName || !password || !assertRole(role)) {
      return res.status(400).json({ success: false, message: '请填写账号、初始密码和有效角色。' })
    }

    const db = await getDatabaseClient()
    const existing = await db.user.findFirst({
      where: { OR: [{ loginName }, ...(email ? [{ email }] : [])] },
      select: { id: true }
    })
    if (existing) {
      return res.status(409).json({ success: false, message: '账号或邮箱已存在。' })
    }

    const user = await db.user.create({
      data: {
        loginName,
        displayName,
        email,
        passwordHash: await hashPassword(password),
        memberships: { create: { organizationId: req.auth.organizationId, role } }
      }
    })
    const membership = await db.membership.findFirst({
      where: { userId: user.id, organizationId: req.auth.organizationId },
      include: { user: true }
    })
    if (!membership) throw new Error('成员创建后未找到组织关系。')

    await db.auditEvent.create({
      data: {
        organizationId: req.auth.organizationId,
        actorId: req.auth.userId,
        action: 'member.created',
        entityType: 'membership',
        entityId: membership.id,
        metadata: { loginName, role }
      }
    })
    res.status(201).json({ success: true, member: serializeMember(membership) })
  } catch (error) {
    next(error)
  }
})

router.patch('/:membershipId', async (req, res, next) => {
  if (!isAuthEnabled()) return unavailable(res)
  try {
    const role = req.body?.role ? String(req.body.role).trim().toUpperCase() : null
    const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : null
    if ((role && !assertRole(role)) || (role === null && isActive === null)) {
      return res.status(400).json({ success: false, message: '没有可保存的成员修改。' })
    }

    const db = await getDatabaseClient()
    const membership = await db.membership.findFirst({
      where: { id: req.params.membershipId, organizationId: req.auth.organizationId },
      include: { user: true }
    })
    if (!membership) return res.status(404).json({ success: false, message: '成员不存在。' })
    if (membership.userId === req.auth.userId && (isActive === false || (role && role !== 'ADMIN'))) {
      return res.status(400).json({ success: false, message: '不能停用自己或移除自己的管理员角色。' })
    }

    const updated = await db.$transaction(async (tx) => {
      if (role) await tx.membership.update({ where: { id: membership.id }, data: { role } })
      if (isActive !== null) {
        await tx.user.update({ where: { id: membership.userId }, data: { isActive } })
        if (!isActive) {
          await tx.authSession.updateMany({ where: { userId: membership.userId, revokedAt: null }, data: { revokedAt: new Date() } })
        }
      }
      return await tx.membership.findUnique({ where: { id: membership.id }, include: { user: true } })
    })

    await db.auditEvent.create({
      data: {
        organizationId: req.auth.organizationId,
        actorId: req.auth.userId,
        action: 'member.updated',
        entityType: 'membership',
        entityId: membership.id,
        metadata: { role, isActive }
      }
    })
    res.json({ success: true, member: serializeMember(updated) })
  } catch (error) {
    next(error)
  }
})

router.post('/:membershipId/reset-password', async (req, res, next) => {
  if (!isAuthEnabled()) return unavailable(res)
  try {
    const password = String(req.body?.password || '')
    if (!password) return res.status(400).json({ success: false, message: '请输入新密码。' })
    const db = await getDatabaseClient()
    const membership = await db.membership.findFirst({
      where: { id: req.params.membershipId, organizationId: req.auth.organizationId },
      select: { id: true, userId: true }
    })
    if (!membership) return res.status(404).json({ success: false, message: '成员不存在。' })

    await db.$transaction([
      db.user.update({ where: { id: membership.userId }, data: { passwordHash: await hashPassword(password) } }),
      db.authSession.updateMany({ where: { userId: membership.userId, revokedAt: null }, data: { revokedAt: new Date() } })
    ])
    await db.auditEvent.create({
      data: {
        organizationId: req.auth.organizationId,
        actorId: req.auth.userId,
        action: 'member.password_reset',
        entityType: 'membership',
        entityId: membership.id
      }
    })
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

export default router
