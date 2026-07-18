import express from 'express'
import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import {
  getMarketplaceLanguage,
  inferArchetype,
  normalizeConfidenceValue,
  normalizeStringArray
} from '../utils/productModel.js'
import { isTransientUpstreamError } from '../utils/upstreamRetry.js'
import { normalizeVisualBlueprint } from '../utils/visualBlueprints.js'
import { readUploadFileBufferWithRetry, resolveUploadPathFromUrl } from '../utils/uploads.js'

const router = express.Router()

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const MAIN_IMAGE_STRATEGY_ZH = [
  '【目的】提升点击率（CTR）。',
  '【构图】产品完整展示，主体占画面约 85%，居中摆放。',
  '【背景】纯白背景（RGB 255,255,255）。',
  '【文字】无文字。',
  '【Logo】无 Logo（除产品本身自带品牌）。',
  '【元素】除产品及产品标配配件外，不添加任何装饰元素。',
  '【要求】突出产品主体，边缘清晰，光线自然，阴影真实，符合 Amazon 主图规范。'
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
  const maxAttempts = 2

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await openai.chat.completions.create(requestOptions)
    } catch (error) {
      const shouldRetry = attempt < maxAttempts && isTransientUpstreamError(error)
      console.error(
        `Agent upstream request failed (${attempt}/${maxAttempts}):`,
        error?.status || error?.response?.status || error?.code || 'unknown',
        error?.message || error
      )

      if (!shouldRetry) throw error
      await sleep(1200)
    }
  }

  throw new Error('Agent request did not return a result after retrying')
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

function trimForModel(value = '', maxLength = 1200) {
  const text = String(value || '').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
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
      market: `Amazon ${marketplace || 'UK'}`,
      archetype: signals?.archetype || 'Standing Product'
    },
    appearance: {
      primaryColor: [],
      material: materialItems,
      distinctiveFeatures: []
    },
    structure: {
      parts,
      connections,
      visibleEvidence: []
    },
    mounting: {
      mountType,
      supportSurface,
      placement,
      connectionType: parts.includes('clamp') ? 'mechanical grip' : 'direct placement',
      relationship,
      allowed,
      forbidden
    },
    usage: {
      useMode: signals?.archetype === 'Standing Product' ? 'freestanding use' : 'mounted use',
      supportObject: supportSurface,
      contactPoint: signals?.archetype === 'Clamp Mounted Device' ? ['support edge held between both clamp jaws'] : [],
      spatialRelationship: relationship,
      effectDirection: signals?.hasInteriorTarget ? ['device remains outside while its functional effect points toward the enclosure interior'] : [],
      requiredVisibleEvidence: signals?.archetype === 'Clamp Mounted Device'
        ? ['both clamp jaws visibly contact opposite sides of one real support edge', 'mounting contact remains unobstructed and readable']
        : [],
      forbiddenSpatialRelations: forbidden
    },
    relationships: {
      mustKeep: connections
    },
    behavior,
    reference: {
      primaryReference: 'Primary product image',
      secondaryReference: referenceImages.length > 1 ? 'Supporting product images' : 'None',
      styleReference: 'Competitor or design references',
      rules: [
        'Primary reference controls appearance, structure, and accessories.',
        'Supporting references may supplement angle and detail only.',
        'Style references may influence composition, lighting, and layout only.'
      ]
    },
    confidence: {
      appearance: 0.7,
      structure: parts.length > 0 ? 0.8 : 0.55,
      mounting: signals?.archetype === 'Standing Product' ? 0.55 : 0.78
    },
    uncertainties: []
  }
}

function normalizeProductBlueprint(value, fallbackInput) {
  const fallback = buildFallbackProductBlueprint(fallbackInput)
  const candidate = value && typeof value === 'object' ? value : {}
  const getSection = (key) => (candidate[key] && typeof candidate[key] === 'object' ? candidate[key] : {})

  const identity = getSection('identity')
  const appearance = getSection('appearance')
  const structure = getSection('structure')
  const mounting = getSection('mounting')
  const usage = getSection('usage')
  const relationships = getSection('relationships')
  const behavior = getSection('behavior')
  const reference = getSection('reference')
  const confidence = getSection('confidence')

  return {
    identity: {
      productType: String(identity.productType || fallback.identity.productType).trim(),
      category: String(identity.category || fallback.identity.category).trim(),
      market: String(identity.market || fallback.identity.market).trim(),
      archetype: String(identity.archetype || fallback.identity.archetype).trim()
    },
    appearance: {
      primaryColor: normalizeStringArray(appearance.primaryColor, 6),
      material:
        normalizeStringArray(appearance.material, 6).length > 0
          ? normalizeStringArray(appearance.material, 6)
          : fallback.appearance.material,
      distinctiveFeatures: normalizeStringArray(appearance.distinctiveFeatures, 10)
    },
    structure: {
      parts:
        normalizeStringArray(structure.parts, 10).length > 0
          ? normalizeStringArray(structure.parts, 10)
          : fallback.structure.parts,
      connections:
        normalizeStringArray(structure.connections, 10).length > 0
          ? normalizeStringArray(structure.connections, 10)
          : fallback.structure.connections,
      visibleEvidence: normalizeStringArray(structure.visibleEvidence, 10)
    },
    mounting: {
      mountType: String(mounting.mountType || fallback.mounting.mountType).trim(),
      supportSurface:
        normalizeStringArray(mounting.supportSurface, 8).length > 0
          ? normalizeStringArray(mounting.supportSurface, 8)
          : fallback.mounting.supportSurface,
      placement:
        normalizeStringArray(mounting.placement, 8).length > 0
          ? normalizeStringArray(mounting.placement, 8)
          : fallback.mounting.placement,
      connectionType: String(mounting.connectionType || fallback.mounting.connectionType).trim(),
      relationship:
        normalizeStringArray(mounting.relationship, 10).length > 0
          ? normalizeStringArray(mounting.relationship, 10)
          : fallback.mounting.relationship,
      allowed:
        normalizeStringArray(mounting.allowed, 10).length > 0
          ? normalizeStringArray(mounting.allowed, 10)
          : fallback.mounting.allowed,
      forbidden:
        normalizeStringArray(mounting.forbidden, 10).length > 0
          ? normalizeStringArray(mounting.forbidden, 10)
          : fallback.mounting.forbidden
    },
    usage: {
      useMode: String(usage.useMode || fallback.usage.useMode).trim(),
      supportObject:
        normalizeStringArray(usage.supportObject, 8).length > 0
          ? normalizeStringArray(usage.supportObject, 8)
          : fallback.usage.supportObject,
      contactPoint:
        normalizeStringArray(usage.contactPoint, 8).length > 0
          ? normalizeStringArray(usage.contactPoint, 8)
          : fallback.usage.contactPoint,
      spatialRelationship:
        normalizeStringArray(usage.spatialRelationship, 10).length > 0
          ? normalizeStringArray(usage.spatialRelationship, 10)
          : fallback.usage.spatialRelationship,
      effectDirection:
        normalizeStringArray(usage.effectDirection, 8).length > 0
          ? normalizeStringArray(usage.effectDirection, 8)
          : fallback.usage.effectDirection,
      requiredVisibleEvidence:
        normalizeStringArray(usage.requiredVisibleEvidence, 10).length > 0
          ? normalizeStringArray(usage.requiredVisibleEvidence, 10)
          : fallback.usage.requiredVisibleEvidence,
      forbiddenSpatialRelations:
        normalizeStringArray(usage.forbiddenSpatialRelations, 10).length > 0
          ? normalizeStringArray(usage.forbiddenSpatialRelations, 10)
          : fallback.usage.forbiddenSpatialRelations
    },
    relationships: {
      mustKeep:
        normalizeStringArray(relationships.mustKeep, 10).length > 0
          ? normalizeStringArray(relationships.mustKeep, 10)
          : fallback.relationships.mustKeep
    },
    behavior: {
      motion:
        normalizeStringArray(behavior.motion, 8).length > 0
          ? normalizeStringArray(behavior.motion, 8)
          : fallback.behavior.motion,
      adjustment:
        normalizeStringArray(behavior.adjustment, 8).length > 0
          ? normalizeStringArray(behavior.adjustment, 8)
          : fallback.behavior.adjustment
    },
    reference: {
      primaryReference: String(reference.primaryReference || fallback.reference.primaryReference).trim(),
      secondaryReference: String(reference.secondaryReference || fallback.reference.secondaryReference).trim(),
      styleReference: String(reference.styleReference || fallback.reference.styleReference).trim(),
      rules:
        normalizeStringArray(reference.rules, 8).length > 0
          ? normalizeStringArray(reference.rules, 8)
          : fallback.reference.rules
    },
    confidence: {
      appearance: normalizeConfidenceValue(confidence.appearance) ?? fallback.confidence.appearance,
      structure: normalizeConfidenceValue(confidence.structure) ?? fallback.confidence.structure,
      mounting: normalizeConfidenceValue(confidence.mounting) ?? fallback.confidence.mounting
    },
    uncertainties: normalizeStringArray(candidate.uncertainties, 8)
  }
}

function buildTaskConstraints(taskType, productBlueprint) {
  const constraints = []
  const archetype = productBlueprint.identity?.archetype || 'Standing Product'
  const relationships = normalizeStringArray(productBlueprint.relationships?.mustKeep, 10)
  const mountingRelationships = normalizeStringArray(productBlueprint.mounting?.relationship, 10)
  const mountingAllowed = normalizeStringArray(productBlueprint.mounting?.allowed, 10)
  const mountingForbidden = normalizeStringArray(productBlueprint.mounting?.forbidden, 10)
  const usageRelationships = normalizeStringArray(productBlueprint.usage?.spatialRelationship, 10)
  const usageEvidence = normalizeStringArray(productBlueprint.usage?.requiredVisibleEvidence, 10)
  const forbiddenSpatialRelations = normalizeStringArray(productBlueprint.usage?.forbiddenSpatialRelations, 10)

  if (taskType === 'main') {
    constraints.push(
      'Full product visible with no crop.',
      'Centered composition.',
      'Product body occupies about 80% to 90% of frame.',
      'Minimal empty margin around the product.',
      'Pure white background RGB 255,255,255.',
      'No text, no decorative props, no watermark, no added logo.'
    )
  } else {
    constraints.push(
      'Keep appearance, proportions, material, and real structure consistent with primary reference.',
      'Do not create impossible contact relationships.'
    )
  }

  if (relationships.length > 0) {
    constraints.push(...relationships)
  }

  if (archetype !== 'Standing Product' && mountingRelationships.length > 0) {
    constraints.push(...mountingRelationships)
  }

  if (taskType === 'scenario' || taskType === 'steps' || taskType === 'dimensions') {
    constraints.push(...mountingAllowed)
    constraints.push(...mountingForbidden.map((item) => `Avoid ${item}`))
    constraints.push(...usageRelationships)
    constraints.push(...usageEvidence)
    constraints.push(...forbiddenSpatialRelations.map((item) => `Avoid ${item}`))
  }

  if (taskType === 'dimensions') {
    constraints.push('Each measurement label should appear once only.')
  }

  return [...new Set(constraints)].slice(0, 12)
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

function getBlueprintQualityIssues(productBlueprint = {}) {
  const issues = []
  const parts = normalizeStringArray(productBlueprint.structure?.parts, 12)
  const connections = normalizeStringArray(productBlueprint.structure?.connections, 12)
  const colors = normalizeStringArray(productBlueprint.appearance?.primaryColor, 8)
  const archetype = productBlueprint.identity?.archetype || 'Standing Product'

  if (colors.length === 0) issues.push('primary product colors were not identified')
  if (parts.length < 2) issues.push('visible product parts are incomplete')
  if (parts.length >= 2 && connections.length === 0) issues.push('connections between visible parts are missing')

  if (archetype !== 'Standing Product') {
    if (normalizeStringArray(productBlueprint.usage?.contactPoint, 8).length === 0) {
      issues.push('mounting contact points are missing')
    }
    if (normalizeStringArray(productBlueprint.usage?.requiredVisibleEvidence, 8).length === 0) {
      issues.push('visible proof of correct use or mounting is missing')
    }
  }

  return issues
}

function createFixedMainPlan(requestedTask, id) {
  return {
    id,
    name: requestedTask.name,
    type: 'main',
    taskType: 'main',
    taskKey: requestedTask.taskKey,
    purpose: requestedTask.purpose,
    goal: '提升 Amazon 搜索结果点击率，清晰展示完整产品',
    layout: '方形纯白画布，完整产品居中，主体最长边约占画面 85%',
    focus: '完整且真实的产品主体与已确认标配配件',
    visualFocus: '完整且真实的产品主体与已确认标配配件',
    textDensity: 'none',
    style: 'Amazon 主图',
    visualKeywords: [],
    constraints: [
      '完整产品不可裁切',
      '主体最长边约占画面 85% 并居中',
      '纯白背景 RGB 255,255,255',
      '无文字、无装饰、无额外 Logo',
      '不得新增或删除产品结构与配件'
    ],
    hardConstraints: [
      '完整产品不可裁切',
      '主体最长边约占画面 85% 并居中',
      '纯白背景 RGB 255,255,255',
      '无文字、无装饰、无额外 Logo',
      '不得新增或删除产品结构与配件'
    ],
    successCriteria: [
      '产品完整、居中且主体醒目',
      '背景为纯白且边缘清晰',
      '产品结构、颜色、比例和配件与主参考图一致'
    ],
    failureCriteria: [
      '产品被裁切或主体明显偏小偏移',
      '出现文字、装饰物、场景或未确认配件',
      '产品外观或结构被改变'
    ],
    copy: [],
    allowTextOverlay: false,
    strategyBody: MAIN_IMAGE_STRATEGY_ZH,
    promptHint: MAIN_IMAGE_STRATEGY_ZH,
    prompt: MAIN_IMAGE_STRATEGY_ZH,
    visualBlueprint: normalizeVisualBlueprint({}, 'main'),
    promptEn: '',
    promptDirty: false
  }
}

function defaultGoal(taskType) {
  switch (taskType) {
    case 'main':
      return 'Increase CTR'
    case 'dimensions':
      return 'Reduce Return Risk'
    case 'scenario':
    case 'steps':
      return 'Reduce Understanding Cost'
    case 'detail':
      return 'Build Trust'
    case 'summary':
      return 'Highlight Differentiation'
    default:
      return 'Increase Conversion'
  }
}

function defaultLayout(taskType) {
  switch (taskType) {
    case 'main':
      return 'Center Product'
    case 'scenario':
      return 'Product First in Scene'
    case 'detail':
      return 'Tight Detail Crop'
    case 'dimensions':
      return 'Centered Product with Measurement Space'
    case 'summary':
      return 'Balanced Summary Layout'
    default:
      return 'Left Product Right Text'
  }
}

router.post('/', async (req, res) => {
  try {
    const {
      productName,
      listingInfo,
      category,
      marketplace,
      imageLanguage,
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

    if (!productName || !sellingPoints) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'productName and sellingPoints are required'
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

    const imageContentParts = await buildImageContentParts(explicitPrimaryReferenceImageUrl, referenceImages)
    const apiKey = process.env.AGENT_API_KEY || process.env.OPENAI_API_KEY
    const baseUrl =
      process.env.AGENT_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    const model = process.env.AGENT_MODEL || 'gpt-4o-mini'
    const timeoutMs = Number(process.env.AGENT_TIMEOUT_MS || 180000)

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

    const productBlueprintSystemPrompt = `
You are a product-visual forensics specialist for Amazon image production.
Your only job is to understand the real product before any marketing image is planned.
Return JSON only with one top-level key: productBlueprint.

The blueprint must include:
- identity: productType, category, market, archetype
- appearance: primaryColor, material, distinctiveFeatures
- structure: parts, connections, visibleEvidence
- mounting: mountType, supportSurface, placement, connectionType, relationship, allowed, forbidden
- usage: useMode, supportObject, contactPoint, spatialRelationship, effectDirection, requiredVisibleEvidence, forbiddenSpatialRelations
- relationships: mustKeep
- behavior: motion, adjustment
- reference: primaryReference, secondaryReference, styleReference, rules
- confidence: appearance, structure, mounting (0 to 1)
- uncertainties

Evidence rules:
1. Inspect the explicit primary image first. It is the highest authority for shape, color, proportions, structure, printed marks, accessories, and connections.
2. Supporting product images may reveal other angles or usage, but cannot override the primary product identity.
3. Product text explains specifications and intended use, but must not override visible product truth.
4. List concrete visible parts, not broad groups. Include cables, controllers, connectors, jaws, handles, bulbs, buttons, fasteners, and other visually important parts when present.
5. Describe how every major part connects to the next part as one continuous physical product.
6. For mounted or supported products, describe exact contact geometry, inside/outside placement, force or support logic, and visible proof that makes the installation believable.
7. Do not invent hidden geometry or package contents. Put unverified facts in uncertainties.
8. primaryColor may not be empty when colors are visible in the references.
9. visibleEvidence and requiredVisibleEvidence must describe what a generated image must visibly preserve, not abstract product benefits.
`.trim()

    const productBlueprintUserPrompt = `
Product Name: ${trimForModel(productName, 300)}
Category: ${trimForModel(category || 'Not provided', 300)}
Marketplace: Amazon ${marketplace || 'UK'}
Dimensions: ${trimForModel(dimensions || 'Not provided', 900)}
Material: ${trimForModel(material || 'Not provided', 1200)}
Target Audience: ${trimForModel(targetAudience || 'Not provided', 900)}
Selling Points: ${trimForModel(sellingPoints, 3500)}
Full Listing Source: ${trimForModel(listingInfo || 'Not provided', 8000)}
Usage, scene, and supplementary requirements: ${trimForModel(additionalInfo || 'None', 8000)}
Known text signals: ${JSON.stringify(productSignals)}
`.trim()

    const blueprintCompletion = await createAgentCompletion(openai, {
      model,
      messages: [
        { role: 'system', content: productBlueprintSystemPrompt },
        {
          role: 'user',
          content: imageContentParts.length > 0
            ? [{ type: 'text', text: productBlueprintUserPrompt }, ...imageContentParts]
            : productBlueprintUserPrompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 4500
    })

    const blueprintResult = parseCompletionJson(blueprintCompletion, 'Product understanding')
    let productBlueprint = normalizeProductBlueprint(blueprintResult.productBlueprint, {
      productName,
      category,
      marketplace,
      material,
      sellingPoints,
      additionalInfo,
      referenceImages,
      signals: productSignals
    })

    let blueprintQualityIssues = getBlueprintQualityIssues(productBlueprint)
    let blueprintRepairUsage = null
    if (blueprintQualityIssues.length > 0 && imageContentParts.length > 0) {
      const repairPrompt = [
        productBlueprintUserPrompt,
        'The previous blueprint had these quality problems:',
        blueprintQualityIssues.map((issue) => `- ${issue}`).join('\n'),
        'Previous blueprint:',
        JSON.stringify(productBlueprint, null, 2),
        'Re-inspect the images and return a corrected complete productBlueprint. Do not guess; use uncertainties where evidence is insufficient.'
      ].join('\n\n')

      const repairCompletion = await createAgentCompletion(openai, {
        model,
        messages: [
          { role: 'system', content: productBlueprintSystemPrompt },
          {
            role: 'user',
            content: [{ type: 'text', text: repairPrompt }, ...imageContentParts]
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 4500
      })
      const repairResult = parseCompletionJson(repairCompletion, 'Product understanding repair')
      productBlueprint = normalizeProductBlueprint(repairResult.productBlueprint, {
        productName,
        category,
        marketplace,
        material,
        sellingPoints,
        additionalInfo,
        referenceImages,
        signals: productSignals
      })
      blueprintQualityIssues = getBlueprintQualityIssues(productBlueprint)
      blueprintRepairUsage = repairCompletion.usage
    }

    const criticalBlueprintIssues = blueprintQualityIssues.filter((issue) => [
      'visible product parts are incomplete',
      'mounting contact points are missing',
      'visible proof of correct use or mounting is missing'
    ].includes(issue))

    if (criticalBlueprintIssues.length > 0) {
      return res.status(422).json({
        error: 'Product understanding incomplete',
        message: `产品图理解未通过：${criticalBlueprintIssues.join('；')}。请补充更清楚的产品结构图或实际使用图后重新分析。`,
        details: {
          issues: blueprintQualityIssues,
          productBlueprint
        }
      })
    }

    const strategyTasks = requestedTasks.filter((task) => task.taskType !== 'main')
    const strategyTaskDescription = strategyTasks
      .map((item, index) => [
        `Plan ${index + 1} | ${item.name}`,
        `taskKey: ${item.taskKey}`,
        `Task type: ${item.taskType}`,
        `Purpose: ${item.purpose}`,
        `Guidance: ${item.guidance}`
      ].join('\n'))
      .join('\n\n')

    let strategyCompletion = null
    let strategyResult = { imagePlans: [] }
    if (strategyTasks.length > 0) {
      const strategySystemPrompt = `
You are a senior Amazon listing image strategist for high-volume, non-branded products.
The product has already been analyzed. Plan only the requested non-main images.
Return JSON only with one top-level key: imagePlans.
imagePlans must contain exactly ${strategyTasks.length} items in the same order as the task list.

Each plan must include:
- taskKey, name, type
- goal: the commercial result or buyer question this image resolves
- focus: the single purchase reason assigned to this image
- layout: a product-specific composition, not a generic template name
- constraints, successCriteria, failureCriteria
- copy: exact short ${marketplaceLanguage} text allowed to appear in the image
- allowTextOverlay
- strategyBody: the canonical Chinese strategy reviewed and edited by operators

Strategy rules:
1. strategyBody is the source of truth. Write 6 to 10 clear Chinese sentences that an operator can understand without reading hidden JSON fields.
2. State what buyer question the image answers, which one selling point it uses, what the viewer must see, how the real product is positioned or used, the exact allowed on-image copy, and what would make the image unusable.
3. Use one primary purchase reason per image. Distribute supplied selling points across plans and do not repeat a selling point unless product truth requires it.
4. The image must prove the selling point visually. Do not plan invisible internal mechanisms as if they can be photographed.
5. Use the supplied usage steps, pain points, installation methods, and scene requirements when relevant. Do not replace them with generic lifestyle scenes.
6. For products with mounting, contact, movement, or direction, describe visible geometry and success evidence precisely.
7. Text is forbidden only for the Amazon main image, which is handled separately. Other image types may use concise text when it improves conversion or understanding.
8. copy must come from confirmed selling points, dimensions, usage, or supplied requirements. Localize and shorten it for Amazon ${marketplace || 'UK'}, but never invent a new claim.
9. Prefer one headline plus at most one short supporting line. Do not split one benefit into three redundant labels.
10. Do not force left-product/right-text or any repeated layout. Choose composition from the product shape, visible evidence, and buyer question.
11. Product Blueprint is factual evidence. Do not dump blueprint fields into strategyBody; convert them into a useful selling image plan.
12. Respect uncertainties. Do not build a strategy around an unverified variant, accessory, quantity, or performance claim.
`.trim()

      const strategyUserPrompt = `
Validated Product Blueprint
${JSON.stringify(productBlueprint, null, 2)}

Product and business source
- Product Name: ${trimForModel(productName, 300)}
- Marketplace: Amazon ${marketplace || 'UK'}
- Image Language: ${marketplaceLanguage}
- Selling Points: ${trimForModel(sellingPoints, 3500)}
- Dimensions: ${trimForModel(dimensions || 'Not provided', 900)}
- Full Listing Source: ${trimForModel(listingInfo || 'Not provided', 7000)}
- Usage, scenes, and supplementary requirements: ${trimForModel(additionalInfo || 'None', 7000)}
- Custom Design Notes: ${trimForModel(designNotes || 'None', 600)}
- Font Preference: ${fontStyleLabel}
- Brand Color Preference: ${brandColorLabel}

Requested image tasks
${strategyTaskDescription}

Blueprint validation warnings
${blueprintQualityIssues.length > 0 ? blueprintQualityIssues.join(' | ') : 'None'}
`.trim()

      strategyCompletion = await createAgentCompletion(openai, {
        model,
        messages: [
          { role: 'system', content: strategySystemPrompt },
          { role: 'user', content: strategyUserPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.25,
        max_tokens: Math.min(11000, 3200 + strategyTasks.length * 1000)
      })
      strategyResult = parseCompletionJson(strategyCompletion, 'Image strategy')

      if (!Array.isArray(strategyResult.imagePlans) || strategyResult.imagePlans.length !== strategyTasks.length) {
        throw new Error(`Agent must return exactly ${strategyTasks.length} non-main image plans`)
      }
    }

    let nonMainPlanIndex = 0
    const normalizedPlans = requestedTasks.map((requestedTask, index) => {
      if (requestedTask.taskType === 'main') {
        return createFixedMainPlan(requestedTask, index + 1)
      }

      const plan = strategyResult.imagePlans[nonMainPlanIndex] || {}
      nonMainPlanIndex += 1

      const normalizedConstraints =
        normalizeStringArray(plan.constraints, 12).length > 0
          ? normalizeStringArray(plan.constraints, 12)
          : buildTaskConstraints(requestedTask.taskType, productBlueprint)

      const normalizedFocus = String(
        plan.focus || (requestedTask.taskType === 'main' ? '完整产品主体' : '当前图片核心卖点')
      ).trim()
      const strategyBody = String(plan.strategyBody || plan.prompt || plan.promptHint || '').trim()
      const promptHint = String(plan.promptHint || strategyBody).trim()

      const allowTextOverlay = Boolean(plan.allowTextOverlay)

      return {
        id: index + 1,
        name: String(plan.name || requestedTask.name).trim(),
        type: String(plan.type || requestedTask.taskType).trim(),
        taskType: requestedTask.taskType,
        taskKey: requestedTask.taskKey,
        purpose: String(plan.purpose || requestedTask.purpose).trim(),
        goal: String(plan.goal || defaultGoal(requestedTask.taskType)).trim(),
        layout: String(plan.layout || defaultLayout(requestedTask.taskType)).trim(),
        focus: normalizedFocus,
        visualFocus: normalizedFocus,
        textDensity: String(plan.textDensity || '').trim(),
        style: String(plan.style || '').trim(),
        visualKeywords: normalizeStringArray(plan.visualKeywords, 8),
        constraints: normalizedConstraints.slice(0, 6),
        hardConstraints: normalizedConstraints.slice(0, 6),
        successCriteria: normalizeStringArray(plan.successCriteria, 4),
        failureCriteria: normalizeStringArray(plan.failureCriteria, 4),
        copy: allowTextOverlay ? normalizeStringArray(plan.copy, 2) : [],
        allowTextOverlay,
        strategyBody: strategyBody || promptHint,
        promptHint,
        prompt: strategyBody || promptHint,
        visualBlueprint: normalizeVisualBlueprint({}, requestedTask.taskType),
        promptEn: String(plan.promptEn || plan.englishPrompt || '').trim(),
        promptDirty: false
      }
    })

    const responseData = {
      productBlueprint,
      imagePlans: normalizedPlans,
      _meta: {
        requestedImageCount: requestedTasks.length,
        productUnderstandingWarnings: blueprintQualityIssues,
        productUnderstandingRepaired: Boolean(blueprintRepairUsage),
        generatedAt: new Date().toISOString()
      }
    }

    res.json({
      success: true,
      data: responseData,
      usage: {
        productUnderstanding: blueprintCompletion.usage,
        productUnderstandingRepair: blueprintRepairUsage,
        strategy: strategyCompletion?.usage || null
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
