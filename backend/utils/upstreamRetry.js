import axios from 'axios'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function isTransientUpstreamError(error) {
  const status = Number(error?.status || error?.response?.status || 0)
  const code = String(error?.code || error?.cause?.code || '').toUpperCase()
  const message = String(error?.message || '').toLowerCase()

  return (
    [408, 409, 429, 500, 502, 503, 504].includes(status) ||
    ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ECONNABORTED'].includes(code) ||
    message.includes('timeout') ||
    message.includes('socket hang up') ||
    message.includes('connection reset')
  )
}

export async function withUpstreamRetry(task, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 2))
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs || 1200))

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task(attempt)
    } catch (error) {
      const shouldRetry = attempt < maxAttempts && isTransientUpstreamError(error)
      if (!shouldRetry) throw error
      await wait(retryDelayMs)
    }
  }

  throw new Error('Upstream request did not complete after retrying')
}

export async function postJsonWithRetry(url, data, config = {}, retryOptions = {}) {
  return withUpstreamRetry(
    () => axios.post(url, data, config),
    retryOptions
  )
}
