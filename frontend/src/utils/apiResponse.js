function buildNonJsonResponseMessage(label, response, rawText) {
  const trimmed = String(rawText || '').trim()
  const looksLikeHtml = trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.startsWith('<')
  const suffix = response?.status ? `（HTTP ${response.status}）` : ''

  if (looksLikeHtml) {
    return `${label}返回了 HTML 页面${suffix}，通常是后端未启动、接口路由未命中，或代理/Nginx 转发异常。`
  }

  const preview = trimmed ? trimmed.slice(0, 180) : '空响应'
  return `${label}返回的不是 JSON${suffix}：${preview}`
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
    const error = new Error(data?.message || `${label}失败（HTTP ${response.status}）`)
    error.status = response.status
    error.emptyResponse = !String(rawText || '').trim()
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
