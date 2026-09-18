const buckets = new Map()
const activeRequests = new Map()

function prune(map, now) {
  for (const [key, value] of map) {
    if (value.expiresAt <= now || value.count <= 0) map.delete(key)
  }
}

export function rateLimit({ name, max, windowMs, key = (req) => req.ip } = {}) {
  return (req, res, next) => {
    const now = Date.now()
    prune(buckets, now)
    const bucketKey = `${name}:${key(req) || 'anonymous'}`
    const bucket = buckets.get(bucketKey) || { count: 0, expiresAt: now + windowMs }
    bucket.count += 1
    buckets.set(bucketKey, bucket)
    if (bucket.count > max) {
      res.set('Retry-After', String(Math.ceil((bucket.expiresAt - now) / 1000)))
      return res.status(429).json({ success: false, message: '请求过于频繁，请稍后再试。' })
    }
    next()
  }
}

export function concurrencyLimit({ name, max, key = (req) => req.auth?.userId || req.ip } = {}) {
  return (req, res, next) => {
    const requestKey = `${name}:${key(req) || 'anonymous'}`
    const activeCount = activeRequests.get(requestKey) || 0
    if (activeCount >= max) return res.status(429).json({ success: false, message: '已有同类任务正在处理，请完成后再试。' })

    activeRequests.set(requestKey, activeCount + 1)
    let released = false
    const release = () => {
      if (released) return
      released = true
      const nextCount = (activeRequests.get(requestKey) || 1) - 1
      if (nextCount > 0) activeRequests.set(requestKey, nextCount)
      else activeRequests.delete(requestKey)
    }
    res.once('finish', release)
    res.once('close', release)
    next()
  }
}
