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
    purpose: 'Highlight one core selling point and build a purchase reason',
    guidance: 'Focus on one strong benefit and keep the product dominant'
  },
  scenario: {
    defaultName: 'Scenario Image',
    purpose: 'Show realistic use context and improve understanding',
    guidance: 'Use a believable environment and preserve real installation logic'
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
    hasController: /(controller|dimmer|timer|switch|remote)/.test(text),
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

function buildFallbackProductBlueprint({
  productName,
  category,
  marketplace,
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
    category,
    sellingPoints,
    additionalInfo,
    material
  ].join(' ').toLowerCase()

  const parts = []
  if (/(lamp|light|head)/.test(context)) parts.push('lamp head')
  if (signals?.hasFlexibleArm) parts.push('flexible arm')
  if (signals?.archetype === 'Clamp Mounted Device') parts.push('clamp')
  if (signals?.hasCable) parts.push('power cable')
  if (signals?.hasController) parts.push('controller')
  if (signals?.hasBulb) parts.push('light source')

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

  const behavior = {
    motion: signals?.hasFlexibleArm ? ['adjustable angle'] : [],
    adjustment: signals?.hasController ? ['timing or intensity adjustment'] : []
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
      mustKeep: connections,
      forbidden
    },
    installationRules: mountType
      ? {
          mountType,
          supportSurface,
          placement,
          allowed,
          relationship
        }
      : {},
    bundleRules: parts.length > 1
      ? {
          includedItems: parts,
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

  return {
    identity: {
      productType: String(identity.productType || fallback.identity.productType).trim(),
      category: String(identity.category || fallback.identity.category).trim(),
      corePurpose: String(identity.corePurpose || fallback.identity.corePurpose).trim(),
      market: String(identity.market || fallback.identity.market).trim(),
      archetype: String(identity.archetype || fallback.identity.archetype).trim()
    },
    appearance: {
      color: String(appearance.color || normalizeStringArray(appearance.primaryColor, 6).join(', ') || fallback.appearance.color).trim(),
      material: String(appearance.material || normalizeStringArray(appearance.material, 6).join(', ') || fallback.appearance.material).trim(),
      visualStyle: String(appearance.visualStyle || normalizeStringArray(appearance.distinctiveFeatures, 10).join(', ') || fallback.appearance.visualStyle).trim()
    },
    structure: {
      mainParts:
        normalizeStringArray(structure.mainParts || structure.parts, 12).length > 0
          ? normalizeStringArray(structure.mainParts || structure.parts, 12)
          : fallback.structure.mainParts,
      importantRelationships:
        normalizeStringArray(structure.importantRelationships || structure.connections, 12).length > 0
          ? normalizeStringArray(structure.importantRelationships || structure.connections, 12)
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
      mustKeep:
        normalizeStringArray(productRules.mustKeep || legacyRelationships.mustKeep, 12).length > 0
          ? normalizeStringArray(productRules.mustKeep || legacyRelationships.mustKeep, 12)
          : fallback.productRules.mustKeep,
      forbidden:
        normalizeStringArray(productRules.forbidden || legacyMounting.forbidden, 12).length > 0
          ? normalizeStringArray(productRules.forbidden || legacyMounting.forbidden, 12)
          : fallback.productRules.forbidden
    },
    installationRules: compactObject({
      mountType: String(installationRules.mountType || legacyMounting.mountType || fallback.installationRules.mountType || '').trim(),
      supportSurface:
        normalizeStringArray(installationRules.supportSurface || legacyMounting.supportSurface, 8).length > 0
          ? normalizeStringArray(installationRules.supportSurface || legacyMounting.supportSurface, 8)
          : fallback.installationRules.supportSurface,
      placement:
        normalizeStringArray(installationRules.placement || legacyMounting.placement, 8).length > 0
          ? normalizeStringArray(installationRules.placement || legacyMounting.placement, 8)
          : fallback.installationRules.placement,
      allowed:
        normalizeStringArray(installationRules.allowed || legacyMounting.allowed, 10).length > 0
          ? normalizeStringArray(installationRules.allowed || legacyMounting.allowed, 10)
          : fallback.installationRules.allowed,
      relationship:
        normalizeStringArray(installationRules.relationship || legacyMounting.relationship, 10).length > 0
          ? normalizeStringArray(installationRules.relationship || legacyMounting.relationship, 10)
          : fallback.installationRules.relationship
    }),
    bundleRules: compactObject({
      includedItems:
        normalizeStringArray(bundleRules.includedItems, 16).length > 0
          ? normalizeStringArray(bundleRules.includedItems, 16)
          : fallback.bundleRules.includedItems,
      quantity: String(bundleRules.quantity || '').trim(),
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
      return 'L3 refined mode: keep the same product understanding and image duties, but allow richer visual proof, denser supporting detail, and stronger scene integration without weakening product truth.'
    case 'L2':
      return 'L2 standard mode: keep one clear buying mission per image while allowing one naturally related supporting proof point and balanced information density.'
    case 'L1':
    default:
      return 'L1 fast mode: keep the same product truth and image duties, but express each image in a simpler, faster-to-read, lower-density way with fewer supporting layers.'
  }
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

function deriveExecutionRulesFromStrategy(strategyContent = '', productBlueprint = {}, taskType = '') {
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
    .filter((line) => line.length >= 6)
    .filter((line) => ruleKeywords.some((keyword) => line.includes(keyword)))
    .slice(0, 6)

  const blueprintRules = normalizeStringArray(
    [
      ...(productBlueprint.productRules?.mustKeep || []),
      ...(productBlueprint.productRules?.forbidden || []),
      ...(productBlueprint.structure?.importantRelationships || []),
      ...(productBlueprint.installationRules?.relationship || []),
      ...(productBlueprint.bundleRules?.includedItems || [])
    ],
    6,
    120
  )

  const taskFallback = {
    feature: ['产品外观、颜色、结构、数量和配件必须与参考图一致', '卖点必须通过画面直接证明，避免只写文案不展示产品'],
    scenario: ['产品使用方式必须符合产品资料和参考图', '产品与使用对象的接触、位置和比例必须真实可信'],
    detail: ['细节特写不得改变产品结构、材质纹理和真实比例', '关键细节必须清楚可见'],
    dimensions: ['尺寸标注必须来自已确认资料或清晰参考图，不得编造', '同一尺寸信息不要重复标注'],
    steps: ['步骤关系必须按真实使用顺序展示', '不得出现错误安装、错误接触或悬空关系'],
    summary: ['总结信息必须来自已确认卖点和产品资料', '不得新增未确认配件、认证或夸大承诺']
  }[taskType] || ['产品外观、颜色、结构、数量和配件必须与参考图一致']

  return [...new Set([...strategyRules, ...blueprintRules, ...taskFallback])].slice(0, 8)
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

    const explicitPrimaryReferenceImageUrl =
      primaryReferenceImageUrl || (Array.isArray(referenceImages) ? referenceImages[0] : '')

    if (!productName && !listingInfo && !sellingPoints) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'At least one of productName, listingInfo, or sellingPoints is required'
      })
    }

    const requestedTasks = expandSelectedImageTasks(selectedImageTasks)
    if (requestedTasks.length === 0) {
      return res.status(400).json({
        error: 'Invalid tasks',
        message: 'Select at least one image task'
      })
    }

    if (requestedTasks.length > 12) {
      return res.status(400).json({
        error: 'Too many tasks',
        message: 'At most 12 image tasks can be analyzed at once'
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
        message: 'OPENAI_API_KEY is not configured'
      })
    }

    const openai = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      timeout: timeoutMs,
      maxRetries: 0
    })

    console.info('[agent-analyze] upstream config', {
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
    const strategyTaskDescription = strategyTasks
      .map((item, index) => [
        `Plan ${index + 1} | ${item.name}`,
        `taskKey: ${item.taskKey}`,
        `Task type: ${item.taskType}`,
        `Purpose: ${item.purpose}`,
        `Guidance: ${item.guidance}`
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
- installationRules
- bundleRules
- appearanceRules
- reference: primary, supporting, rules

Each image plan must include:
- taskKey, name, type
- imageRole
- sellingFocus
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
15. executionRules are mandatory for every non-main image. Write 3 to 6 concise Chinese hard execution rules that protect product truth, accessory truth, contact logic, quantity, dimensions, text accuracy, or other boundaries. Do not leave executionRules empty.
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
Step 3 strategy writing must express those duties in operator-editable Chinese and controlled English execution text.
`.trim()

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

      const strategyContent = String(plan.strategyContent || '').trim()
      const normalizedCopy = normalizeStringArray(plan.copy, 3)
      const shouldAllowCopy = requestedTask.taskType !== 'main' && normalizedCopy.length > 0
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
        executionRules:
          normalizeStringArray(plan.executionRules || plan.constraints, 12).slice(0, 8).length > 0
            ? normalizeStringArray(plan.executionRules || plan.constraints, 12).slice(0, 8)
            : deriveExecutionRulesFromStrategy(strategyContent, productBlueprint, requestedTask.taskType),
        copy: shouldAllowCopy ? normalizedCopy : [],
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
          console.warn('[agent-analyze] promptEn backfill failed for', plan.taskKey || plan.name, translationError.message)
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
        generatedAt: new Date().toISOString()
      }
    }

    res.json({
      success: true,
      data: responseData,
      usage: {
        combined: combinedCompletion.usage || null
      }
    })
  } catch (error) {
    console.error('Agent analysis error:', error)
    res.status(500).json({
      error: 'Agent analysis failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

export default router
