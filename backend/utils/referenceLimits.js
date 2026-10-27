export function getMaxReferenceImages() {
  const configured = Number(process.env.IMAGE_MAX_REFERENCE_IMAGES || 8)
  return Number.isFinite(configured) ? Math.max(1, Math.min(8, Math.floor(configured))) : 8
}

export function assertReferenceBudget(productImages = [], extraCount = 0) {
  if (!Array.isArray(productImages)) throw Object.assign(new Error('产品参考图必须是数组。'), { statusCode: 400 })
  const count = new Set(productImages.filter(Boolean)).size + extraCount
  const max = getMaxReferenceImages()
  if (count > max) {
    throw Object.assign(new Error(`本次生图需 ${count} 张参考图，最多支持 ${max} 张。请将产品图减少到 ${Math.max(0, max - extraCount)} 张后再分析；模板和重绘参考图也占用名额。`), { statusCode: 400 })
  }
}
