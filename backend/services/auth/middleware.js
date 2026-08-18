import { hasPermission } from './permissions.js'
import { getSessionAuth, isAuthEnabled, parseCookies, SESSION_COOKIE_NAME } from './session.js'

function deny(res, status, message) {
  return res.status(status).json({ success: false, error: status === 401 ? 'Unauthorized' : 'Forbidden', message })
}

export async function authenticateRequest(req, res, next) {
  if (!isAuthEnabled()) {
    req.auth = null
    next()
    return
  }

  try {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME]
    const auth = await getSessionAuth(token)
    if (!auth) {
      deny(res, 401, '登录已失效，请重新登录。')
      return
    }
    req.auth = auth
    next()
  } catch (error) {
    next(error)
  }
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!isAuthEnabled()) {
      next()
      return
    }
    if (!req.auth) {
      deny(res, 401, '请先登录。')
      return
    }
    if (!hasPermission(req.auth.role, permission)) {
      deny(res, 403, '当前账号没有此操作权限。')
      return
    }
    next()
  }
}
