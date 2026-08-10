import express from 'express'
import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import {
  getMarketplaceLanguage,
  inferArchetype,
  normalizeStringArray
} from '../utils/productModel.js'
import { translatePlanPromptIfNeeded } from './generate.js'
import { readUploadFileBufferWithRetry, resolveUploadPathFromUrl } from '../utils/uploads.js'

const router = express.Router()

const MAIN_IMAGE_STRATEGY_ZH = [
  '【目的】提升点击率（CTR）。',
  '【构图】产品完整展示，主体占画面约 85%，居中摆放。',
  '【背景】纯白背景（RGB 255,255,255）。',
  '【文字】无文字。',
  '【Logo】无 Logo（除产品本身自带品牌）。',
  '【元素】除产品及产品标配配件外，不添加任何装饰元素。',
  '【要求】突出产品主体，边缘清晰，光线自然，阴影真实，符合 Amazon 主图规范。'
].join('\n')

const MAIN_IMAGE_STRATEGY_EN = [
  'Goal: Increase click-through rate (CTR).',
  'Composition: Show the complete product centered, with the product occupying about 85% of the frame.',
  'Background: Pure white background (RGB 255,255,255).',
  'Text: No text.',
  'Logo: No logo except any real logo already printed on the product itself.',
  'Elements: Do not add any decorative elements beyond the product and its confirmed included accessories.',
  'Requirements: Keep the product dominant, edges clear, lighting natural, shadows realistic, and the result compliant with Amazon main-image rules.'
].join('\n')

const IMAGE_TASK_LIBRARY = {
  main: {
    defaultName: 'Main Image',
    purpose: 'Follow Amazon main-image rules and improve click-through rate',
    guidance: 'Pure white background, full product visible, no text, no decorative props'
  },
  feature: {
    defaultName: 'Feature Image',
    purpose: 'Prove one buying reason with the right amount of related selling-point evidence',
    guidance: 'Let the selected product facts decide how many related points appear; keep the product and visual proof dominant'
  },
  scenario: {
    defaultName: 'Scenario Image',
    purpose: 'Show real-use proof, not just atmosphere',
    guidance: 'Answer who uses it, where it is used, what action happens, what need it solves, and what result the buyer sees'
  },
  detail: {
    defaultName: 'Detail Image',
    purpose: 'Show material, structure, craftsmanship, or important close-up details',
    guidance: 'Use close-ups to strengthen trust without changing the product'
  },
  dimensions: {
    defaultName: 'Dimension Image',
    purpose: 'Explain size, scale, and fit to reduce return risk',
    guidance: 'Use clear measurements, scale reference, and simple annotation'
  },
  steps: {
    defaultName: 'Steps Image',
    purpose: 'Explain installation or usage steps and reduce understanding cost',
    guidance: 'Keep order clear and avoid overloading one image with too many steps'
  },
  comparison: {
    defaultName: 'Comparison Image',
    purpose: 'Highlight differentiation or before-versus-after value',
    guidance: 'Use truthful comparison and avoid unsupported superiority claims'
  },
  package: {
    defaultName: 'Package Image',
    purpose: 'Show box contents and included accessories clearly',
    guidance: 'Only show confirmed included items'
  },
  summary: {
    defaultName: 'Summary Image',
    purpose: 'Reinforce value, trust, or final buying reasons',
    guidance: 'Work as a clean closing image that summarizes key value'
  }
}

async function createAgentCompletion(openai, requestOptions) {
  return await openai.chat.completions.create(requestOptions)
}

function createAgentRequestId() {
  return `agent-${Date.now()}-${Math.round(Math.random() * 1000000)}`
}

function getErrorStatus(error) {
  return Number(error?.status || error?.statusCode || error?.response?.status || 500)
}

function logAgentAnalyze(phase, data = {}) {
  console.info('[agent-analyze]', {
    phase,
    ...data
  })
}

function getDefaultSelectedImageTasks() {
  return [
    { type: 'main', count: 1 },
    { type: 'feature', count: 2 },
    { type: 'scenario', count: 1 },
    { type: 'detail', count: 1 },
    { type: 'dimensions', count: 1 },
    { type: 'summary', count: 1 }
  ]
}

function normalizeSelectedImageTasks(selectedImageTasks = []) {
  const source = Array.isArray(selectedImageTasks) && selectedImageTasks.length > 0
    ? selectedImageTasks
    : getDefaultSelectedImageTasks()

  return source
    .map((item) => {
      const type = item?.type
      const count = Math.max(0, Math.min(6, Number(item?.count || 0)))
      if (!IMAGE_TASK_LIBRARY[type] || count === 0) return null
      return { type, count }
    })
    .filter(Boolean)
}

function expandSelectedImageTasks(selectedImageTasks = []) {
  const normalized = normalizeSelectedImageTasks(selectedImageTasks)
  const expanded = []

  normalized.forEach((item) => {
    const meta = IMAGE_TASK_LIBRARY[item.type]
    for (let index = 1; index <= item.count; index += 1) {
      expanded.push({
        taskType: item.type,
        taskKey: `${item.type}-${index}`,
        name: item.count > 1 ? `${meta.defaultName} ${index}` : meta.defaultName,
        purpose: meta.purpose,
        guidance: meta.guidance
      })
    }
  })

  return expanded
}

function getTargetImageLanguage({ marketplace = 'UK', imageLanguage } = {}) {
  return imageLanguage || getMarketplaceLanguage(marketplace)
}

function getFontStyleLabel(fontPreference = 'auto') {
  const fontMap = {
    auto: 'auto-matched font style',
    'geometric-sans': 'geometric sans-serif',
    'bold-sans': 'bold sans-serif',
    'elegant-serif': 'elegant serif',
    'rounded-playful': 'rounded playful font',
    'handwritten-playful': 'playful handwritten font'
  }

  return fontMap[fontPreference] || 'auto-matched font style'
}

function getBrandColorLabel(brandColorMode, brandColor) {
  if (brandColorMode === 'manual' && brandColor) {
    return `manual brand color ${brandColor}`
  }

  return 'auto brand color'
}

function trimForModel(value = '') {
  return String(value || '').trim()
}

function buildDedupedContext(values = []) {
  const normalizedValues = []
  const segments = []

  values.forEach((value) => {
    const text = cleanContextSegment(value)
    if (!text) return

    const normalized = normalizeContextSegment(text)
    const isCovered = normalizedValues.some((existing) => existing.includes(normalized))
    if (isCovered) return

    segments.push(text)
    normalizedValues.push(normalized)
  })

  return segments.join(' ')
}

function cleanContextSegment(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeContextSegment(value = '') {
  return cleanContextSegment(value).toLowerCase()
}

function buildProductSignals(sourceText = '') {
  const text = String(sourceText || '').toLowerCase()

  return {
    archetype: inferArchetype(text),
    hasFlexibleArm: /(gooseneck|flexible neck|flexible arm|adjustable arm)/.test(text),
    hasCable: /(cable|wire|cord|usb)/.test(text),
    hasController: /(controller|dimmer|switch|remote|control box|inline control|line control|调光|控制盒|控制器|线控|开关)/.test(text),
    hasTimingFunction: /(timer|countdown|hourglass|sandglass|sanduhr|sanduhren|sand timer|计时|倒计时|沙漏)/.test(text),
    hasBulb: /(bulb|uva|uvb|led|lamp head|light head)/.test(text),
    hasInteriorTarget: /(tank|terrarium|aquarium|enclosure|inside)/.test(text)
  }
}

async function buildImageContentParts(primaryReferenceImageUrl = '', referenceImages = []) {
  const contentParts = []
  const normalizedReferenceImages = Array.isArray(referenceImages) ? referenceImages.filter(Boolean) : []
  const orderedReferenceImages = []

  if (primaryReferenceImageUrl && normalizedReferenceImages.includes(primaryReferenceImageUrl)) {
    orderedReferenceImages.push(primaryReferenceImageUrl)
  }

  normalizedReferenceImages.forEach((imageUrl) => {
    if (imageUrl !== primaryReferenceImageUrl) {
      orderedReferenceImages.push(imageUrl)
    }
  })

  for (const [index, imageUrl] of orderedReferenceImages.slice(0, 8).entries()) {
    const imagePath = resolveUploadPathFromUrl(imageUrl)
    if (!imagePath || !fs.existsSync(imagePath)) continue

    contentParts.push({
      type: 'text',
      text:
        index === 0 && primaryReferenceImageUrl
          ? 'Reference image 1 is the explicit primary product image and the highest authority for product truth.'
          : `Reference image ${index + 1} is a supporting product image and may only supplement understanding.`
    })

    const ext = path.extname(imagePath).toLowerCase()
    const mimeType =
      ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
    const fileBuffer = await readUploadFileBufferWithRetry(imagePath, {
      attempts: 4,
      delayMs: 220
    })

    contentParts.push({
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${fileBuffer.toString('base64')}`
      }
    })
  }

  return contentParts
}

function normalizeLineList(value = '', maxItems = 6, maxItemLength = 160) {
  return String(value || '')
    .split('\n')
    .map((item) => item.replace(/^[\s\d\-*\.\[\]\(\)（）【】•·:：、]+/, '').trim())
    .filter(Boolean)
    .filter((item, index, source) => source.findIndex((candidate) => candidate === item) === index)
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxItemLength))
}

function compactObject(source = {}) {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => {
      if (value === undefined || value === null) return false
      if (typeof value === 'string') return value.trim() !== ''
      if (Array.isArray(value)) return value.length > 0
      if (typeof value === 'object') return Object.keys(value).length > 0
      return true
    })
  )
}

function isMountedArchetype(archetype = '') {
  return [
    'Clamp Mounted Device',
    'Hanging Device',
    'Adhesive Mounted Device',
    'Magnetic Mounted Device',
    'Wall Mounted Device'
  ].includes(archetype)
}

function splitProductItems(value = '', maxItems = 16) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split(/[|,，、;；\n]/)
    .map((item) => item.replace(/^[\s\d\-*.(（【]+/, '').replace(/[)）】]\s*$/, '').trim())
    .map((item) => item.replace(/\s*\(\s*\d+[^)]*\)\s*$/g, '').trim())
    .filter((item) => item.length >= 2)
    .filter((item, index, source) => source.findIndex((candidate) => candidate === item) === index)
    .slice(0, maxItems)
}

function extractIncludedItems(sourceText = '') {
  const text = String(sourceText || '')
  const matches = [
    text.match(/产品包含[:：]\s*([^\n]+)/),
    text.match(/包含[:：]\s*([^\n]+)/),
    text.match(/included items?[:：]\s*([^\n]+)/i),
    text.match(/contents?[:：]\s*([^\n]+)/i)
  ].filter(Boolean)

  if (matches.length === 0) return []
  return splitProductItems(matches[0][1])
}

function hasExplicitGiftBundle(sourceText = '', includedItems = []) {
  const text = String(sourceText || '').toLowerCase()
  return (
    /(gift box|gift set|geschenkset|礼盒|礼品盒|礼物盒)/.test(text) ||
    includedItems.some((item) => /(gift box|geschenkbox|礼盒|礼品盒|包装盒)/i.test(item))
  )
}

function inferFallbackParts({ context = '', listingText = '', materialItems = [], signals = {} } = {}) {
  const text = String(context || '').toLowerCase()
  const parts = []
  const add = (part) => {
    if (part && !parts.includes(part)) parts.push(part)
  }

  const explicitIncludedItems = extractIncludedItems(context)
  explicitIncludedItems.forEach(add)

  if (/(hourglass|sandglass|sanduhr|sanduhren|sand timer|沙漏)/.test(text)) {
    add('hourglass timer body')
    add('transparent glass')
    add('top and bottom caps')
    add('colored sand')
    add('printed time marks')
  }

  if (hasExplicitGiftBundle(listingText, explicitIncludedItems)) {
    add('gift box')
    add('included gift items')
  }

  if (/(wrench|spanner|扳手)/.test(text)) {
    add('tool body')
    add('working openings')
    add('handle')
  }

  if (/(glove|gloves|手套)/.test(text)) {
    add('included gloves')
  }

  if (/(lamp|light|head|灯头|灯)/.test(text)) add('lamp head')
  if (signals?.hasFlexibleArm) add('flexible arm')
  if (signals?.archetype === 'Clamp Mounted Device') add('clamp')
  if (signals?.hasCable) add('power cable')
  if (signals?.hasController) add('controller')
  if (signals?.hasBulb) add('light source')

  materialItems.forEach((materialItem) => {
    if (/(handle|握把|手柄)/i.test(materialItem)) add('handle')
    if (/(glass|玻璃)/i.test(materialItem)) add('glass part')
    if (/(wood|木|holz)/i.test(materialItem)) add('wood part')
  })

  return parts.slice(0, 12)
}

function inferBundleItems({ context = '', parts = [], explicitIncludedItems = [] } = {}) {
  const rawContext = String(context || '')

  if (explicitIncludedItems.length > 0) return explicitIncludedItems

  const quantityMatch = rawContext.match(/(?:^|[\s【(（])(\d{1,2})\s*(?:stück|stuck|pcs?|pieces?|piece|pack|set|件套|件|个|只|支|片|双|套)\b/i) ||
    rawContext.match(/(\d{1,2})\s*(?:er|er-set|er set|teilig|teiliges|teiliges set)/i)
  const quantity = quantityMatch ? Number(quantityMatch[1]) : 0
  const title =
    rawContext.match(/(?:产品名称|Product Name)[:：]\s*([^\n]+)/i)?.[1]?.trim() ||
    rawContext.match(/^([^\n。；;]{6,160})/)?.[1]?.trim() ||
    ''
  const productType = title
    .replace(/^\s*\d{1,2}\s*(?:stück|stuck|pcs?|pieces?|piece|pack|set|件套|件|个|只|支|片|双|套|er|teilig|teiliges)\s*/i, '')
    .replace(/^(bunte|colorful|multi[-\s]?color|complete|komplettes|完整|彩色|多色|一套|套装)\s*/i, '')
    .replace(/[，,].*$/, '')
    .trim() || '已确认套装单品'

  if (quantity > 1 && quantity <= 20 && /(set|kit|pack|bundle|套装|组合|件套|stück|teilig|geschenkset|gift set)/i.test(rawContext)) {
    return Array.from({ length: quantity }, (_, index) => `第${index + 1}件：${productType}`)
  }

  if (parts.includes('tool body') && parts.includes('included gloves')) {
    return ['扳手', '手套']
  }
  if (parts.includes('gift box') || parts.includes('included gift items')) {
    return ['礼盒', '已确认套装单品']
  }

  return []
}

function inferBundleQuantity(context = '', explicitIncludedItems = []) {
  if (explicitIncludedItems.length > 1) return String(explicitIncludedItems.length)

  const rawContext = String(context || '')
  const quantityMatch = rawContext.match(/(?:^|[\s【(（])(\d{1,2})\s*(?:stück|stuck|pcs?|pieces?|piece|pack|set|件套|件|个|只|支|片|双|套)\b/i) ||
    rawContext.match(/(\d{1,2})\s*(?:er|er-set|er set|teilig|teiliges|teiliges set)/i)
  const quantity = quantityMatch ? Number(quantityMatch[1]) : 0

  if (quantity > 1 && quantity <= 20 && /(set|kit|pack|bundle|套装|组合|件套|stück|teilig|geschenkset|gift set)/i.test(rawContext)) {
    return String(quantity)
  }

  return ''
}

function sanitizeBundleItems(items = [], fallbackItems = [], context = '') {
  const explicitIncludedItems = extractIncludedItems(context)
  const allowGift = hasExplicitGiftBundle(context, explicitIncludedItems)
  const structuralNoise = /(transparent glass|top and bottom caps|colored sand|printed time marks|glass part|wood part|hourglass timer body|透明玻璃|木盖|底座|细沙|印刷文字|瓶身|流沙通道)/i
  const giftNoise = /(gift box|included gift items|geschenkbox|礼盒|礼物|礼品盒|包装盒)/i
  const source = normalizeStringArray(items, 16, 100).length > 0
    ? normalizeStringArray(items, 16, 100)
    : fallbackItems

  return source
    .filter((item) => !structuralNoise.test(item))
    .filter((item) => allowGift || !giftNoise.test(item))
    .filter((item, index, list) => list.findIndex((candidate) => candidate === item) === index)
    .slice(0, 16)
}

function buildFallbackProductRules({ parts = [], signals = {}, context = '' } = {}) {
  const text = String(context || '').toLowerCase()
  const mustKeep = []
  const forbidden = [
    '不得新增未确认配件、结构、品牌Logo、认证或绝对性承诺',
    '不得改变产品颜色、比例、材质外观和已确认数量'
  ]

  if (parts.length > 0) {
    mustKeep.push(`必须保留真实产品部件：${parts.slice(0, 8).join('、')}`)
  }

  if (/(hourglass|sandglass|sanduhr|sanduhren|sand timer|沙漏)/.test(text)) {
    mustKeep.push('必须保持沙漏的玻璃、上下盖、彩色细沙和分钟印字真实一致')
    forbidden.push('不得添加电子屏、按钮、电池、线缆或未确认收纳盒')
  }

  if (parts.includes('gift box') || parts.includes('included gift items')) {
    mustKeep.push('套装产品必须保持已确认件数、配件和包装关系')
    forbidden.push('不得少件、换件或新增未确认礼品')
  }

  if (/(wrench|spanner|扳手)/.test(text)) {
    mustKeep.push('工具开口、握把、厚度、印字和配件必须与参考图一致')
    forbidden.push('不得把工具开口画变形，不得让工具与螺丝或车架穿模')
  }

  if (signals?.archetype === 'Clamp Mounted Device') {
    mustKeep.push('夹持结构、受力接触点和内外位置关系必须清楚可见')
    forbidden.push('不得悬空、穿透、融合到支撑面里')
  }

  return {
    mustKeep: [...new Set(mustKeep)].slice(0, 8),
    forbidden: [...new Set(forbidden)].slice(0, 8)
  }
}

function sanitizeMainParts(parts = [], fallbackParts = [], signals = {}) {
  const normalized = normalizeStringArray(parts, 12, 80)
    .filter((part) => !(part.toLowerCase() === 'controller' && !signals?.hasController))
    .filter((part) => !/^product$/i.test(part))

  if (normalized.length === 0) return fallbackParts
  if (normalized.length === 1 && normalized[0].toLowerCase() === 'controller') return fallbackParts
  return normalized
}

function extractImageCopy(strategyContent = '', maxItems = 8) {
  const text = String(strategyContent || '')
  const candidates = []
  const copyLinePattern = /(文案|标题|副文案|副标题|小标签|标签)[^。\n；;:：]*[:：]?([^。\n；;]+)/g
  let lineMatch

  while ((lineMatch = copyLinePattern.exec(text)) !== null) {
    const fragment = lineMatch[2] || ''
    const quoted = [...fragment.matchAll(/[“"「『]([^”"」』]{2,80})[”"」』]/g)].map((match) => match[1])
    if (quoted.length > 0) {
      candidates.push(...quoted)
    } else {
      splitProductItems(fragment, 10).forEach((item) => candidates.push(item))
    }
  }

  return candidates
    .map((item) => item.replace(/^允许[:：]?\s*/, '').trim())
    .filter((item) => item.length >= 2 && item.length <= 80)
    .filter((item) => !/[。；;]$/.test(item))
    .filter((item, index, source) => source.findIndex((candidate) => candidate === item) === index)
    .slice(0, maxItems)
}

function isFullSetTask(taskType = '', strategyContent = '', imageProductUsage = {}) {
  const strategy = String(strategyContent || '')
  if (imageProductUsage.displayMode === 'full_set') return true
  if (['package', 'summary', 'dimensions', 'comparison'].includes(taskType)) return true
  return /(全套|套装|全部|所有|完整展示|清单|盒内|包装|件套|\d+\s*个|\d+\s*件|full set|complete set|all pieces|all items|show all|6-piece|6 piece)/i.test(strategy)
}

function shouldUseQuantityRuleForTask(rule = '', strategyContent = '', taskType = '', imageProductUsage = {}) {
  const text = String(rule || '')
  const hasQuantityLanguage =
    /(数量|全套|套装|全部|所有|独立.*组成|组成的套装|不能多也不能少|不可减少或增加|\d+\s*个|\d+\s*件|\d+\s*只|\d+\s*片)/.test(text) ||
    /(show exactly|full set|complete set|all pieces|all items|six hourglasses|6 hourglasses|6-piece|6 piece)/i.test(text)

  if (!hasQuantityLanguage) return true
  return isFullSetTask(taskType, strategyContent, imageProductUsage)
}

function getUsageReasonByMode(displayMode = '') {
  switch (displayMode) {
    case 'full_set':
      return '这张图需要展示完整套装或完整到手内容。'
    case 'single_item':
      return '这张图只需要展示当前场景正在使用的单个产品或必要配件。'
    case 'detail_part':
      return '这张图展示真实局部细节，不需要展示全套。'
    case 'selected_items':
    default:
      return '这张图按当前购买理由选择需要出现的产品或配件。'
  }
}

function normalizeImageProductUsage(value = {}, fallback = {}) {
  const candidate = value && typeof value === 'object' ? value : {}
  const displayModes = new Set(['full_set', 'selected_items', 'single_item', 'detail_part'])
  const displayMode = displayModes.has(candidate.displayMode) ? candidate.displayMode : fallback.displayMode

  return compactObject({
    displayMode,
    requiredItems:
      normalizeStringArray(candidate.requiredItems, 12, 100).length > 0
        ? normalizeStringArray(candidate.requiredItems, 12, 100)
        : normalizeStringArray(fallback.requiredItems, 12, 100),
    optionalItems:
      normalizeStringArray(candidate.optionalItems, 12, 100).length > 0
        ? normalizeStringArray(candidate.optionalItems, 12, 100)
        : normalizeStringArray(fallback.optionalItems, 12, 100),
    doNotShowAsIncluded:
      normalizeStringArray(candidate.doNotShowAsIncluded, 12, 120).length > 0
        ? normalizeStringArray(candidate.doNotShowAsIncluded, 12, 120)
        : normalizeStringArray(fallback.doNotShowAsIncluded, 12, 120),
    reason: getUsageReasonByMode(displayMode)
  })
}

function inferImageProductUsage({ plan = {}, strategyContent = '', productBlueprint = {}, taskType = '' } = {}) {
  const strategy = String(strategyContent || '')
  const mainParts = normalizeStringArray(productBlueprint.structure?.mainParts, 12, 100)
  const bundleItems = normalizeStringArray(productBlueprint.bundleRules?.includedItems, 12, 100)
  const setItems = bundleItems.length > 0 ? bundleItems : mainParts

  if (taskType === 'package' || /(全套|完整套装|到手内容|清单|全部|所有|full set|complete set|all items|all pieces|6-piece|6 piece)/i.test(strategy)) {
    return {
      displayMode: 'full_set',
      requiredItems: setItems,
      optionalItems: [],
      doNotShowAsIncluded: [],
      reason: '这张图的职责是证明完整套装或到手内容。'
    }
  }

  if (taskType === 'detail' || /(细节|局部|特写|材质|纹理|close-up|detail)/i.test(strategy)) {
    return {
      displayMode: 'detail_part',
      requiredItems: [],
      optionalItems: [],
      doNotShowAsIncluded: bundleItems,
      reason: '这张图的职责是展示真实局部细节，不需要展示全套。'
    }
  }

  if (taskType === 'scenario' || /(场景|使用|厨房|书桌|办公|儿童|亲子|use|scene|lifestyle)/i.test(strategy)) {
    return {
      displayMode: 'single_item',
      requiredItems: [],
      optionalItems: [],
      doNotShowAsIncluded: [],
      reason: '这张图的职责是证明真实使用场景，可只展示当前场景正在使用的产品或必要配件。'
    }
  }

  if (taskType === 'feature') {
    return {
      displayMode: 'selected_items',
      requiredItems: [],
      optionalItems: [],
      doNotShowAsIncluded: [],
      reason: '这张图按购买理由选择需要出现的产品或配件，不强制每次展示全套。'
    }
  }

  return {
    displayMode: 'selected_items',
    requiredItems: [],
    optionalItems: [],
    doNotShowAsIncluded: [],
    reason: '按本图策略选择需要出现的产品或配件。'
  }
}

function buildFallbackProductBlueprint({
  productName,
  listingInfo,
  category,
  marketplace,
  dimensions,
  material,
  sellingPoints,
  additionalInfo,
  referenceImages = [],
  signals
} = {}) {
  const materialItems = String(material || '')
    .split(/[\n,;|]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6)

  const context = [
    productName,
    listingInfo,
    category,
    dimensions,
    sellingPoints,
    additionalInfo,
    material
  ].join(' ')
  const explicitIncludedItems = extractIncludedItems(context)
  const listingText = [
    productName,
    listingInfo,
    category
  ].join(' ')

  const parts = inferFallbackParts({ context, listingText, materialItems, signals })
  const bundleItems = inferBundleItems({ context, parts, explicitIncludedItems })
  const bundleQuantity = inferBundleQuantity(context, explicitIncludedItems)
  const productRuleFallback = buildFallbackProductRules({ parts, signals, context })

  const connections = []
  if (parts.includes('lamp head') && parts.includes('flexible arm')) {
    connections.push('lamp head connected to flexible arm')
  }
  if (parts.includes('flexible arm') && parts.includes('clamp')) {
    connections.push('flexible arm connected to clamp')
  }
  if (parts.includes('controller') && parts.includes('power cable')) {
    connections.push('controller connected by cable')
  }

  const mountTypeMap = {
    'Clamp Mounted Device': 'Clamp Mount',
    'Hanging Device': 'Hook or Hanging Mount',
    'Adhesive Mounted Device': 'Adhesive Mount',
    'Magnetic Mounted Device': 'Magnetic Mount',
    'Wall Mounted Device': 'Wall Mount',
    'Wearable Product': 'Wearable Placement',
    'Handheld Product': 'Handheld Use',
    'Standing Product': 'Freestanding Placement'
  }

  const mountType = mountTypeMap[signals?.archetype] || 'Freestanding Placement'
  const supportSurface = []
  const placement = []
  const relationship = []
  const allowed = []
  const forbidden = []

  if (signals?.archetype === 'Clamp Mounted Device') {
    supportSurface.push('support edge')
    placement.push('outside support surface')
    relationship.push('clamp touches support edge')
    allowed.push('clamp grips real support edge')
    forbidden.push('floating clamp', 'clamp passing through support surface')
  }

  if (signals?.hasInteriorTarget) {
    relationship.push('device stays outside enclosure while effect points toward interior')
  }

  return {
    identity: {
      productType: String(productName || '').trim() || 'Unknown product',
      category: String(category || '').trim() || 'General',
      corePurpose: normalizeLineList(sellingPoints, 1, 140)[0] || 'Help buyers understand and purchase the product',
      market: `Amazon ${marketplace || 'UK'}`,
      archetype: signals?.archetype || 'Standing Product'
    },
    appearance: {
      color: '',
      material: materialItems.join(', '),
      visualStyle: ''
    },
    structure: {
      mainParts: parts,
      importantRelationships: connections
    },
    usage: {
      usageScenario: signals?.archetype === 'Standing Product' ? 'freestanding use' : 'mounted or guided use',
      userInteraction: [
        ...supportSurface,
        ...(signals?.archetype === 'Clamp Mounted Device' ? ['support edge held between both clamp jaws'] : []),
        ...(signals?.hasInteriorTarget ? ['device remains outside while its effect points inward'] : [])
      ].filter(Boolean).join('; ')
    },
    productRules: {
      mustKeep: [...new Set([...productRuleFallback.mustKeep, ...connections])].slice(0, 8),
      forbidden: [...new Set([...productRuleFallback.forbidden, ...forbidden])].slice(0, 8)
    },
    installationRules: isMountedArchetype(signals?.archetype)
      ? {
          mountType,
          supportSurface,
          placement,
          allowed,
          relationship
        }
      : {},
    bundleRules: bundleItems.length > 0
      ? {
          includedItems: bundleItems,
          quantity: bundleQuantity,
          arrangement: referenceImages.length > 1 ? 'Supporting references may reveal additional included contents.' : ''
        }
      : {},
    appearanceRules: compactObject({
      shape: '',
      texture: '',
      pairMustMatch: false
    }),
    reference: {
      primary: 'Primary product image',
      supporting: referenceImages.length > 1 ? ['Supporting product images'] : [],
      rules: [
        'Primary reference controls appearance, structure, and accessories.',
        'Supporting references may supplement angle and detail only.'
      ]
    }
  }
}

function normalizeProductBlueprint(value, fallbackInput) {
  const fallback = buildFallbackProductBlueprint(fallbackInput)
  const signals = fallbackInput?.signals || {}
  const candidate = value && typeof value === 'object' ? value : {}
  const getSection = (key) => (candidate[key] && typeof candidate[key] === 'object' ? candidate[key] : {})

  const identity = getSection('identity')
  const appearance = getSection('appearance')
  const structure = getSection('structure')
  const usage = getSection('usage')
  const productRules = getSection('productRules')
  const installationRules = getSection('installationRules')
  const bundleRules = getSection('bundleRules')
  const appearanceRules = getSection('appearanceRules')
  const reference = getSection('reference')
  const legacyMounting = getSection('mounting')
  const legacyRelationships = getSection('relationships')
  const normalizedArchetype = String(identity.archetype || fallback.identity.archetype).trim()
  const normalizedMainParts = sanitizeMainParts(
    structure.mainParts || structure.parts,
    fallback.structure.mainParts,
    signals
  )
  const normalizedMustKeep = normalizeStringArray(productRules.mustKeep || legacyRelationships.mustKeep, 12, 140)
  const normalizedForbidden = normalizeStringArray(productRules.forbidden || legacyMounting.forbidden, 12, 140)
  const normalizedMountType = String(
    installationRules.mountType || legacyMounting.mountType || fallback.installationRules.mountType || ''
  ).trim()
  const normalizedBundleItems = sanitizeBundleItems(
    bundleRules.includedItems,
    fallback.bundleRules.includedItems || [],
    [
      fallbackInput?.productName,
      fallbackInput?.listingInfo,
      fallbackInput?.category,
      fallbackInput?.dimensions,
      fallbackInput?.sellingPoints,
      fallbackInput?.additionalInfo,
      fallbackInput?.material
    ].join(' ')
  )
  const shouldIncludeInstallationRules =
    isMountedArchetype(normalizedArchetype) ||
    Boolean(normalizedMountType && normalizedMountType !== 'Freestanding Placement')

  return {
    identity: {
      productType: String(identity.productType || fallback.identity.productType).trim(),
      category: String(identity.category || fallback.identity.category).trim(),
      corePurpose: String(identity.corePurpose || fallback.identity.corePurpose).trim(),
      market: String(identity.market || fallback.identity.market).trim(),
      archetype: normalizedArchetype
    },
    appearance: {
      color: String(appearance.color || normalizeStringArray(appearance.primaryColor, 6).join(', ') || fallback.appearance.color).trim(),
      material: String(appearance.material || normalizeStringArray(appearance.material, 6).join(', ') || fallback.appearance.material).trim(),
      visualStyle: String(appearance.visualStyle || normalizeStringArray(appearance.distinctiveFeatures, 10).join(', ') || fallback.appearance.visualStyle).trim()
    },
    structure: {
      mainParts: normalizedMainParts,
      importantRelationships:
        normalizeStringArray(structure.importantRelationships || structure.connections, 12, 140).length > 0
          ? normalizeStringArray(structure.importantRelationships || structure.connections, 12, 140)
          : fallback.structure.importantRelationships
    },
    usage: {
      usageScenario: String(usage.usageScenario || usage.useMode || fallback.usage.usageScenario).trim(),
      userInteraction: String(
        usage.userInteraction ||
          [
            ...normalizeStringArray(usage.supportObject, 8),
            ...normalizeStringArray(usage.contactPoint, 8),
            ...normalizeStringArray(usage.spatialRelationship, 10),
            ...normalizeStringArray(usage.effectDirection, 8),
            ...normalizeStringArray(usage.requiredVisibleEvidence, 8)
          ].join('; ') ||
          fallback.usage.userInteraction
      ).trim()
    },
    productRules: {
      mustKeep: normalizedMustKeep.length > 0 ? normalizedMustKeep : fallback.productRules.mustKeep,
      forbidden: normalizedForbidden.length > 0 ? normalizedForbidden : fallback.productRules.forbidden
    },
    installationRules: shouldIncludeInstallationRules
      ? compactObject({
          mountType: normalizedMountType,
          supportSurface:
            normalizeStringArray(installationRules.supportSurface || legacyMounting.supportSurface, 8, 120).length > 0
              ? normalizeStringArray(installationRules.supportSurface || legacyMounting.supportSurface, 8, 120)
              : fallback.installationRules.supportSurface,
          placement:
            normalizeStringArray(installationRules.placement || legacyMounting.placement, 8, 120).length > 0
              ? normalizeStringArray(installationRules.placement || legacyMounting.placement, 8, 120)
              : fallback.installationRules.placement,
          allowed:
            normalizeStringArray(installationRules.allowed || legacyMounting.allowed, 10, 120).length > 0
              ? normalizeStringArray(installationRules.allowed || legacyMounting.allowed, 10, 120)
              : fallback.installationRules.allowed,
          relationship:
            normalizeStringArray(installationRules.relationship || legacyMounting.relationship, 10, 120).length > 0
              ? normalizeStringArray(installationRules.relationship || legacyMounting.relationship, 10, 120)
              : fallback.installationRules.relationship
        })
      : {},
    bundleRules: compactObject({
      includedItems: normalizedBundleItems,
      quantity: String(bundleRules.quantity || fallback.bundleRules.quantity || '').trim(),
      arrangement: String(bundleRules.arrangement || fallback.bundleRules.arrangement || '').trim()
    }),
    appearanceRules: compactObject({
      pairMustMatch: Boolean(appearanceRules.pairMustMatch),
      texture: String(appearanceRules.texture || '').trim(),
      shape: String(appearanceRules.shape || '').trim()
    }),
    reference: {
      primary: String(reference.primary || reference.primaryReference || fallback.reference.primary).trim(),
      supporting:
        normalizeStringArray(reference.supporting, 8).length > 0
          ? normalizeStringArray(reference.supporting, 8)
          : fallback.reference.supporting,
      rules:
        normalizeStringArray(reference.rules, 8).length > 0
          ? normalizeStringArray(reference.rules, 8)
          : fallback.reference.rules
    }
  }
}

function parseCompletionJson(completion, label) {
  let rawContent = completion?.choices?.[0]?.message?.content || ''
  rawContent = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

  const firstBrace = rawContent.indexOf('{')
  const lastBrace = rawContent.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    rawContent = rawContent.slice(firstBrace, lastBrace + 1)
  }

  if (!rawContent) {
    throw new Error(`${label} did not return JSON`)
  }

  return JSON.parse(rawContent)
}

function createFixedMainPlan(requestedTask, id) {
  return {
    id,
    name: requestedTask.name,
    type: 'main',
    taskType: 'main',
    taskKey: requestedTask.taskKey,
    imageRole: 'Amazon 主图',
    sellingFocus: '完整且真实地展示产品主体与已确认标配配件',
    executionRules: [
      '完整产品不可裁切',
      '主体最长边约占画面 85% 并居中',
      '纯白背景 RGB 255,255,255',
      '无文字、无装饰、无额外 Logo',
      '不得新增或删除产品结构与配件'
    ],
    copy: [],
    strategyContent: MAIN_IMAGE_STRATEGY_ZH,
    promptEn: MAIN_IMAGE_STRATEGY_EN,
    promptDirty: false
  }
}

function getComplexityDefinition(complexity = 'L2') {
  switch (String(complexity || 'L2').trim().toUpperCase()) {
    case 'L3':
      return 'L3 refined mode: keep the same product understanding and image duties, but allow richer visual proof, stronger scene integration, comparison, close-up proof, and more visual guidance without weakening product truth.'
    case 'L2':
      return 'L2 standard mode: use standard Amazon secondary-image density: one clear buying question, enough related proof to make it convincing, concise copy, and clean hierarchy.'
    case 'L1':
    default:
      return 'L1 fast mode: keep the same product truth and image duties, but use fewer elements, fewer words, simpler visual proof, and faster 3-second reading.'
  }
}

function getVisualMarketingMethodology() {
  return [
    'Amazon image strategy method:',
    '1. The image must first prove the selling point visually. Copy only helps the buyer notice, understand, or avoid misunderstanding.',
    '2. Do not write image plans like PPT text. Plan visible evidence: product, quantity, color, scale, structure, action, scene, detail, comparison, connection, result.',
    '3. Use this chain for every non-main image: buyer question -> selling conclusion -> visual evidence -> copy support -> misunderstanding boundary.',
    '4. A scene image is not a pretty background. It must answer: who uses it, where it is used, what action is happening, what need is solved, and what result is visible.',
    '5. Copy types: value conclusion, fact identification, mechanism explanation, local label, boundary or risk note.',
    '6. Do not repeat what the image already proves unless the text works as a navigation signal or prevents misunderstanding.',
    '7. Do not use empty claims such as Premium Quality, High Quality, Perfect Choice, Superior Design, Excellent Material, Durable and Strong unless the image gives concrete proof.',
    '8. Title copy should usually be short and scan-friendly. Prefer natural phrases that a marketplace buyer can read on mobile in about 2 seconds.',
    '9. Copy must stay near the evidence it explains. Text, arrows, labels, and numbers are navigation signals, not decoration.',
    '10. If a claim cannot be proven by the image or supplied facts, do not write it.'
  ].join('\n')
}

function getStrategyContentContract() {
  return [
    'strategyContent writing contract:',
    '- Write in Chinese for the operator.',
    '- It must be a usable director script, not a field list and not a generic description.',
    '- It must state the buyer question or purchase doubt this image answers.',
    '- It must state the visual evidence: what the image must show so the selling point is proven even if all text is covered.',
    '- It must state how the real product and confirmed accessories appear, including quantity, scale, contact, installation, use action, or relationship when relevant.',
    '- It must state the exact on-image copy when copy is needed. Put copy inside quotes. Never write vague placeholders such as "use short copy", "add concise copy", "title explains", or "copy should mention".',
    '- If the image should not have text, state that clearly.',
    '- It must state what misunderstanding or generation error to avoid.',
    '- For feature images, do not force exactly one selling point. Use as many related selling points as needed to prove one buying reason, based on selected image count and complexity.',
    '- For scenario images, the scene must prove a real use or benefit. Do not create atmosphere without product action.',
    '- For dimension, detail, package, steps, or comparison images, text and labels must match visible proof and supplied facts.'
  ].join('\n')
}

function getSelfCheckRules() {
  return [
    'Internal self-check before returning JSON:',
    '1. Cover-text test: if all copy is hidden, does the image plan still prove most of the core selling point?',
    '2. Evidence test: can the planned image prove the main title or copy?',
    '3. Delete test: remove any copy that does not help understanding, boundary control, or conversion.',
    '4. 3-second mobile test: can a buyer understand the core conclusion quickly?',
    '5. Misunderstanding test: could the buyer misunderstand included accessories, size, material, quantity, function, use range, or product structure?',
    '6. Product-truth test: does this plan keep the primary reference product, supporting references, and user-supplied facts consistent?'
  ].join('\n')
}

function classifyStrategyMode(strategyTasks = []) {
  const count = strategyTasks.length
  const uniqueTypes = [...new Set(strategyTasks.map((task) => task.taskType))]

  if (count === 0) return 'main_only'
  if (uniqueTypes.length === 1 && uniqueTypes[0] === 'feature' && count >= 3 && count <= 5) {
    return 'feature_bundle'
  }
  if (count <= 3 && uniqueTypes.every((type) => ['feature', 'detail', 'scenario', 'steps', 'dimensions'].includes(type))) {
    return 'compact_conversion'
  }

  return 'full_mix'
}

function extractSellingPointList(rawValue = '') {
  return String(rawValue || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .map((line) => line.replace(/^[\d一二三四五六七八九十]+[.)、．\s-]*/, '').trim())
    .filter(Boolean)
    .filter((line) => line.length >= 4)
    .filter((line, index, source) => source.indexOf(line) === index)
    .slice(0, 12)
}

function deriveExecutionRulesFromStrategy(strategyContent = '', productBlueprint = {}, taskType = '', imageProductUsage = {}) {
  const ruleKeywords = [
    '必须',
    '不得',
    '不能',
    '禁止',
    '保持',
    '完整',
    '清楚',
    '可见',
    '真实',
    '一致',
    '不要',
    '避免',
    '严禁',
    '接触',
    '对准',
    '数量',
    '配件',
    '尺寸'
  ]
  const strategyRules = String(strategyContent || '')
    .replace(/\r\n/g, '\n')
    .split(/[。\n；;]/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 6 && line.length <= 90)
    .filter((line) => /^(必须|不得|不能|禁止|保持|不要|避免|严禁|产品|配件|数量|尺寸|文案|主视觉|画面|场景)/.test(line))
    .filter((line) => ruleKeywords.some((keyword) => line.includes(keyword)))
    .slice(0, 6)

  const blueprintRules = normalizeStringArray(
    [
      ...(productBlueprint.productRules?.mustKeep || []),
      ...(productBlueprint.productRules?.forbidden || []),
      ...(productBlueprint.structure?.importantRelationships || []),
      ...(productBlueprint.installationRules?.relationship || [])
    ],
    6,
    120
  ).filter((rule) => {
    if (['single_item', 'detail_part', 'selected_items'].includes(imageProductUsage.displayMode)) {
      return shouldUseQuantityRuleForTask(rule, strategyContent, taskType, imageProductUsage) && !/(show exactly|full set|complete set|all pieces|all items|six hourglasses|6 hourglasses)/i.test(rule)
    }

    return shouldUseQuantityRuleForTask(rule, strategyContent, taskType, imageProductUsage)
  })

  const taskFallback = {
    feature: ['必须保持产品外观、颜色、结构、数量和配件与参考图一致', '不得只写文案而不展示对应产品证据'],
    scenario: ['必须保持产品使用方式符合产品资料和参考图', '不得出现错误接触、错误位置、比例失真或悬空关系'],
    detail: ['不得改变产品结构、材质纹理和真实比例', '必须让关键细节清楚可见'],
    dimensions: ['必须使用已确认尺寸或清晰参考图尺寸，不得编造', '不得在同一张图重复标注同一尺寸信息'],
    steps: ['必须按真实使用顺序展示步骤关系', '不得出现错误安装、错误接触或悬空关系'],
    summary: ['必须使用已确认卖点和产品资料', '不得新增未确认配件、认证或夸大承诺']
  }[taskType] || ['必须保持产品外观、颜色、结构、数量和配件与参考图一致']

  return [...new Set([...strategyRules, ...blueprintRules, ...taskFallback])].slice(0, 8)
}

function hasChineseText(value = '') {
  return /[\u4e00-\u9fff]/.test(String(value || ''))
}

function isEnglishExecutionRule(value = '') {
  return /^(show|keep|do not|avoid|must|use|render|create|place|make|ensure|only|never|no)\b/i.test(String(value || '').trim())
}

function isVagueCopyPlaceholder(value = '') {
  return /(文案用|用短句|短句说明|标题强调|副标题说明|文字说明|可写|可以写|建议写|copy should|add concise copy|use short copy|title should|subtitle should)/i.test(String(value || ''))
}

function isExecutionGuardRule(value = '') {
  const rule = String(value || '').trim()
  if (!rule) return false
  if (isVagueCopyPlaceholder(rule)) return false

  return /^(必须|不得|不能|禁止|保持|不要|避免|严禁|只能|不可)/.test(rule)
}

function normalizeRuleKey(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。；;、,.:"“”'‘’()（）[\]【】]/g, '')
}

function dedupeExecutionRules(rules = [], strategyContent = '') {
  const strategyKey = normalizeRuleKey(strategyContent)
  const seen = new Set()

  return rules
    .map((rule) => String(rule || '').trim())
    .filter(Boolean)
    .filter((rule) => hasChineseText(rule))
    .filter((rule) => !isEnglishExecutionRule(rule))
    .filter((rule) => isExecutionGuardRule(rule))
    .filter((rule) => rule.length >= 6 && rule.length <= 90)
    .filter((rule) => {
      const key = normalizeRuleKey(rule)
      if (!key || seen.has(key)) return false
      seen.add(key)

      if (rule.length > 42 && strategyKey.includes(key)) return false
      return true
    })
}

function getExecutionRuleLimit(taskType = '', imageProductUsage = {}, strategyContent = '') {
  const text = [
    taskType,
    strategyContent,
    imageProductUsage?.displayMode || '',
    imageProductUsage?.reason || ''
  ].join(' ')

  if (taskType === 'main') return 0
  if (/full_set/.test(text)) return 6
  if (/(数量|尺寸|接触|安装|位置|比例|分钟|时长|对准|穿模|颜色)/.test(text)) return 5
  if (/(single_item|detail_part)/.test(String(imageProductUsage?.displayMode || ''))) return 3
  if (taskType === 'scenario') return 4
  if (taskType === 'feature') return 4
  return 4
}

function normalizeExecutionRules(plan = {}, strategyContent = '', productBlueprint = {}, taskType = '', imageProductUsage = {}) {
  const ruleLimit = getExecutionRuleLimit(taskType, imageProductUsage, strategyContent)
  const modelRules = normalizeStringArray(plan.executionRules || plan.constraints, 12, 120)
    .filter((rule) => !/^这张图回答/.test(rule))
    .filter((rule) => rule.length <= 120)
    .filter((rule) => hasChineseText(rule))
    .filter((rule) => !isEnglishExecutionRule(rule))
    .filter((rule) => isExecutionGuardRule(rule))
    .filter((rule) => {
      if (['single_item', 'detail_part', 'selected_items'].includes(imageProductUsage.displayMode)) {
        return shouldUseQuantityRuleForTask(rule, strategyContent, taskType, imageProductUsage) && !/(show exactly|full set|complete set|all pieces|all items|six hourglasses|6 hourglasses)/i.test(rule)
      }

      return shouldUseQuantityRuleForTask(rule, strategyContent, taskType, imageProductUsage)
    })
  const fallbackRules = deriveExecutionRulesFromStrategy(strategyContent, productBlueprint, taskType, imageProductUsage)
  return dedupeExecutionRules([...modelRules, ...fallbackRules], strategyContent).slice(0, ruleLimit)
}

function ensureCopyVisibleInStrategy(strategyContent = '', copyLines = []) {
  const content = String(strategyContent || '').trim()
  const copy = normalizeStringArray(copyLines, 8, 80)
  if (copy.length === 0) return content

  const missingCopy = copy.filter((line) => !content.includes(line))
  if (missingCopy.length === 0 && !isVagueCopyPlaceholder(content)) return content

  const quotedCopy = copy.map((line) => `“${line}”`).join('、')
  const copySentence = `图片文字使用：${quotedCopy}。`

  if (!content) return copySentence
  if (/图片文字使用[:：]/.test(content)) return content
  return `${content}\n${copySentence}`
}

function getStrategyModeInstruction(strategyMode, strategyTasks = []) {
  const count = strategyTasks.length

  if (strategyMode === 'feature_bundle') {
    return [
      `This is a focused ${count}-image selling-point bundle, not a full 7-image listing set.`,
      'Prioritize the strongest distinct buying reasons first.',
      'Distribute image missions like a shot list, not like repeated captions.',
      'Do not force summary, gift, or decorative scene roles unless the product information clearly demands them.',
      'If selling points are more than image count, merge naturally related benefits into one image when they serve the same buying reason.',
      'If selling points are fewer than image count, expand with installation, usage, compatibility, fit, bundle completeness, or material trust angles instead of repeating one reason.',
      'Every image must feel essential to conversion.'
    ].join(' ')
  }

  if (strategyMode === 'compact_conversion') {
    return [
      `This is a compact ${count}-image conversion set.`,
      'Cover only the highest-priority buyer questions.',
      'Treat each image as a directorial shot with a clear selling mission, not as a generic image type.',
      'Prefer strong selling reasons, installation clarity, fit or size clarity, and real-use understanding.',
      'Avoid low-value filler images.'
    ].join(' ')
  }

  if (strategyMode === 'main_only') {
    return 'Only the fixed Amazon main image is needed. No non-main strategy planning is required.'
  }

  return [
    'This is a broader Amazon listing image set.',
    'Treat every image as a directorial execution script, not as an abstract description.',
    'Distribute image roles across different buyer decision stages: strongest benefit, second benefit, usage clarity, fit or detail clarity, and final trust reinforcement.',
    'Do not let later images mechanically repeat earlier ones.'
  ].join(' ')
}

router.post('/', async (req, res) => {
  const requestId = createAgentRequestId()
  const startedAt = Date.now()
  let clientClosed = false

  req.on('close', () => {
    if (!res.writableEnded) {
      clientClosed = true
      logAgentAnalyze('client_closed', {
        requestId,
        elapsedMs: Date.now() - startedAt
      })
    }
  })

  try {
    const {
      productName,
      listingInfo,
      category,
      marketplace,
      imageLanguage,
      complexity = 'L2',
      dimensions,
      material,
      targetAudience,
      additionalInfo,
      designNotes,
      fontPreference,
      brandColorMode,
      brandColor,
      sellingPoints,
      selectedImageTasks = [],
      referenceImages = [],
      primaryReferenceImageUrl = ''
    } = req.body

    logAgentAnalyze('start', {
      requestId,
      selectedTaskCount: Array.isArray(selectedImageTasks) ? selectedImageTasks.length : 0,
      referenceImageCount: Array.isArray(referenceImages) ? referenceImages.length : 0,
      productNameChars: String(productName || '').length,
      listingInfoChars: String(listingInfo || '').length,
      additionalInfoChars: String(additionalInfo || '').length,
      sellingPointsChars: String(sellingPoints || '').length
    })

    const explicitPrimaryReferenceImageUrl =
      primaryReferenceImageUrl || (Array.isArray(referenceImages) ? referenceImages[0] : '')

    if (!productName && !listingInfo && !sellingPoints) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'At least one of productName, listingInfo, or sellingPoints is required',
        requestId
      })
    }

    const requestedTasks = expandSelectedImageTasks(selectedImageTasks)
    if (requestedTasks.length === 0) {
      return res.status(400).json({
        error: 'Invalid tasks',
        message: 'Select at least one image task',
        requestId
      })
    }

    if (requestedTasks.length > 12) {
      return res.status(400).json({
        error: 'Too many tasks',
        message: 'At most 12 image tasks can be analyzed at once',
        requestId
      })
    }

    const fullContext = buildDedupedContext([
      listingInfo,
      additionalInfo,
      designNotes,
      productName,
      category,
      dimensions,
      material,
      sellingPoints
    ])

    const productSignals = buildProductSignals(fullContext)
    const marketplaceLanguage = getTargetImageLanguage({
      marketplace: marketplace || 'UK',
      imageLanguage
    })
    const fontStyleLabel = getFontStyleLabel(fontPreference)
    const brandColorLabel = getBrandColorLabel(brandColorMode, brandColor)
    const complexityDefinition = getComplexityDefinition(complexity)

    const imageContentParts = await buildImageContentParts(explicitPrimaryReferenceImageUrl, referenceImages)
    const apiKey = process.env.AGENT_API_KEY || process.env.OPENAI_API_KEY
    const baseUrl =
      process.env.AGENT_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    const model = process.env.AGENT_MODEL || 'gpt-4o-mini'
    const timeoutMs = Number(process.env.AGENT_TIMEOUT_MS || 600000)

    if (!apiKey || apiKey === 'sk-your-api-key-here') {
      return res.status(500).json({
        error: 'Missing API Key',
        message: 'OPENAI_API_KEY is not configured',
        requestId
      })
    }

    const openai = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      timeout: timeoutMs,
      maxRetries: 0
    })

    logAgentAnalyze('upstream_config', {
      requestId,
      model,
      baseUrl,
      timeoutMs,
      requestedTaskCount: requestedTasks.length,
      referenceImageCount: Array.isArray(referenceImages) ? referenceImages.length : 0
    })

    const strategyTasks = requestedTasks.filter((task) => task.taskType !== 'main')
    const strategyMode = classifyStrategyMode(strategyTasks)
    const strategyModeInstruction = getStrategyModeInstruction(strategyMode, strategyTasks)
    const sellingPointList = extractSellingPointList(sellingPoints || listingInfo)
    const visualMarketingMethodology = getVisualMarketingMethodology()
    const strategyContentContract = getStrategyContentContract()
    const selfCheckRules = getSelfCheckRules()
    const strategyTaskDescription = strategyTasks
      .map((item, index) => [
        `Plan ${index + 1} | ${item.name}`,
        `taskKey: ${item.taskKey}`,
        `Task type: ${item.taskType}`,
        `Purpose: ${item.purpose}`,
        `Guidance: ${item.guidance}`,
        'Required planning lens: decide the buyer question, the visible evidence, the minimal copy, and the misunderstanding boundary for this shot.'
      ].join('\n'))
      .join('\n\n')

    const combinedSystemPrompt = `
You are an Amazon marketplace operator, ecommerce visual planner, and English ad-copy strategist for high-volume, non-branded products.
Your job is to do three things in one pass:
1. Understand the real product from the supplied product images and product information.
2. Allocate the user-selected image tasks into a conversion-focused image set.
3. Write operator-editable Chinese directorial strategies plus controlled English execution prompts.

Return JSON only with two top-level keys: productBlueprint and imagePlans.
imagePlans must contain exactly ${strategyTasks.length} items in the same order as the task list.

productBlueprint must use this fixed skeleton:
- identity: productType, category, corePurpose, market, archetype
- appearance: color, material, visualStyle
- structure: mainParts, importantRelationships
- usage: usageScenario, userInteraction
- productRules: mustKeep, forbidden
- reference: primary, supporting, rules
Optional product-specific sections may be added only when truly relevant:
- installationRules for mounted, clamped, hanging, wall, adhesive, magnetic, or installation products.
- bundleRules for kits, gift sets, multi-piece sets, color sets, size sets, or confirmed included accessories.
- appearanceRules for apparel, shoes, paired products, pattern, texture, shape, or style consistency.

Each image plan must include:
- taskKey, name, type
- imageRole
- sellingFocus
- currentImageProductUsage
- strategyContent
- copy
- executionRules
- promptEn

Hard rules:
1. The explicit primary product image is the highest authority for product identity, shape, color, proportions, structure, quantity, printed marks, accessories, and relationships.
2. Supporting product images may supplement angle, missing contents, usage, or structure, but may not override primary product truth.
3. Layout or competitor references may influence selling presentation, composition, or atmosphere, but may not change product truth.
4. Product text and user requirements must be combined with image evidence. Do not ignore clear user-supplied image duties.
5. strategyContent is the single source of truth for operators and final image execution.
6. promptEn must be a controlled visual English conversion of strategyContent. It may express the same idea in natural visual English, but may not add new scene elements, claims, features, layout decisions, or objects that are not already supported by strategyContent.
7. Complexity must not change product understanding or core image-role allocation. Complexity only changes information density, text density, scene richness, and visual complexity.
8. Different images should not mechanically repeat the same buying mission unless the user explicitly requests repetition.
9. One image may carry multiple related selling points when they support the same buying reason.
10. Scene images may prove selling points. Feature images may use believable real-use context. Do not rigidly separate them.
11. The strategy must think like a director, not like a database. Write what the image must prove, how the product should appear, what may support the message, and what must be avoided.
12. Do not invent hidden geometry, unsupported quantities, unverified accessories, or unconfirmed claims.
13. When image count is small, prioritize the biggest buying reasons first. When image count is larger, expand into detail, trust, usage, and supporting proof.
14. Text is forbidden only for the Amazon main image. Non-main images may use concise copy when it helps conversion or understanding.
15. executionRules are mandatory for every non-main image. They are jailbreak guards for image generation, not another strategy paragraph. Write concise Chinese hard red lines only: what must not be changed, invented, omitted, mismatched, exaggerated, cropped, occluded, or placed in an impossible way. Do not repeat strategyContent. Do not include scene ideas, layout ideas, selling-point explanations, or copy-writing placeholders.
16. productRules.mustKeep and productRules.forbidden must not be empty. They must be derived from the actual product images and product facts, not from generic category assumptions.
17. copy must list the exact on-image text planned for that image. If the strategy says title, subtitle, tag, label, or copy, put those text lines in copy too. If copy is used, strategyContent must also show the exact same text in quotes. Do not ask the image model to invent copy.
18. currentImageProductUsage must decide which products or accessories are needed for this one image. Use displayMode as one of: full_set, selected_items, single_item, detail_part. Do not force full-set quantity into scenario or detail images unless that image is explicitly about the full set.
19. Do not make gift boxes, storage boxes, ribbons, cards, packaging, organizers, props, or display containers the image mission unless the user explicitly says they are included or required. If they are only scene props, state that they are props and must not be understood as included accessories.

${visualMarketingMethodology}

${strategyContentContract}

${selfCheckRules}
`.trim()

    const combinedUserPrompt = `
Product Name: ${trimForModel(productName, 300)}
Category: ${trimForModel(category || 'Not provided', 300)}
Marketplace: Amazon ${marketplace || 'UK'}
Image Language: ${marketplaceLanguage}
Dimensions: ${trimForModel(dimensions || 'Not provided', 900)}
Material: ${trimForModel(material || 'Not provided', 1200)}
Target Audience: ${trimForModel(targetAudience || 'Not provided', 900)}
Selling Points: ${trimForModel(sellingPoints, 3500)}
Detected Selling Point List: ${trimForModel(JSON.stringify(sellingPointList), 1800)}
Full Listing Source: ${trimForModel(listingInfo || 'Not provided', 7000)}
Usage, scenes, and supplementary requirements: ${trimForModel(additionalInfo || 'None', 7000)}
Custom Design Notes: ${trimForModel(designNotes || 'None', 600)}
Known text signals: ${JSON.stringify(productSignals)}
Font Preference: ${fontStyleLabel}
Brand Color Preference: ${brandColorLabel}
Complexity: ${complexity}
Complexity Definition: ${complexityDefinition}

Requested non-main image tasks
${strategyTaskDescription || 'No non-main image tasks requested.'}

Planning mode
${strategyMode}

Planning rule
${strategyModeInstruction}

Selling point allocation note
There are ${sellingPointList.length} detected selling points for ${strategyTasks.length} non-main requested images. You must consciously allocate buying missions across the selected shots. One image may cover multiple related selling points if they support the same buying reason. Do not repeat missions mechanically. Let complexity influence density and richness, not product truth.

Internal workflow reminder
Step 1 product understanding must stay stable and independent from complexity.
Step 2 task allocation must decide what each image is trying to sell or prove.
Step 3 strategy writing must express those duties as operator-editable Chinese director scripts and controlled English execution text.
Step 4 self-check must remove empty copy, unsupported claims, repeated missions, and image plans that cannot visually prove the selling point.
`.trim()

    const upstreamStartedAt = Date.now()
    const combinedCompletion = await createAgentCompletion(openai, {
      model,
      messages: [
        { role: 'system', content: combinedSystemPrompt },
        {
          role: 'user',
          content: imageContentParts.length > 0
            ? [{ type: 'text', text: combinedUserPrompt }, ...imageContentParts]
            : combinedUserPrompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: Math.min(12000, 4200 + strategyTasks.length * 1000)
    })

    logAgentAnalyze('upstream_completed', {
      requestId,
      upstreamElapsedMs: Date.now() - upstreamStartedAt,
      totalElapsedMs: Date.now() - startedAt,
      usage: combinedCompletion.usage || null,
      clientClosed
    })

    const combinedResult = parseCompletionJson(combinedCompletion, 'Product understanding and image strategy')
    const productBlueprint = normalizeProductBlueprint(combinedResult.productBlueprint, {
      productName,
      category,
      marketplace,
      material,
      sellingPoints,
      additionalInfo,
      referenceImages,
      signals: productSignals
    })

    const strategyResult = {
      imagePlans: Array.isArray(combinedResult.imagePlans) ? combinedResult.imagePlans : []
    }
    // Intentionally do not hard-block on blueprint quality checks here.
    // The operator should always be able to review and edit the generated strategy first.
    const strategyPlans = strategyTasks.map((task, index) => strategyResult.imagePlans[index] || {
      taskKey: task.taskKey,
      name: task.name,
      type: task.taskType,
      imageRole: '',
      sellingFocus: '',
      currentImageProductUsage: {},
      executionRules: [],
      copy: [],
      strategyContent: '',
      promptEn: ''
    })

    let nonMainPlanIndex = 0
    const normalizedPlans = requestedTasks.map((requestedTask, index) => {
      if (requestedTask.taskType === 'main') {
        return createFixedMainPlan(requestedTask, index + 1)
      }

      const plan = strategyPlans[nonMainPlanIndex] || {}
      nonMainPlanIndex += 1

      const rawStrategyContent = String(plan.strategyContent || '').trim()
      const normalizedCopy = normalizeStringArray(plan.copy, 8, 80)
      const extractedCopy = normalizedCopy.length > 0 ? normalizedCopy : extractImageCopy(rawStrategyContent, 8)
      const strategyContent = ensureCopyVisibleInStrategy(rawStrategyContent, extractedCopy)
      const normalizedImageProductUsage = normalizeImageProductUsage(
        plan.currentImageProductUsage || plan.imageProductUsage,
        inferImageProductUsage({
          plan,
          strategyContent,
          productBlueprint,
          taskType: requestedTask.taskType
        })
      )
      const bundleItemsForPlan = normalizeStringArray(productBlueprint.bundleRules?.includedItems, 16, 100)
      const currentImageProductUsage =
        normalizedImageProductUsage.displayMode === 'full_set' && bundleItemsForPlan.length > 0
          ? {
              ...normalizedImageProductUsage,
              requiredItems: bundleItemsForPlan
            }
          : normalizedImageProductUsage
      const sellingFocus = String(
        plan.sellingFocus ||
          plan.primarySellingPoint ||
          plan.focus ||
          ''
      ).trim()

      return {
        id: index + 1,
        name: String(plan.name || requestedTask.name).trim(),
        type: String(plan.type || requestedTask.taskType).trim(),
        taskType: requestedTask.taskType,
        taskKey: requestedTask.taskKey,
        imageRole: String(plan.imageRole || '').trim(),
        sellingFocus,
        currentImageProductUsage,
        executionRules: normalizeExecutionRules(
          plan,
          strategyContent,
          productBlueprint,
          requestedTask.taskType,
          currentImageProductUsage
        ),
        copy: requestedTask.taskType !== 'main' ? extractedCopy : [],
        strategyContent,
        promptEn: String(plan.promptEn || '').trim(),
        promptDirty: false
      }
    })

    const translationListing = {
      productName,
      listingInfo,
      category,
      marketplace: marketplace || 'UK',
      imageLanguage: marketplaceLanguage,
      dimensions,
      material,
      targetAudience,
      additionalInfo,
      designNotes,
      fontPreference,
      brandColorMode,
      brandColor,
      sellingPoints,
      productBlueprint
    }

    const completedPlans = await Promise.all(
      normalizedPlans.map(async (plan) => {
        if (plan.taskType === 'main') return plan
        if (String(plan.promptEn || '').trim()) return plan
        if (!String(plan.strategyContent || '').trim()) return plan

        try {
          const translatedPlan = await translatePlanPromptIfNeeded(
            {
              ...plan,
              promptDirty: true
            },
            translationListing,
            '2048x2048'
          )

          return {
            ...plan,
            promptEn: String(translatedPlan.promptEn || '').trim(),
            promptDirty: false
          }
        } catch (translationError) {
          console.warn('[agent-analyze] promptEn backfill failed', {
            requestId,
            task: plan.taskKey || plan.name,
            message: translationError.message
          })
          return plan
        }
      })
    )

    const responseData = {
      productBlueprint,
      imagePlans: completedPlans,
      _meta: {
        requestedImageCount: requestedTasks.length,
        productUnderstandingWarnings: [],
        productUnderstandingNeedsReview: false,
        productUnderstandingRepaired: false,
        generatedAt: new Date().toISOString(),
        requestId
      }
    }

    logAgentAnalyze('success', {
      requestId,
      elapsedMs: Date.now() - startedAt,
      imagePlanCount: completedPlans.length,
      clientClosed
    })

    res.json({
      success: true,
      data: responseData,
      usage: {
        combined: combinedCompletion.usage || null
      }
    })
  } catch (error) {
    const status = getErrorStatus(error)
    console.error('[agent-analyze] failed', {
      requestId,
      status,
      elapsedMs: Date.now() - startedAt,
      clientClosed,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })

    if (res.headersSent) return

    res.status(status).json({
      error: 'Agent analysis failed',
      message: error.message,
      requestId,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

export default router
