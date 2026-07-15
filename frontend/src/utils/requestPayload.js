import { getSelectedImageTasks } from './imageTasks'

const TITLE_LABELS = ['title', 'product name', 'productname', '产品名', '产品名称', '标题']

const SECTION_ALIASES = {
  productName: TITLE_LABELS,
  category: ['category', '产品类目', '类目', '分类'],
  dimensions: ['dimensions', 'dimension', 'size', '尺寸', '尺寸规格', '规格', '大小'],
  material: ['material', '材质', '材质描述', '材料'],
  targetAudience: ['targetaudience', 'target audience', '目标受众', '受众'],
  sellingPoints: [
    'sellingpoints',
    'selling points',
    'sellingpoint',
    'selling point',
    '卖点',
    '卖点描述',
    '核心卖点',
    '卖点信息'
  ],
  marketplace: [
    'marketplace',
    '站点',
    '售卖地区',
    '售卖国家',
    '售卖国家地区',
    '销售地区',
    '销售国家',
    '销售国家地区'
  ]
}

function normalizeSectionLabel(label = '') {
  return String(label)
    .toLowerCase()
    .replace(/[【】\[\]()（）:：\s-]/g, '')
}

export function extractProductName(listingInfo) {
  const lines = String(listingInfo || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return ''

  const titleMatcher = new RegExp(
    `^[【\\[]?\\s*(?:${TITLE_LABELS.map((label) => label.replace(/\s+/g, '\\s*')).join('|')})\\s*[】\\]]?\\s*[:：]`,
    'i'
  )

  const titleLine = lines.find((line) => titleMatcher.test(line))

  if (titleLine) {
    return titleLine.replace(titleMatcher, '').trim().slice(0, 200)
  }

  return lines[0].replace(/^[-*\d.\s]+/, '').slice(0, 200)
}

function resolveSectionField(label = '') {
  const normalizedLabel = normalizeSectionLabel(label)

  return Object.entries(SECTION_ALIASES).find(([, aliases]) =>
    aliases.some((alias) => normalizedLabel.includes(normalizeSectionLabel(alias)))
  )?.[0]
}

export function compactObject(source) {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => {
      if (value === undefined || value === null) return false
      if (typeof value === 'string') return value.trim() !== ''
      if (Array.isArray(value)) return value.length > 0
      return true
    })
  )
}

export function parseListingInfoSections(listingInfo = '') {
  const lines = String(listingInfo || '').replace(/\r\n/g, '\n').split('\n')
  const result = {}
  let currentField = null
  let buffer = []

  const flush = () => {
    if (!currentField) return
    const value = buffer.join('\n').trim()
    if (value) {
      result[currentField] = value
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      if (currentField && buffer.length > 0) {
        buffer.push('')
      }
      continue
    }

    const separatorIndex = Math.max(line.indexOf('：'), line.indexOf(':'))

    if (separatorIndex > -1) {
      const label = line.slice(0, separatorIndex)
      const field = resolveSectionField(label)

      if (field) {
        flush()
        currentField = field
        const initialValue = line.slice(separatorIndex + 1).trim()
        buffer = initialValue ? [initialValue] : []
        continue
      }
    }

    if (currentField) {
      buffer.push(line)
    }
  }

  flush()
  return compactObject(result)
}

export function buildListingPayload(source = {}, { includeGenerationSettings = false } = {}) {
  const parsedSections = parseListingInfoSections(source.listingInfo || source.sellingPoints)
  const selectedImageTasks = getSelectedImageTasks(source.selectedImageTasks)

  const payload = {
    productName:
      source.productName ||
      parsedSections.productName ||
      extractProductName(source.listingInfo || source.sellingPoints),
    listingInfo: source.listingInfo,
    marketplace: source.marketplace || 'UK',
    imageLanguage: source.imageLanguage,
    sellingPoints: source.sellingPoints || parsedSections.sellingPoints || source.listingInfo,
    additionalInfo: source.additionalInfo,
    fontPreference: source.fontPreference,
    brandColorMode: source.brandColorMode,
    brandColor: source.brandColorMode === 'manual' ? source.brandColor : undefined,
    designNotes: source.designNotes,
    category: source.category || parsedSections.category,
    dimensions: source.dimensions || parsedSections.dimensions,
    material: source.material || parsedSections.material,
    targetAudience: source.targetAudience || parsedSections.targetAudience,
    selectedImageTasks
  }

  if (includeGenerationSettings) {
    payload.imageType = source._meta?.strategyUsed || source.imageType || 'basic'
    payload.complexity = source.complexity || 'L2'
  }

  return compactObject(payload)
}

export function buildAnalyzeRequest(listing = {}, referenceImages = []) {
  const parsedSections = parseListingInfoSections(listing.listingInfo || listing.sellingPoints)
  const selectedImageTasks = getSelectedImageTasks(listing.selectedImageTasks)

  return compactObject({
    productName:
      listing.productName ||
      parsedSections.productName ||
      extractProductName(listing.listingInfo || listing.sellingPoints),
    listingInfo: listing.listingInfo,
    marketplace: listing.marketplace || 'UK',
    imageLanguage: listing.imageLanguage,
    sellingPoints: listing.sellingPoints || parsedSections.sellingPoints || listing.listingInfo,
    additionalInfo: listing.additionalInfo,
    fontPreference: listing.fontPreference,
    brandColorMode: listing.brandColorMode,
    brandColor: listing.brandColorMode === 'manual' ? listing.brandColor : undefined,
    designNotes: listing.designNotes,
    category: listing.category || parsedSections.category,
    dimensions: listing.dimensions || parsedSections.dimensions,
    material: listing.material || parsedSections.material,
    targetAudience: listing.targetAudience || parsedSections.targetAudience,
    complexity: listing.complexity || 'L2',
    selectedImageTasks,
    referenceImages
  })
}

export function buildPlanPayload(plan = {}) {
  return compactObject({
    id: plan.id,
    name: plan.name,
    type: plan.type,
    taskType: plan.taskType,
    taskKey: plan.taskKey,
    purpose: plan.purpose,
    prompt: plan.prompt,
    promptEn: plan.promptEn,
    promptDirty: plan.promptDirty ? true : undefined
  })
}

export function buildGenerateRequest(sourceListing = {}, plan = {}, resolution, referenceImages = []) {
  const imageType = sourceListing._meta?.strategyUsed || sourceListing.imageType || 'basic'
  const complexity = sourceListing.complexity || 'L2'

  return compactObject({
    listing: buildListingPayload(sourceListing),
    imagePlans: [buildPlanPayload(plan)],
    imageType,
    complexity,
    resolution,
    referenceImages
  })
}
