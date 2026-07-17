import express from 'express'
import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import { buildGlobalRules } from '../config/globalRules.js'
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

  for (const [index, imageUrl] of orderedReferenceImages.slice(0, 5).entries()) {
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
      material: materialItems
    },
    structure: {
      parts,
      connections
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
          : fallback.appearance.material
    },
    structure: {
      parts:
        normalizeStringArray(structure.parts, 10).length > 0
          ? normalizeStringArray(structure.parts, 10)
          : fallback.structure.parts,
      connections:
        normalizeStringArray(structure.connections, 10).length > 0
          ? normalizeStringArray(structure.connections, 10)
          : fallback.structure.connections
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
    }
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
      complexity,
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
    const globalRules = buildGlobalRules({
      marketplace: marketplace || 'UK',
      imageLanguage: marketplaceLanguage,
      fontPreference,
      brandColorMode,
      brandColor
    })

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

    const taskFrameworkDescription = requestedTasks
      .map((item, index) => [
        `Image ${index + 1} | ${item.name}`,
        `Task type: ${item.taskType}`,
        `Purpose: ${item.purpose}`,
        `Guidance: ${item.guidance}`
      ].join('\n'))
      .join('\n\n')

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

    const systemPrompt = `
You are a senior Amazon listing image strategist.

Architecture:
1. Global Rules are fixed engine rules.
2. Product Blueprint describes the product itself.
3. Visual Blueprint is code-defined and must NOT be invented by you.
4. Image Strategy is per-image planning.

Return JSON only.
The top-level object must contain:
- productBlueprint
- imagePlans

productBlueprint must include:
- identity
- appearance
- structure
- mounting
- usage
- relationships
- behavior
- reference
- confidence

identity must include:
- productType
- category
- market
- archetype

mounting should focus on product attributes:
- mountType
- supportSurface
- placement
- connectionType
- relationship
- allowed
- forbidden

usage must explain how the real product is physically used in a scene:
- useMode
- supportObject
- contactPoint
- spatialRelationship
- effectDirection
- requiredVisibleEvidence
- forbiddenSpatialRelations

imagePlans must contain exactly ${requestedTasks.length} items in the same order as the selected image task list.

Each image plan must include:
- id
- name
- type
- goal
- focus
- layout
- constraints
- successCriteria
- failureCriteria
- copy
- promptHint

Rules:
1. Build productBlueprint first from the product itself.
2. Do not generate visualBlueprint. That layer is handled by code templates.
3. Do not write long prompts. promptHint must stay concise, editable, and Chinese.
4. constraints must be short, hard, and non-negotiable for that image.
5. copy must be a short Chinese text array, not paragraphs.
6. Use reference priority correctly: product references control structure, style references control only composition and mood.
7. Avoid SKU-specific hardcoded environmental assumptions unless clearly supported by product data and references.
8. Prefer general mounting relationships such as support edge, outer surface, hanging point, flush attachment, or freestanding placement.
9. Main image must obey Amazon hero-image rules.
10. Inspect the primary image before planning. Extract visible parts, connections, contact geometry, orientation, and operating direction from the references and product information.
11. The primary image is the highest authority for appearance and structure. Supporting images only clarify unseen angles, details, or usage; they must never redefine the product.
12. For mounted products, describe a valid contact relationship: what touches what, which side each object occupies, how the product is supported, and what visible evidence proves the mounting is physically possible.
13. Never invent SKU-specific mounting facts. If the references and product information do not establish a relationship, keep it generic and lower mounting confidence.
14. For scenario and steps images, successCriteria must describe visible proof that the use or installation is physically correct. failureCriteria must describe visible results that make the image unusable.
15. Do not repeat generic product descriptions inside successCriteria or failureCriteria. Use short, visually verifiable statements.
`.trim()

    const userPrompt = `
Product Input
- Product Name: ${trimForModel(productName, 300)}
- Category: ${trimForModel(category || 'Not provided', 300)}
- Marketplace: ${marketplace || 'UK'}
- Image Language: ${marketplaceLanguage}
- Font Preference: ${fontStyleLabel}
- Brand Color Preference: ${brandColorLabel}
- Dimensions: ${trimForModel(dimensions || 'Not provided', 500)}
- Material: ${trimForModel(material || 'Not provided', 500)}
- Target Audience: ${trimForModel(targetAudience || 'Not provided', 500)}
- Additional Info: ${trimForModel(additionalInfo || 'None', 1200)}
- Custom Design Notes: ${trimForModel(designNotes || 'None', 600)}
- Complexity: ${complexity || 'L2'}

Selling Points
${trimForModel(sellingPoints, 1200)}

Task List
${taskFrameworkDescription}

Global Rules
${JSON.stringify(globalRules, null, 2)}

Known Product Signals
${JSON.stringify(productSignals, null, 2)}

Planning Guidance
- Product Blueprint should describe the product itself, not generic engine rules.
- Mounting should describe support surfaces, placement, and relationships in reusable terms.
- Image Strategy should say why each image exists and what must not go wrong.
- Keep outputs concise and execution-ready.
`.trim()

    const completion = await createAgentCompletion(openai, {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: imageContentParts.length > 0
            ? [{ type: 'text', text: userPrompt }, ...imageContentParts]
            : userPrompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 4200
    })

    let rawContent = completion.choices[0].message.content || ''
    rawContent = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    const firstBrace = rawContent.indexOf('{')
    const lastBrace = rawContent.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      rawContent = rawContent.slice(firstBrace, lastBrace + 1)
    }

    const result = JSON.parse(rawContent)

    if (!Array.isArray(result.imagePlans) || result.imagePlans.length !== requestedTasks.length) {
      throw new Error(`Agent must return exactly ${requestedTasks.length} image plans`)
    }

    const productBlueprint = normalizeProductBlueprint(result.productBlueprint, {
      productName,
      category,
      marketplace,
      material,
      sellingPoints,
      additionalInfo,
      referenceImages,
      signals: productSignals
    })

    result.imagePlans = result.imagePlans.map((plan, index) => {
      const requestedTask = requestedTasks[index]
      const normalizedConstraints =
        normalizeStringArray(plan.constraints, 12).length > 0
          ? normalizeStringArray(plan.constraints, 12)
          : buildTaskConstraints(requestedTask.taskType, productBlueprint)

      const normalizedFocus = String(
        plan.focus || (requestedTask.taskType === 'main' ? '完整产品主体' : '当前图片核心卖点')
      ).trim()
      const promptHint = String(plan.promptHint || plan.prompt || '').trim()

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
        constraints: normalizedConstraints,
        hardConstraints: normalizedConstraints,
        successCriteria: normalizeStringArray(plan.successCriteria, 8),
        failureCriteria: normalizeStringArray(plan.failureCriteria, 8),
        copy: normalizeStringArray(plan.copy, 6),
        promptHint,
        prompt: promptHint,
        visualBlueprint: normalizeVisualBlueprint({}, requestedTask.taskType),
        promptEn: String(plan.promptEn || plan.englishPrompt || '').trim(),
        promptDirty: false
      }
    })

    const responseData = {
      globalRules,
      globalConstraints: globalRules,
      productBlueprint,
      imagePlans: result.imagePlans,
      _meta: {
        complexity: complexity || 'L2',
        requestedImageCount: requestedTasks.length,
        generatedAt: new Date().toISOString()
      }
    }

    res.json({
      success: true,
      data: responseData,
      usage: completion.usage
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
