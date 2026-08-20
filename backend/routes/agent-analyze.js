import express from 'express'
import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import { getMarketplaceLanguage } from '../utils/productModel.js'
import { getAssetReferenceFromUrl, readAssetUrlBuffer } from '../services/storage.js'
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
import { persistStrategyResult } from '../services/persistence/workbenchRepository.js'

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

function createAgentAnalyzeError({ stage, status, message, cause } = {}) {
  const error = new Error(message || '策略分析失败')
  error.stage = stage || 'unknown'
  error.status = status || 500
  error.cause = cause
  return error
}

function getUpstreamFailure(error) {
  const upstreamStatus = getErrorStatus(error)
  const isTimeout = error?.name === 'APIConnectionTimeoutError' || /timeout|timed out/i.test(String(error?.message || ''))
  const status = isTimeout ? 504 : (upstreamStatus >= 500 ? 502 : upstreamStatus)
  const upstreamRequestId = String(error?.request_id || error?.requestId || '').trim()
  const detail = String(error?.message || '').trim()
  const suffix = upstreamRequestId ? `（上游请求 ID：${upstreamRequestId}）` : ''

  return createAgentAnalyzeError({
    stage: 'model_request',
    status: status >= 400 && status < 600 ? status : 502,
    message: isTimeout
      ? `策略模型等待超时${suffix}。本次没有自动重试，请确认上游服务后手动重试。`
      : `策略模型服务请求失败${suffix}${detail ? `：${detail}` : ''}`,
    cause: error
  })
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

export function getDistinctSellingPoints(sellingPoints = '', listingInfo = '') {
  const points = String(sellingPoints || '').trim()
  const listing = String(listingInfo || '').trim()
  if (!points || !listing) return points

  return normalizeContextSegment(listing).includes(normalizeContextSegment(points))
    ? ''
    : points
}

function getReferenceRoleLabel(role = '') {
  const labels = {
    primary_product: 'the explicit primary product image and the highest authority for product truth',
    supporting_product: 'a supporting product image that may supplement angle, contents, usage, or structure without overriding primary product truth',
    layout_style_reference: 'a layout or style reference that may guide composition, visual hierarchy, or atmosphere only and must not change product truth',
    regeneration_reference: 'a user-added correction reference for this regeneration only; it may guide the requested correction without changing primary product truth'
  }

  return labels[role] || labels.supporting_product
}

async function buildImageContentParts(primaryReferenceImageUrl = '', referenceImages = [], referenceImageRoles = []) {
  const contentParts = []
  const normalizedReferenceImages = Array.isArray(referenceImages) ? referenceImages.filter(Boolean) : []
  const roleByUrl = new Map(
    (Array.isArray(referenceImageRoles) ? referenceImageRoles : [])
      .filter((item) => item?.url)
      .map((item) => [item.url, item.role])
  )
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
    const reference = getAssetReferenceFromUrl(imageUrl)
    if (!reference) continue

    const role = imageUrl === primaryReferenceImageUrl
      ? 'primary_product'
      : roleByUrl.get(imageUrl) || 'supporting_product'
    contentParts.push({
      type: 'text',
      text: `Reference image ${index + 1} is ${getReferenceRoleLabel(role)}.`
    })

    const ext = path.extname(reference.objectKey).toLowerCase()
    const mimeType =
      ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
    const fileBuffer = await readAssetUrlBuffer(imageUrl)

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

export function getIncompleteStrategyPlanIds(plans = []) {
  return (Array.isArray(plans) ? plans : [])
    .filter((plan) =>
      plan.taskType !== 'main' && (
        !String(plan.strategyContent || '').trim() ||
        !String(plan.promptEn || '').trim()
      )
    )
    .map((plan) => plan.id)
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
      primaryReferenceImageUrl = '',
      referenceImageRoles = [],
      workspaceId = '',
      sourceSystem = '',
      externalProductId = ''
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

    const distinctSellingPoints = getDistinctSellingPoints(sellingPoints, listingInfo)
    const fullContext = buildDedupedContext([
      listingInfo,
      additionalInfo,
      designNotes,
      productName,
      category,
      dimensions,
      material,
      distinctSellingPoints
    ])

    const productSignals = buildAgentProductSignals(fullContext)
    const marketplaceLanguage = getTargetImageLanguage({
      marketplace: marketplace || 'UK',
      imageLanguage
    })
    const fontStyleLabel = getFontStyleLabel(fontPreference)
    const brandColorLabel = getBrandColorLabel(brandColorMode, brandColor)
    const complexityDefinition = getAgentComplexityDefinition(complexity)

    let imageContentParts
    try {
      imageContentParts = await buildImageContentParts(
        explicitPrimaryReferenceImageUrl,
        referenceImages,
        referenceImageRoles
      )
    } catch (error) {
      throw createAgentAnalyzeError({
        stage: 'reference_images',
        status: 409,
        message: `参考图片尚未准备好或读取失败：${error.message}`,
        cause: error
      })
    }
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

    const strategyTasks = requestedTasks
    const sellingPointList = extractAgentSellingPointList(distinctSellingPoints || listingInfo)
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
      sellingPoints: distinctSellingPoints,
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
    let combinedCompletion
    try {
      combinedCompletion = await createAgentCompletion(openai, {
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
    } catch (error) {
      throw getUpstreamFailure(error)
    }

    logAgentAnalyze('upstream_completed', {
      requestId,
      upstreamElapsedMs: Date.now() - upstreamStartedAt,
      totalElapsedMs: Date.now() - startedAt,
      usage: combinedCompletion.usage || null,
      clientClosed
    })

    let combinedResult
    try {
      combinedResult = parseCompletionJson(combinedCompletion, 'Product understanding and image strategy')
    } catch (error) {
      throw createAgentAnalyzeError({
        stage: 'model_response',
        status: 502,
        message: `策略模型返回的数据不是完整 JSON：${error.message}`,
        cause: error
      })
    }
    const productBlueprint = normalizeAgentProductBlueprint(combinedResult.productBlueprint, {
      productName,
      listingInfo,
      category,
      marketplace,
      dimensions,
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

    const incompletePlanIds = getIncompleteStrategyPlanIds(normalizedPlans)

    if (incompletePlanIds.length > 0) {
      const incompleteTaskIds = incompletePlanIds.join('、')
      logAgentAnalyze('incomplete_strategy_response', {
        requestId,
        incompleteTaskIds,
        elapsedMs: Date.now() - startedAt
      })
      return res.status(502).json({
        error: 'Incomplete strategy response',
        message: `策略模型没有完整返回图${incompleteTaskIds}的中文策略和英文执行稿。本次不会额外调用翻译接口，请重新生成策略。`,
        requestId
      })
    }

    const responseData = {
      productBlueprint,
      imagePlans: normalizedPlans,
      _meta: {
        requestedImageCount: requestedTasks.length,
        productUnderstandingWarnings: [],
        productUnderstandingNeedsReview: false,
        productUnderstandingRepaired: false,
        generatedAt: new Date().toISOString(),
        requestId
      }
    }

    const persistence = await persistStrategyResult({
      input: {
        ...req.body,
        workspaceId,
        sourceSystem,
        externalProductId
      },
      output: responseData,
      requestId,
      model,
      durationMs: Date.now() - startedAt,
      actor: req.auth
    })

    if (req.auth && !persistence) {
      return res.status(500).json({
        error: 'Persistence failed',
        message: '策略已生成，但工作区记录保存失败。请检查数据库后重试。'
      })
    }

    if (persistence) {
      const planIdsByTaskKey = new Map(
        persistence.imagePlans.map((plan) => [plan.taskKey, plan])
      )
      responseData.imagePlans = responseData.imagePlans.map((plan) => ({
        ...plan,
        databasePlanId: planIdsByTaskKey.get(plan.taskKey)?.imagePlanId,
        databasePlanVersionId: planIdsByTaskKey.get(plan.taskKey)?.imagePlanVersionId
      }))
      responseData._meta.persistence = {
        workspaceId: persistence.workspaceId,
        inputVersionId: persistence.inputVersionId,
        strategyRunId: persistence.strategyRunId,
        referenceAssetIds: persistence.referenceAssetIds
      }
    }

    logAgentAnalyze('success', {
      requestId,
      elapsedMs: Date.now() - startedAt,
      imagePlanCount: normalizedPlans.length,
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
      stage: error.stage || 'unknown',
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
      stage: error.stage || 'unknown',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

export default router

