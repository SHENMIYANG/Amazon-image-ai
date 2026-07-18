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
import { normalizeVisualBlueprint } from '../utils/visualBlueprints.js'
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
    copy: [],
    allowTextOverlay: false,
    strategyContent: MAIN_IMAGE_STRATEGY_ZH,
    visualBlueprint: normalizeVisualBlueprint({}, 'main'),
    promptEn: MAIN_IMAGE_STRATEGY_EN,
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

function getStrategyModeInstruction(strategyMode, strategyTasks = []) {
  const count = strategyTasks.length

  if (strategyMode === 'feature_bundle') {
    return [
      `This is a focused ${count}-image selling-point bundle, not a full 7-image listing set.`,
      'Prioritize the strongest distinct buying reasons first.',
      'Do not force summary, gift, or decorative scene roles unless the product information clearly demands them.',
      'If selling points are fewer than image count, expand with installation, usage, compatibility, fit, or material trust angles instead of repeating one benefit.',
      'Every image must feel essential to conversion.'
    ].join(' ')
  }

  if (strategyMode === 'compact_conversion') {
    return [
      `This is a compact ${count}-image conversion set.`,
      'Cover only the highest-priority buyer questions.',
      'Prefer strong selling reasons, installation clarity, fit or size clarity, and real-use understanding.',
      'Avoid low-value filler images.'
    ].join(' ')
  }

  if (strategyMode === 'main_only') {
    return 'Only the fixed Amazon main image is needed. No non-main strategy planning is required.'
  }

  return [
    'This is a broader Amazon listing image set.',
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

    const strategyTasks = requestedTasks.filter((task) => task.taskType !== 'main')
    const strategyMode = classifyStrategyMode(strategyTasks)
    const strategyModeInstruction = getStrategyModeInstruction(strategyMode, strategyTasks)
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
You are a senior Amazon listing image strategist for high-volume, non-branded products.
Do the product understanding and the requested non-main image planning in one pass.
Return JSON only with two top-level keys: productBlueprint and imagePlans.
imagePlans must contain exactly ${strategyTasks.length} items in the same order as the task list.

productBlueprint must include:
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

Each image plan must include:
- taskKey, name, type
- imageRole
- buyerQuestion
- primarySellingPoint
- goal
- focus
- layout
- constraints
- copy: exact short ${marketplaceLanguage} text allowed to appear in the image
- allowTextOverlay
- strategyContent: the canonical Chinese strategy reviewed and edited by operators
- promptEn: a faithful English execution version of strategyContent for the image model

Rules:
1. Inspect the explicit primary image first. It is the highest authority for shape, color, proportions, structure, printed marks, accessories, and connections.
2. Supporting product images may reveal other angles or usage, but cannot override the primary product identity.
3. Product text explains specifications and intended use, but must not override visible product truth.
4. List concrete visible parts, not broad groups. Include cables, controllers, connectors, jaws, handles, bulbs, buttons, fasteners, and other visually important parts when present.
5. Describe how every major part connects to the next part as one continuous physical product.
6. For mounted or supported products, describe exact contact geometry, inside/outside placement, force or support logic, and visible proof that makes the installation believable.
7. Do not invent hidden geometry or package contents. Put unverified facts in uncertainties.
8. primaryColor may not be empty when colors are visible in the references.
9. visibleEvidence and requiredVisibleEvidence must describe what a generated image must visibly preserve, not abstract product benefits.
10. strategyContent is the single source of truth for operators and final image execution. Write it as 4 to 6 short Chinese lines only, using this exact structure when applicable: 目标：... ; 构图：... ; 重点：... ; 文案：... ; 要求：... .
11. Every line in strategyContent must carry unique value. Do not restate the same idea in different wording.
12. promptEn must be a faithful English execution version of strategyContent. It is translation for model execution, not a new plan. Do not add, remove, summarize, beautify, or reinterpret requirements.
13. Use one primary purchase reason per image. Distribute selling points across plans and avoid repeating the same benefit unless product truth requires it.
14. The image must prove the selling point visually. Do not plan invisible internal mechanisms as if they can be photographed.
15. Use supplied usage steps, pain points, installation methods, and scene requirements when relevant. Do not replace them with generic lifestyle scenes.
16. For products with mounting, contact, movement, or direction, describe visible geometry and success evidence precisely.
17. Text is forbidden only for the Amazon main image, which is handled separately. Other image types may use concise text when it improves conversion or understanding.
18. copy must come from confirmed selling points, dimensions, usage, or supplied requirements. Localize and shorten it for Amazon ${marketplace || 'UK'}, but never invent a new claim.
19. Prefer one headline plus at most one short supporting line. Do not split one benefit into several redundant labels.
20. Do not force repeated layout templates. Choose composition from product shape, visible evidence, and buyer question.
21. Respect uncertainties. Do not build a strategy around an unverified variant, accessory, quantity, or performance claim.
22. Each non-main image must answer a different buyer question and must have a different primary role within the set.
23. Do not reuse the same primary selling point across multiple images unless the user explicitly requests repetition.
24. If only 3 to 5 feature images are requested, treat the set as a focused conversion bundle rather than a full listing sequence.
25. When image count is limited, prioritize strong buying reasons, installation or usage clarity, compatibility or fit, and trust-building detail before low-value filler content.
26. Scene images must prove real use context. They may not exist only for mood, beauty, or decoration.
27. Dimension images must focus on size, fit, clearance, scale, or compatibility and must not repeat feature-copy as their core message.
28. Steps or installation images must focus on how the product is used, mounted, attached, or operated and must not duplicate feature-image duties.
29. Summary images must reinforce value or trust and must not mechanically restate previous image roles.
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
Full Listing Source: ${trimForModel(listingInfo || 'Not provided', 7000)}
Usage, scenes, and supplementary requirements: ${trimForModel(additionalInfo || 'None', 7000)}
Custom Design Notes: ${trimForModel(designNotes || 'None', 600)}
Known text signals: ${JSON.stringify(productSignals)}
Font Preference: ${fontStyleLabel}
Brand Color Preference: ${brandColorLabel}

Requested non-main image tasks
${strategyTaskDescription || 'No non-main image tasks requested.'}

Planning mode
${strategyMode}

Planning rule
${strategyModeInstruction}
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
      buyerQuestion: '',
      primarySellingPoint: '',
      goal: '',
      focus: '',
      layout: '',
      constraints: [],
      copy: [],
      allowTextOverlay: task.taskType !== 'main',
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

      const normalizedFocus = String(
        plan.focus || (requestedTask.taskType === 'main' ? '完整产品主体' : '当前图片核心卖点')
      ).trim()
      const strategyContent = String(plan.strategyContent || plan.strategyBody || plan.prompt || '').trim()

      const allowTextOverlay = Boolean(plan.allowTextOverlay)

      return {
        id: index + 1,
        name: String(plan.name || requestedTask.name).trim(),
        type: String(plan.type || requestedTask.taskType).trim(),
        taskType: requestedTask.taskType,
        taskKey: requestedTask.taskKey,
        imageRole: String(plan.imageRole || '').trim(),
        buyerQuestion: String(plan.buyerQuestion || '').trim(),
        primarySellingPoint: String(plan.primarySellingPoint || plan.focus || '').trim(),
        purpose: String(plan.purpose || requestedTask.purpose).trim(),
        goal: String(plan.goal || defaultGoal(requestedTask.taskType)).trim(),
        layout: String(plan.layout || defaultLayout(requestedTask.taskType)).trim(),
        focus: normalizedFocus,
        textDensity: String(plan.textDensity || '').trim(),
        style: String(plan.style || '').trim(),
        visualKeywords: normalizeStringArray(plan.visualKeywords, 8),
        constraints: normalizeStringArray(plan.constraints, 12).slice(0, 6),
        hardConstraints: normalizeStringArray(plan.hardConstraints || plan.constraints, 12).slice(0, 6),
        copy: allowTextOverlay ? normalizeStringArray(plan.copy, 2) : [],
        allowTextOverlay,
        strategyContent,
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
