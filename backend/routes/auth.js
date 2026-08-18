import express from 'express'
import { getDatabaseClient } from '../services/persistence/client.js'
import { verifyPassword } from '../services/auth/password.js'
import {
  clearSessionCookie,
  createSession,
  getSessionAuth,
  isAuthEnabled,
  parseCookies,
  revokeSession,
  SESSION_COOKIE_NAME,
  setSessionCookie
} from '../services/auth/session.js'

const router = express.Router()

function unavailable(res) {
  return res.status(503).json({ success: false, message: '登录功能需要先配置并迁移 PostgreSQL。' })
}

router.get('/me', async (req, res, next) => {
  if (!isAuthEnabled()) return unavailable(res)
  try {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME]
    const auth = await getSessionAuth(token)
    if (!auth) {
      return res.status(401).json({ success: false, message: '未登录或登录已失效。' })
    }
    res.json({ success: true, user: auth })
  } catch (error) {
    next(error)
  }
})

router.post('/login', async (req, res, next) => {
  if (!isAuthEnabled()) return unavailable(res)
  try {
    const loginName = String(req.body?.loginName || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    if (!loginName || !password) {
      return res.status(400).json({ success: false, message: '请输入账号和密码。' })
    }

    const db = await getDatabaseClient()
    const user = await db.user.findFirst({
      where: {
        OR: [
          { loginName },
          { email: loginName }
        ]
      }
    })
    if (!user?.isActive || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ success: false, message: '账号或密码不正确。' })
    }

    const { token, expiresAt } = await createSession(user.id)
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    const auth = await getSessionAuth(token)
    if (!auth) throw new Error('登录会话创建失败。')

    await db.auditEvent.create({
      data: {
        organizationId: auth.organizationId,
        actorId: user.id,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id
      }
    })

    setSessionCookie(res, token, expiresAt)
    res.json({ success: true, user: auth })
  } catch (error) {
    next(error)
  }
})

router.post('/logout', async (req, res, next) => {
  try {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME]
    if (isAuthEnabled() && token) await revokeSession(token)
    clearSessionCookie(res)
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

export default router
