function buildNonJsonResponseMessage(label, response, rawText) {
  const trimmed = String(rawText || '').trim()
  const looksLikeHtml =
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<')
  const suffix = response?.status ? `（HTTP ${response.status}）` : ''

  if (looksLikeHtml) {
    return `${label}返回了 HTML 页面${suffix}，通常是后端未启动、接口路由未命中，或代理/Nginx 转发异常。`
  }

  const preview = trimmed ? trimmed.slice(0, 180) : '空响应'
  return `${label}返回的不是 JSON${suffix}：${preview}`
}

function getHttpStatusMessage(status) {
  const statusMessages = {
    400: '请求参数不完整或格式不正确，请检查产品信息、图片任务和上传图片。',
    401: '接口鉴权失败，API Key 无效、过期或服务器环境变量没有生效。',
    403: '接口权限不足，当前 Key 或账号没有访问该模型/接口的权限。',
    404: '接口地址不存在，可能是前端代理、Nginx 转发或后端路由配置不正确。',
    408: '请求等待超时，服务器还没拿到完整结果。',
    413: '提交内容过大，请减少图片数量或压缩过长的文本。',
    429: '接口请求过于频繁或额度不足，请稍后再试或检查 API 后台限流。',
    500: '后端内部错误，请查看服务器日志里的 agent-analyze 错误详情。',
    502: '网关或上游服务异常，通常是 Nginx 无法连接后端或上游模型服务临时不可用。',
    503: '服务暂时不可用，可能是后端重启中或上游模型服务拥堵。',
    504: '网关等待超时，后端或上游模型处理时间超过代理限制。'
  }

  return statusMessages[status] || `请求失败（HTTP ${status}）。`
}

export function formatApiError(error, label = '请求') {
  const status = Number(error?.status || error?.statusCode || 0)
  const rawMessage = String(error?.message || '').trim()

  if (status) {
    const statusMessage = getHttpStatusMessage(status)
    if (rawMessage && rawMessage !== statusMessage && !rawMessage.includes(`HTTP ${status}`)) {
      return `${label}失败（HTTP ${status}）：${rawMessage}`
    }
    return `${label}失败（HTTP ${status}）：${statusMessage}`
  }

  if (error?.name === 'AbortError') {
    return `${label}被浏览器中断或等待超时，请确认服务器还在处理，避免重复点击。`
  }

  if (rawMessage === 'Failed to fetch') {
    return `${label}无法连接服务器。常见原因：后端服务未启动、Nginx 代理中断、HTTPS/跨域连接失败，或请求等待期间连接被断开。`
  }

  return rawMessage || `${label}失败，请检查服务器日志。`
}

export async function parseApiJson(response, label) {
  const contentType = response.headers.get('content-type') || ''
  const rawText = await response.text()
  let data = null

  if (rawText) {
    if (contentType.includes('application/json')) {
      try {
        data = JSON.parse(rawText)
      } catch {
        const error = new Error(`${label}返回了损坏的 JSON，请检查后端响应格式。`)
        error.status = response.status
        error.emptyResponse = false
        throw error
      }
    } else {
      const trimmed = rawText.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          data = JSON.parse(trimmed)
        } catch {
          const error = new Error(buildNonJsonResponseMessage(label, response, rawText))
          error.status = response.status
          error.emptyResponse = !trimmed
          throw error
        }
      } else {
        const error = new Error(buildNonJsonResponseMessage(label, response, rawText))
        error.status = response.status
        error.emptyResponse = !trimmed
        throw error
      }
    }
  }

  if (!response.ok) {
    const backendMessage = data?.message || data?.error || ''
    const error = new Error(backendMessage || getHttpStatusMessage(response.status))
    error.status = response.status
    error.emptyResponse = !String(rawText || '').trim()
    error.responseData = data
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'))
    }
    throw error
  }

  if (!data) {
    const error = new Error(`${label}返回为空，请检查后端服务。`)
    error.status = response.status
    error.emptyResponse = true
    throw error
  }

  return data
}
