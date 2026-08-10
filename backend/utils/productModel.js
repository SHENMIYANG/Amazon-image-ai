export function getMarketplaceLanguage(marketplace = 'UK') {
  const languageMap = {
    US: 'English',
    UK: 'English',
    CA: 'English',
    AU: 'English',
    DE: 'German',
    FR: 'French',
    IT: 'Italian',
    ES: 'Spanish',
    JP: 'Japanese',
    NL: 'Dutch',
    SE: 'Swedish',
    PL: 'Polish'
  }

  return languageMap[marketplace] || 'English'
}

export function normalizeStringArray(value, max = 8, maxItemLength = 0) {
  return Array.isArray(value)
    ? value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .map((item) => (maxItemLength > 0 ? item.slice(0, maxItemLength) : item))
        .slice(0, max)
    : []
}

export function normalizeConfidenceValue(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  if (numeric < 0) return 0
  if (numeric > 1) return 1
  return numeric
}

export function inferArchetype(sourceText = '') {
  const text = String(sourceText || '').toLowerCase()

  if (/(clamp|clip|bracket)/.test(text)) return 'Clamp Mounted Device'
  if (/(hook|hang|hanging)/.test(text)) return 'Hanging Device'
  if (/(adhesive|stick-on|sticky)/.test(text)) return 'Adhesive Mounted Device'
  if (/(magnetic|magnet)/.test(text)) return 'Magnetic Mounted Device'
  if (/(wall mount|wall-mounted|wall mounted)/.test(text)) return 'Wall Mounted Device'
  if (/(wearable|watch|glasses|helmet|bracelet|ring)/.test(text)) return 'Wearable Product'
  if (/(handheld|portable|manual)/.test(text)) return 'Handheld Product'

  return 'Standing Product'
}
