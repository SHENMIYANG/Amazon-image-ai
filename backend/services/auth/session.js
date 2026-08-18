import crypto from 'crypto'
import { getDatabaseClient, isPersistenceEnabled } from '../persistence/client.js'

export const SESSION_COOKIE_NAME = 'amazon_image_session'

function getSessionDays() {
  const days = Number(process.env.AUTH_SESSION_DAYS || 14)
  return Number.isFinite(days) ? Math.max(1, Math.min(90, days)) : 14
}

export function isAuthEnabled() {
  return isPersistenceEnabled() && process.env.AUTH_ENABLED !== 'false'
}

export function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

export function parseCookies(header = '') {
  return String(header || '').split(';').reduce((cookies, segment) => {
    const separator = segment.indexOf('=')
    if (separator < 0) return cookies
    const name = segment.slice(0, separator).trim()
    const value = segment.slice(separator + 1).trim()
    if (name) cookies[name] = decodeURIComponent(value)
    return cookies
  }, {})
}

export function setSessionCookie(res, token, expiresAt) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.append('Set-Cookie', [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
    secure
  ].filter(Boolean).join('; '))
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.append('Set-Cookie', [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    secure
  ].filter(Boolean).join('; '))
}

export async function createSession(userId) {
  const db = await getDatabaseClient()
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + getSessionDays() * 24 * 60 * 60 * 1000)
  await db.authSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt
    }
  })
  return { token, expiresAt }
}

export async function getSessionAuth(token) {
  if (!token || !isAuthEnabled()) return null
  const db = await getDatabaseClient()
  const session = await db.authSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          memberships: {
            include: { organization: true },
            orderBy: { createdAt: 'asc' },
            take: 1
          }
        }
      }
    }
  })
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user?.isActive) return null

  const membership = session.user.memberships[0]
  if (!membership) return null

  await db.authSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() }
  })

  return {
    userId: session.user.id,
    loginName: session.user.loginName,
    email: session.user.email,
    displayName: session.user.displayName,
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    role: membership.role,
    sessionId: session.id
  }
}

export async function revokeSession(token) {
  if (!token || !isPersistenceEnabled()) return
  const db = await getDatabaseClient()
  await db.authSession.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date() }
  })
}
