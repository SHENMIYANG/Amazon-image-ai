import express from 'express'
import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import { getMarketplaceLanguage } from '../utils/productModel.js'
import { translatePlanPromptIfNeeded } from './generate.js'
import { readUploadFileBufferWithRetry, resolveUploadPathFromUrl } from '../utils/uploads.js'
import {
  buildProductSignals as buildAgentProductSignals,
  normalizeProductBlueprint as normalizeAgentProductBlueprint
} from '../services/agent/productBlueprint.js'
import { normalizeStrategyPlans as normalizeAgentStrategyPlans } from '../services/agent/planNormalizer.js'
import {
  buildStrategyPrompts,
  extractSellingPointList as extractAgentSellingPointList,
  getComplexityDefinition as getAgentComplexityDefinition
} from '../services/agent/strategyPrompt.js'

const router = express.Router()

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

    const productSignals = buildAgentProductSignals(fullContext)
    const marketplaceLanguage = getTargetImageLanguage({
      marketplace: marketplace || 'UK',
      imageLanguage
    })
    const fontStyleLabel = getFontStyleLabel(fontPreference)
    const brandColorLabel = getBrandColorLabel(brandColorMode, brandColor)
    const complexityDefinition = getAgentComplexityDefinition(complexity)

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
    const sellingPointList = extractAgentSellingPointList(sellingPoints || listingInfo)
    const {
      systemPrompt: combinedSystemPrompt,
      userPrompt: combinedUserPrompt
    } = buildStrategyPrompts({
      strategyTasks,
      productName,
      category,
      marketplace,
      marketplaceLanguage,
      dimensions,
      material,
      targetAudience,
      sellingPoints,
      sellingPointList,
      listingInfo,
      additionalInfo,
      designNotes,
      productSignals,
      fontStyleLabel,
      brandColorLabel,
      complexity,
      complexityDefinition
    })

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
    const productBlueprint = normalizeAgentProductBlueprint(combinedResult.productBlueprint, {
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

    const normalizedPlans = normalizeAgentStrategyPlans({
      requestedTasks,
      strategyPlans,
      productBlueprint
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

