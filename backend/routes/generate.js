import express from 'express'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import FormData from 'form-data'
import zlib from 'zlib'
import sharp from 'sharp'
import crypto from 'crypto'
import {
  getMarketplaceLanguage,
  inferArchetype,
  normalizeStringArray
} from '../utils/productModel.js'
import { postJsonWithRetry } from '../utils/upstreamRetry.js'
import { normalizeVisualBlueprint } from '../utils/visualBlueprints.js'
import { materializeAssetUrls, writeAsset } from '../services/storage.js'
import { persistGenerationResult } from '../services/persistence/workbenchRepository.js'

const router = express.Router()
const strategyTranslationCache = new Map()
const MAX_TRANSLATION_CACHE_ENTRIES = 200

function getMaxReferenceImages() {
  const configuredLimit = Number(process.env.IMAGE_MAX_REFERENCE_IMAGES || 8)
  return Number.isFinite(configuredLimit)
    ? Math.max(1, Math.min(8, Math.floor(configuredLimit)))
    : 8
}

export function buildGenerationSuccessResponse({ images, persistence, persistenceRequired }) {
  const response = {
    success: true,
    images,
    timestamp: new Date().toISOString(),
    persistence
  }

  if (persistenceRequired && !persistence) {
    response.persistenceWarning = '图片已生成，但生成记录保存失败。请检查数据库。'
  }

  return response
}

router.post('/', async (req, res) => {
  const generationRequestId = `generation-${Date.now()}-${Math.round(Math.random() * 1000000)}`
  const startedAt = Date.now()
  let cleanupReferenceFiles = async () => {}
  try {
    const {
      listing,
      imagePlans,
      resolution,
      referenceImages,
      primaryReferenceImageUrl,
      referenceImageRoles,
      complexity,
      productBlueprint,
      executionContext
    } = req.body

    const hasLegacyPayload = listing && Array.isArray(imagePlans) && imagePlans.length > 0
    const hasExecutionPayload = executionContext?.product && executionContext?.strategy

    if (!hasLegacyPayload && !hasExecutionPayload) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'executionContext or legacy listing and imagePlans are required'
      })
    }

    const {
      executionListing,
      executionPlans,
      executionResolution,
      executionReferenceImages,
      executionPrimaryReferenceImageUrl,
      executionReferenceImageRoles,
      executionComplexity
    } = normalizeExecutionRequest({
      listing,
      imagePlans,
      resolution,
      referenceImages,
      primaryReferenceImageUrl,
      referenceImageRoles,
      complexity,
      productBlueprint,
      executionContext
    })

    const hasReferenceImages = executionReferenceImages && executionReferenceImages.length > 0
    const plansMissingSavedPrompt = executionPlans.filter((plan) => {
      const taskType = plan.taskType
      return taskType !== 'main' && (
        plan.promptDirty ||
        !String(plan.promptEn || '').trim()
      )
    })

    if (plansMissingSavedPrompt.length > 0) {
      return res.status(400).json({
        error: 'Unsaved English execution strategy',
        message: `图${plansMissingSavedPrompt.map((plan) => plan.id).join('、')}的英文执行稿未保存，请先保存后再生成。`
      })
    }

    const apiKey = process.env.IMAGE_GEN_API_KEY || process.env.OPENAI_API_KEY
    const baseUrl = process.env.IMAGE_GEN_BASE_URL || process.env.OPENAI_BASE_URL
    const model = process.env.IMAGE_GENERATION_MODEL || process.env.OPENAI_MODEL

    if (!apiKey || apiKey === 'sk-your-api-key-here') {
      return res.status(500).json({
        error: 'Missing API Key',
        message: '后端未配置 IMAGE_GEN_API_KEY，请检查 backend/.env'
      })
    }
    if (!baseUrl) {
      return res.status(500).json({
        error: 'Missing Base URL',
        message: '后端未配置 IMAGE_GEN_BASE_URL，请检查 backend/.env'
      })
    }
    if (!model) {
      return res.status(500).json({
        error: 'Missing Model',
        message: '后端未配置 IMAGE_GENERATION_MODEL，请检查 backend/.env'
      })
    }

    const size = executionResolution === '4k' ? '4096x4096' : '2048x2048'
    const explicitPrimaryReferenceImageUrl =
      executionPrimaryReferenceImageUrl || executionReferenceImages?.[0] || ''

    let refImagePaths = []
    let orderedReferenceRoles = []
    if (hasReferenceImages) {
      const roleByUrl = new Map(
        (Array.isArray(executionReferenceImageRoles) ? executionReferenceImageRoles : [])
          .filter((item) => item?.url)
          .map((item) => [item.url, item.role])
      )
      const candidateReferenceImages = [
        explicitPrimaryReferenceImageUrl,
        ...executionReferenceImages.filter((imageUrl) => imageUrl && imageUrl !== explicitPrimaryReferenceImageUrl)
      ].filter(Boolean).filter((imageUrl, index, source) => source.indexOf(imageUrl) === index)
      const referencePriority = (imageUrl) => {
        if (imageUrl === explicitPrimaryReferenceImageUrl) return 0
        if (roleByUrl.get(imageUrl) === 'regeneration_reference') return 1
        return 2
      }
      const orderedReferenceImages = candidateReferenceImages
        .sort((left, right) => referencePriority(left) - referencePriority(right))
        .slice(0, getMaxReferenceImages())

      const materializedReferences = await materializeAssetUrls(orderedReferenceImages)
      refImagePaths = materializedReferences.paths
      cleanupReferenceFiles = materializedReferences.cleanup
      orderedReferenceRoles = orderedReferenceImages.map((imageUrl, index) => ({
        index: index + 1,
        role: roleByUrl.get(imageUrl) || (imageUrl === explicitPrimaryReferenceImageUrl ? 'primary_product' : 'supporting_product')
      }))

      const missingRefPath = refImagePaths.find((imagePath) => !fs.existsSync(imagePath))
      if (missingRefPath) {
        return res.status(400).json({
          error: 'Reference image not found',
          message: '参考图片不存在，请重新上传'
        })
      }
    }

    const generatedImages = []

    for (const plan of executionPlans) {
      try {
        const taskType = plan.taskType || plan.type || 'feature'
        const normalizedPlan = {
          ...plan,
          originalPrompt: plan.strategyContent || ''
        }
        const taskReferenceAssets = selectReferenceAssetsForTask({
          taskType,
          refImagePaths,
          orderedReferenceRoles
        })
        const prompt = buildAmazonPrompt(
          executionListing,
          normalizedPlan,
          executionComplexity || 'L2',
          size,
          explicitPrimaryReferenceImageUrl,
          taskReferenceAssets.orderedReferenceRoles
        )

        const generatedImage = await callGPTImage2({
          prompt,
          refImagePaths: hasReferenceImages ? taskReferenceAssets.refImagePaths : [],
          size,
          apiKey,
          baseUrl,
          model,
          taskType: plan.taskType
        })

        const requestedWidth = Number(size.split('x')[0])
        const requestedHeight = Number(size.split('x')[1])
        const hasDimensions = Number.isFinite(generatedImage.width) && Number.isFinite(generatedImage.height)

        generatedImages.push({
          imageId: plan.id,
          name: plan.name,
          taskType: plan.taskType || null,
          imageRole: plan.imageRole || null,
          sellingFocus: plan.sellingFocus || null,
          currentImageProductUsage: plan.currentImageProductUsage,
          executionRules: plan.executionRules,
          copy: plan.copy || [],
          referenceImagesUsed: hasReferenceImages ? taskReferenceAssets.refImagePaths.length : 0,
          referenceImageRolesUsed: taskReferenceAssets.orderedReferenceRoles,
          imageUrl: generatedImage.imageUrl,
          prompt,
          promptEn: normalizedPlan.promptEn || '',
          executionPromptEn: prompt,
          promptZh: normalizedPlan.originalPrompt || plan.strategyContent || '',
          status: 'completed',
          resolution: size,
          actualWidth: generatedImage.width,
          actualHeight: generatedImage.height,
          actualResolution: hasDimensions ? (generatedImage.width + 'x' + generatedImage.height) : null,
          sizeMatchesRequest: hasDimensions ? generatedImage.width === requestedWidth && generatedImage.height === requestedHeight : null
        })
      } catch (err) {
        const errorMessage = formatGenerateError(err)
        console.error('生成图' + plan.id + ' 失败:', err.response?.data || errorMessage)
        generatedImages.push({
          imageId: plan.id,
          name: plan.name,
          taskType: plan.taskType || null,
          imageRole: plan.imageRole || null,
          sellingFocus: plan.sellingFocus || null,
          status: 'failed',
          error: errorMessage,
          prompt: buildAmazonPrompt(
            executionListing,
            plan,
            executionComplexity || 'L2',
            size,
            explicitPrimaryReferenceImageUrl,
            selectReferenceAssetsForTask({
              taskType: plan.taskType,
              refImagePaths,
              orderedReferenceRoles
            }).orderedReferenceRoles
          )
        })
      }
    }

    const persistence = await persistGenerationResult({
      executionContext,
      images: generatedImages,
      model,
      requestId: generationRequestId,
      durationMs: Date.now() - startedAt,
      actor: req.auth
    })

    res.json(buildGenerationSuccessResponse({
      images: generatedImages,
      persistence,
      persistenceRequired: Boolean(req.auth)
    }))
  } catch (error) {
    console.error('Generate error:', error.response?.data || error.message)

    if (error.response) {
      res.status(error.response.status).json({
        error: 'API error',
        message: error.response.data?.error?.message || 'Unknown error'
      })
    } else {
      res.status(500).json({
        error: 'Server error',
        message: error.message
      })
    }
  } finally {
    await cleanupReferenceFiles()
  }
})

async function callGPTImage2({ prompt, refImagePaths = [], size, apiKey, baseUrl, model, taskType = 'feature' }) {
  const form = new FormData()
  form.append('model', model)
  form.append('prompt', prompt)
  form.append('size', size)
  form.append('quality', process.env.IMAGE_GEN_QUALITY || 'high')
  form.append('n', '1')
  form.append('response_format', 'b64_json')
  form.append('output_format', 'png')

  const hasReferenceImages = Array.isArray(refImagePaths) && refImagePaths.length > 0
  const endpoint = hasReferenceImages ? '/images/edits' : '/images/generations'

  if (hasReferenceImages) {
    const primaryRefPath = refImagePaths[0]
    const primaryRefBuffer = fs.readFileSync(primaryRefPath)
    const primaryRefDimensions = readImageDimensions(primaryRefBuffer)

    refImagePaths.forEach((imagePath, index) => {
      const ext = path.extname(imagePath).toLowerCase()
      const contentType = ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg'
      const fieldName = refImagePaths.length > 1 ? 'image[]' : 'image'

      form.append(fieldName, fs.createReadStream(imagePath), {
        filename: path.basename(imagePath) || `reference-${index + 1}.png`,
        contentType
      })
    })

    if (refImagePaths.length === 1 && primaryRefDimensions.width && primaryRefDimensions.height) {
      form.append('mask', createTransparentMaskPng(primaryRefDimensions.width, primaryRefDimensions.height), {
        filename: 'mask.png',
        contentType: 'image/png'
      })
    }
  }

  const response = await axios.post(
    baseUrl + endpoint,
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: 'Bearer ' + apiKey
      },
      timeout: getImageGenerationTimeoutMs()
    }
  )

  const result = response.data?.data?.[0]
  if (!result) {
    throw new Error('图片接口没有返回生成结果')
  }

  let imageBuffer
  if (result.b64_json) {
    imageBuffer = Buffer.from(result.b64_json, 'base64')
  } else if (result.url) {
    const imageResponse = await axios.get(result.url, {
      responseType: 'arraybuffer',
      timeout: Number(process.env.IMAGE_DOWNLOAD_TIMEOUT_MS || 180000)
    })
    imageBuffer = Buffer.from(imageResponse.data)
  } else {
    throw new Error('图片接口既没有返回 b64_json，也没有返回图片 URL')
  }

  if (taskType === 'main') {
    imageBuffer = await normalizeAmazonMainImage(imageBuffer, size)
  }

  const dimensions = readImageDimensions(imageBuffer)
  assertGeneratedImageDimensions(dimensions, size)
  const outputFilename = 'generated-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + '.png'
  const stored = await writeAsset({ objectKey: `generated/${outputFilename}`, body: imageBuffer, contentType: 'image/png' })

  return {
    imageUrl: stored.url,
    width: dimensions.width,
    height: dimensions.height
  }
}

function getImageGenerationTimeoutMs() {
  const timeoutMs = Number(process.env.IMAGE_GEN_TIMEOUT_MS || 900000)
  return Number.isFinite(timeoutMs) && timeoutMs >= 60000 ? timeoutMs : 900000
}

function formatGenerateError(err) {
  const rawMessage = err.response?.data?.message || err.response?.data?.error?.message || err.message || '图片生成失败'
  if (err.code === 'INVALID_GENERATED_IMAGE_DIMENSIONS') {
    return rawMessage
  }
  const isTimeout = err.code === 'ECONNABORTED' || String(rawMessage).toLowerCase().includes('timeout')

  if (isTimeout) {
    return '图片生成接口超过 ' + Math.round(getImageGenerationTimeoutMs() / 1000) + ' 秒仍未返回，请稍后重试，或先降低复杂度、减少同时生成的图片数量。'
  }

  return rawMessage
}

function normalizeExecutionPlan(plan = {}) {
  const source = plan || {}

  return {
    ...source,
    taskType: source.taskType || source.type || 'feature',
    type: source.taskType || source.type || 'feature',
    sellingFocus: source.sellingFocus || source.primarySellingPoint || '',
    currentImageProductUsage: source.currentImageProductUsage || source.imageProductUsage || {},
    strategyContent: source.strategyContent || source.strategyBody || source.prompt || '',
    promptEn: source.promptEn || '',
    promptDirty: source.promptDirty === true,
    executionRules: Array.isArray(source.executionRules)
      ? source.executionRules
      : Array.isArray(source.constraints)
        ? source.constraints
        : [],
    copy: Array.isArray(source.copy) ? source.copy : []
  }
}

function normalizeExecutionRequest({
  listing = {},
  imagePlans = [],
  resolution = '2k',
  referenceImages = [],
  primaryReferenceImageUrl = '',
  referenceImageRoles = [],
  complexity = 'L2',
  productBlueprint,
  executionContext
} = {}) {
  const executionProduct = executionContext?.product && typeof executionContext.product === 'object'
    ? executionContext.product
    : {}
  const executionStrategy = executionContext?.strategy && typeof executionContext.strategy === 'object'
    ? executionContext.strategy
    : null
  const executionReferences = executionContext?.references && typeof executionContext.references === 'object'
    ? executionContext.references
    : {}
  const executionOutput = executionContext?.output && typeof executionContext.output === 'object'
    ? executionContext.output
    : {}

  const executionListing = {
    ...executionProduct,
    productBlueprint:
      executionProduct.productBlueprint ||
      productBlueprint ||
      listing.productBlueprint
  }

  const rawExecutionPlans = executionStrategy
    ? [
        {
          ...imagePlans[0],
          ...executionStrategy,
          type: executionStrategy.taskType || executionStrategy.type || imagePlans[0]?.type,
          taskType: executionStrategy.taskType || executionStrategy.type || imagePlans[0]?.taskType
        }
      ]
    : imagePlans
  const executionPlans = rawExecutionPlans.map((plan) => normalizeExecutionPlan(plan))

  return {
    executionListing,
    executionPlans,
    executionResolution: executionOutput.resolution || resolution || '2k',
    executionReferenceImages: Array.isArray(executionReferences.referenceImages)
      ? executionReferences.referenceImages
      : referenceImages,
    executionPrimaryReferenceImageUrl:
      executionReferences.primaryReferenceImageUrl || primaryReferenceImageUrl || '',
    executionReferenceImageRoles: Array.isArray(executionReferences.referenceImageRoles)
      ? executionReferences.referenceImageRoles
      : referenceImageRoles,
    executionComplexity: executionOutput.complexity || executionProduct.complexity || complexity || 'L2'
  }
}

function selectReferenceAssetsForTask({ taskType = 'feature', refImagePaths = [], orderedReferenceRoles = [] } = {}) {
  if (!Array.isArray(refImagePaths) || refImagePaths.length === 0) {
    return { refImagePaths: [], orderedReferenceRoles: [] }
  }

  if (taskType === 'main') {
    return {
      refImagePaths: [refImagePaths[0]].filter(Boolean),
      orderedReferenceRoles: orderedReferenceRoles.slice(0, 1)
    }
  }

  return {
    refImagePaths,
    orderedReferenceRoles
  }
}

function readImageDimensions(buffer) {
  const pngDimensions = readPngDimensions(buffer)
  if (pngDimensions.width && pngDimensions.height) return pngDimensions

  const jpegDimensions = readJpegDimensions(buffer)
  if (jpegDimensions.width && jpegDimensions.height) return jpegDimensions

  const webpDimensions = readWebpDimensions(buffer)
  if (webpDimensions.width && webpDimensions.height) return webpDimensions

  return { width: null, height: null }
}

export function assertGeneratedImageDimensions(dimensions = {}, requestedSize = '2048x2048') {
  const [requestedWidth, requestedHeight] = String(requestedSize || '').split('x').map(Number)
  const width = Number(dimensions?.width)
  const height = Number(dimensions?.height)

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    const error = new Error('图片接口返回了无法识别尺寸的图片，未保存该结果。')
    error.code = 'INVALID_GENERATED_IMAGE_DIMENSIONS'
    throw error
  }

  if (width !== requestedWidth || height !== requestedHeight) {
    const error = new Error(`图片接口返回 ${width}x${height}，但本次要求 ${requestedSize} 方图，未保存该结果。`)
    error.code = 'INVALID_GENERATED_IMAGE_DIMENSIONS'
    throw error
  }
}

function readPngDimensions(buffer) {
  const pngSignature = '89504e470d0a1a0a'
  const isPng = buffer.length >= 24 && buffer.subarray(0, 8).toString('hex') === pngSignature

  if (!isPng) {
    return { width: null, height: null }
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  }
}

function readJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return { width: null, height: null }
  }

  let offset = 2
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }

    const marker = buffer[offset + 1]
    const segmentLength = buffer.readUInt16BE(offset + 2)
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)

    if (isStartOfFrame) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5)
      }
    }

    offset += 2 + segmentLength
  }

  return { width: null, height: null }
}

function readWebpDimensions(buffer) {
  const isWebp = buffer.length >= 30 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'

  if (!isWebp) {
    return { width: null, height: null }
  }

  const chunkType = buffer.subarray(12, 16).toString('ascii')

  if (chunkType === 'VP8X' && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    }
  }

  if (chunkType === 'VP8 ' && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    }
  }

  if (chunkType === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21)
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    }
  }

  return { width: null, height: null }
}

function containsChinese(text = '') {
  return /[\u3400-\u9fff]/.test(text)
}

function getTargetImageLanguage(listing = {}) {
  return listing.imageLanguage || getMarketplaceLanguage(listing.marketplace || 'UK')
}

function getTypographyStyle(fontPreference = 'auto') {
  const fontMap = {
    auto: 'a typography style that matches the product type, marketplace, and visual strategy',
    'geometric-sans': 'a clean geometric sans-serif typography style',
    'bold-sans': 'a bold industrial sans-serif typography style',
    'elegant-serif': 'an elegant serif typography style',
    'rounded-playful': 'a rounded friendly typography style',
    'handwritten-playful': 'a playful handwritten typography style',
    arial: 'Arial or a similar neutral sans-serif typography style',
    times: 'Times New Roman or a similar serif typography style',
    roboto: 'Roboto or a similar modern sans-serif typography style',
    'open-sans': 'Open Sans or a similar readable sans-serif typography style',
    montserrat: 'Montserrat or a similar modern branding typography style'
  }

  return fontMap[fontPreference] || fontMap.auto
}

export async function normalizeAmazonMainImage(imageBuffer, size) {
  const [requestedWidth, requestedHeight] = String(size || '2048x2048')
    .split('x')
    .map((value) => Number(value))
  const canvasWidth = Number.isFinite(requestedWidth) && requestedWidth > 0 ? requestedWidth : 2048
  const canvasHeight = Number.isFinite(requestedHeight) && requestedHeight > 0 ? requestedHeight : canvasWidth
  const source = sharp(imageBuffer).removeAlpha().flatten({ background: '#ffffff' })
  const { data, info } = await source.clone().raw().toBuffer({ resolveWithObject: true })
  const backgroundColor = estimateCornerBackground(data, info.width, info.height, info.channels)
  const bounds = detectProductBounds(data, info.width, info.height, info.channels, backgroundColor)

  if (!bounds) {
    return source
      .resize(canvasWidth, canvasHeight, { fit: 'contain', background: '#ffffff' })
      .png()
      .toBuffer()
  }

  // The detected box includes a small safety edge so pale product pixels are not clipped.
  // A 87% working box yields an approximately 85% visible subject after that safety edge.
  const targetWidth = Math.max(1, Math.round(canvasWidth * 0.87))
  const targetHeight = Math.max(1, Math.round(canvasHeight * 0.87))
  const productBuffer = await source
    .extract({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height })
    .resize(targetWidth, targetHeight, {
      fit: 'inside',
      withoutEnlargement: false
    })
    .png()
    .toBuffer()
  const productMetadata = await sharp(productBuffer).metadata()
  const left = Math.round((canvasWidth - productMetadata.width) / 2)
  const top = Math.round((canvasHeight - productMetadata.height) / 2)

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: '#ffffff'
    }
  })
    .composite([{ input: productBuffer, left, top }])
    .png()
    .toBuffer()
}

function estimateCornerBackground(data, width, height, channels) {
  const sampleSize = Math.max(4, Math.min(24, Math.round(Math.min(width, height) * 0.015)))
  const samples = []
  const origins = [
    [0, 0],
    [Math.max(0, width - sampleSize), 0],
    [0, Math.max(0, height - sampleSize)],
    [Math.max(0, width - sampleSize), Math.max(0, height - sampleSize)]
  ]

  for (const [startX, startY] of origins) {
    for (let y = startY; y < Math.min(height, startY + sampleSize); y += 1) {
      for (let x = startX; x < Math.min(width, startX + sampleSize); x += 1) {
        const offset = (y * width + x) * channels
        samples.push([data[offset], data[offset + 1], data[offset + 2]])
      }
    }
  }

  const median = (channel) => {
    const values = samples.map((sample) => sample[channel]).sort((a, b) => a - b)
    return values[Math.floor(values.length / 2)] ?? 255
  }

  return [median(0), median(1), median(2)]
}

function detectProductBounds(data, width, height, channels, backgroundColor = [255, 255, 255]) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  const threshold = 18

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels
      const distanceFromBackground = Math.max(
        Math.abs(backgroundColor[0] - data[offset]),
        Math.abs(backgroundColor[1] - data[offset + 1]),
        Math.abs(backgroundColor[2] - data[offset + 2])
      )
      if (distanceFromBackground < threshold) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) return null

  const padding = Math.max(2, Math.round(Math.max(width, height) * 0.006))
  const left = Math.max(0, minX - padding)
  const top = Math.max(0, minY - padding)
  const right = Math.min(width - 1, maxX + padding)
  const bottom = Math.min(height - 1, maxY + padding)

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1
  }
}

function buildMainImagePrompt(listing, imagePlan, productBlueprint, visualBlueprint, resolution, primaryReferenceImageUrl) {
  const visibleParts = normalizeStringArray(productBlueprint.structure?.mainParts, 10)
  const strategyConstraints = normalizeStringArray(imagePlan?.executionRules || imagePlan?.constraints, 10)
  const executionHint = getExecutionHint(imagePlan)

  const lines = [
    'Create one Amazon-compliant main product image.',
    'Use the primary reference image only for product truth.',
    'Fully recompose the image from scratch and do not preserve the original framing, crop, background, hand, tank, desk, wall, or environment from the reference photo.',
    'Show the complete product centered in a square canvas on a pure white RGB 255,255,255 background.',
    'The assembled product must occupy about 85% of the frame with balanced clean margins on all sides.',
    'The full product must remain visible with no cutoff and no missing parts.',
    'Use a close studio packshot camera distance so the product looks large, readable, and dominant.'
  ]

  if (visibleParts.length > 0) {
    lines.push('Keep these real product parts visible and structurally connected: ' + visibleParts.join(', ') + '.')
  }

  lines.push(
    'No text, no watermark, no added logo, no props, no animals, no environment, no decorative elements.',
    'Preserve real product shape, proportions, materials, color, and included accessories from the primary reference image.',
    'Do not invent or remove parts.',
    'Output size: ' + resolution + '.',
    'Main image visual blueprint: camera ' + visualBlueprint.camera + ', composition ' + visualBlueprint.composition + ', crop ' + visualBlueprint.crop + ', lighting ' + visualBlueprint.lighting + '.'
  )

  if (primaryReferenceImageUrl) {
    lines.push('The primary reference image has absolute priority over all supporting references.')
  }

  if (strategyConstraints.length > 0) {
    lines.push('Hard constraints: ' + strategyConstraints.join(' | ') + '.')
  }

  if (executionHint) {
    lines.push('Main image strategy: ' + executionHint + '.')
    lines.push('This strategy may refine angle, confirmed accessory arrangement, or lighting, but it may not override the fixed white-background, centered, full-product, approximately 85% framing, no-text, and no-decoration rules above.')
  }

  return lines.join(' ')
}

function cleanPromptText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
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

function getExecutionHint(imagePlan = {}) {
  const reusableEnglishPrompt = !imagePlan.promptDirty
    ? cleanPromptText(imagePlan.promptEn)
    : ''
  if (reusableEnglishPrompt) return reusableEnglishPrompt

  return cleanPromptText(imagePlan.strategyContent || '')
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

function getProductBlueprint(listing = {}) {
  const blueprint = listing?.productBlueprint && typeof listing.productBlueprint === 'object'
    ? listing.productBlueprint
    : {}
  const rawContext = [
    listing.productName,
    listing.category,
    listing.listingInfo,
    listing.sellingPoints,
    listing.material,
    listing.additionalInfo
  ].filter(Boolean).join(' ')

  const identity = blueprint.identity && typeof blueprint.identity === 'object' ? blueprint.identity : {}
  const appearance = blueprint.appearance && typeof blueprint.appearance === 'object' ? blueprint.appearance : {}
  const structure = blueprint.structure && typeof blueprint.structure === 'object' ? blueprint.structure : {}
  const usage = blueprint.usage && typeof blueprint.usage === 'object' ? blueprint.usage : {}
  const productRules = blueprint.productRules && typeof blueprint.productRules === 'object' ? blueprint.productRules : {}
  const installationRules = blueprint.installationRules && typeof blueprint.installationRules === 'object' ? blueprint.installationRules : {}
  const bundleRules = blueprint.bundleRules && typeof blueprint.bundleRules === 'object' ? blueprint.bundleRules : {}
  const appearanceRules = blueprint.appearanceRules && typeof blueprint.appearanceRules === 'object' ? blueprint.appearanceRules : {}
  const reference = blueprint.reference && typeof blueprint.reference === 'object' ? blueprint.reference : {}

  return {
    identity: {
      productType: cleanPromptText(identity.productType || listing.productName || 'Product'),
      category: cleanPromptText(identity.category || listing.category || 'General'),
      corePurpose: cleanPromptText(identity.corePurpose || ''),
      market: cleanPromptText(identity.market || ('Amazon ' + (listing.marketplace || 'UK'))),
      archetype: cleanPromptText(identity.archetype || inferArchetype(rawContext))
    },
    confirmedDimensions: cleanPromptText(blueprint.confirmedDimensions || listing.dimensions || ''),
    appearance: {
      color: cleanPromptText(appearance.color || normalizeStringArray(appearance.primaryColor, 6).join(', ')),
      material: cleanPromptText(
        appearance.material ||
          normalizeStringArray(appearance.material, 6).join(', ') ||
          normalizeLineList(listing.material, 5, 120).join(', ')
      ),
      visualStyle: cleanPromptText(appearance.visualStyle || normalizeStringArray(appearance.distinctiveFeatures, 10).join(', '))
    },
    structure: {
      mainParts: normalizeStringArray(structure.mainParts || structure.parts, 12),
      importantRelationships: normalizeStringArray(structure.importantRelationships || structure.connections, 12)
    },
    usage: {
      usageScenario: cleanPromptText(usage.usageScenario || usage.useMode || ''),
      userInteraction: cleanPromptText(
        usage.userInteraction ||
          [
            ...normalizeStringArray(usage.supportObject, 8),
            ...normalizeStringArray(usage.contactPoint, 8),
            ...normalizeStringArray(usage.spatialRelationship, 10),
            ...normalizeStringArray(usage.effectDirection, 8),
            ...normalizeStringArray(usage.requiredVisibleEvidence, 8)
          ].join('; ')
      ),
      supportObject: normalizeStringArray(usage.supportObject, 8),
      contactPoint: normalizeStringArray(usage.contactPoint, 8),
      spatialRelationship: normalizeStringArray(usage.spatialRelationship, 10),
      effectDirection: normalizeStringArray(usage.effectDirection, 8),
      requiredVisibleEvidence: normalizeStringArray(usage.requiredVisibleEvidence, 10),
      forbiddenSpatialRelations: normalizeStringArray(usage.forbiddenSpatialRelations || usage.forbidden, 10)
    },
    productRules: {
      mustKeep: normalizeStringArray(productRules.mustKeep || blueprint.relationships?.mustKeep, 12),
      forbidden: normalizeStringArray(productRules.forbidden || blueprint.mounting?.forbidden, 12)
    },
    installationRules: compactObject({
      mountType: cleanPromptText(installationRules.mountType || blueprint.mounting?.mountType || ''),
      supportSurface: normalizeStringArray(installationRules.supportSurface || blueprint.mounting?.supportSurface, 8),
      placement: normalizeStringArray(installationRules.placement || blueprint.mounting?.placement, 8),
      allowed: normalizeStringArray(installationRules.allowed || blueprint.mounting?.allowed, 10),
      relationship: normalizeStringArray(installationRules.relationship || blueprint.mounting?.relationship, 10),
      forbidden: normalizeStringArray(installationRules.forbidden || blueprint.mounting?.forbidden, 10)
    }),
    bundleRules: compactObject({
      includedItems: normalizeStringArray(bundleRules.includedItems, 16),
      quantity: cleanPromptText(bundleRules.quantity || ''),
      arrangement: cleanPromptText(bundleRules.arrangement || '')
    }),
    appearanceRules: compactObject({
      pairMustMatch: Boolean(appearanceRules.pairMustMatch),
      shape: cleanPromptText(appearanceRules.shape || ''),
      texture: cleanPromptText(appearanceRules.texture || '')
    }),
    reference: {
      primary: cleanPromptText(reference.primary || reference.primaryReference || 'Primary product image'),
      supporting: normalizeStringArray(reference.supporting, 8),
      rules: normalizeStringArray(reference.rules, 8)
    },
    executionCompatibility: {
      legacyReferenceRules: normalizeStringArray(reference.rules, 8)
    }
  }
}

function getVisualBlueprint(imagePlan = {}, taskType = 'feature') {
  return normalizeVisualBlueprint(imagePlan?.visualBlueprint || {}, taskType)
}

function formatReferenceRoles(referenceImageRoles = []) {
  if (!Array.isArray(referenceImageRoles) || referenceImageRoles.length === 0) return ''

  const labels = {
    primary_product: 'primary product truth reference',
    supporting_product: 'supporting product angle or detail reference',
    layout_style_reference: 'layout or style reference only; it must not change product truth',
    regeneration_reference: 'user-added reference for this regeneration only'
  }

  return referenceImageRoles
    .map((item) => `image ${item.index}: ${labels[item.role] || item.role || 'supporting reference'}`)
    .join(' | ')
}

function summarizeProductTruth(productBlueprint = {}) {
  const facts = []
  const add = (label, values) => {
    const items = Array.isArray(values) ? values.filter(Boolean) : [values].filter(Boolean)
    if (items.length > 0) facts.push(`${label}: ${items.join(', ')}`)
  }

  add('product', productBlueprint.identity?.productType)
  add('confirmed dimensions', productBlueprint.confirmedDimensions)
  add('real colors', productBlueprint.appearance?.color)
  add('material', productBlueprint.appearance?.material)
  add('visible parts', productBlueprint.structure?.mainParts)
  add('part relationships', productBlueprint.structure?.importantRelationships)
  add('must keep', productBlueprint.productRules?.mustKeep)
  add('forbidden', productBlueprint.productRules?.forbidden)
  return facts
}

function summarizeVisualEvidence(productBlueprint = {}) {
  return normalizeStringArray(
    [
      ...(productBlueprint.structure?.importantRelationships || []),
      ...(productBlueprint.usage?.supportObject || []),
      ...(productBlueprint.usage?.contactPoint || []),
      ...(productBlueprint.usage?.spatialRelationship || []),
      ...(productBlueprint.usage?.effectDirection || []),
      ...(productBlueprint.usage?.requiredVisibleEvidence || []),
      ...(productBlueprint.installationRules?.relationship || []),
      ...(productBlueprint.installationRules?.allowed || []),
      ...(productBlueprint.bundleRules?.includedItems || [])
    ],
    14
  )
}

function summarizeCurrentImageProductUsage(imagePlan = {}) {
  const usage = imagePlan.currentImageProductUsage
  if (!usage || typeof usage !== 'object') return []

  const lines = []
  const add = (label, values) => {
    const items = Array.isArray(values) ? values.filter(Boolean) : [values].filter(Boolean)
    if (items.length > 0) lines.push(`${label}: ${items.join(', ')}`)
  }

  add('display mode', usage.displayMode)
  add('required items for this image', usage.requiredItems)
  add('optional items for this image', usage.optionalItems)
  add('reason', usage.reason)

  return lines
}

function getProductPresentationFallback(imagePlan = {}, taskType = '') {
  const displayMode = String(imagePlan?.currentImageProductUsage?.displayMode || '').trim()
  if (displayMode === 'full_set') {
    return 'Show the confirmed complete set and its required items exactly as the strategy states.'
  }

  if (!displayMode && taskType !== 'detail') {
    return 'Keep the product recognizable and do not crop away important structure unless the strategy requests a close-up.'
  }

  return ''
}

function summarizeProductExclusions(productBlueprint = {}) {
  return normalizeStringArray(
    [
      ...(productBlueprint.productRules?.forbidden || []),
      ...(productBlueprint.usage?.forbiddenSpatialRelations || []),
      ...(productBlueprint.installationRules?.forbidden || [])
    ],
    12
  )
}

function summarizeUsageContract(productBlueprint = {}) {
  const lines = []
  const add = (label, values) => {
    const items = Array.isArray(values) ? values.filter(Boolean) : [values].filter(Boolean)
    if (items.length > 0) lines.push(`${label}: ${items.join(', ')}`)
  }

  add('real usage scenario', productBlueprint.usage?.usageScenario)
  add('real user interaction', productBlueprint.usage?.userInteraction)
  add('support/contact object', productBlueprint.usage?.supportObject)
  add('contact point', productBlueprint.usage?.contactPoint)
  add('spatial relationship', productBlueprint.usage?.spatialRelationship)
  add('effect or force direction', productBlueprint.usage?.effectDirection)
  add('mount type', productBlueprint.installationRules?.mountType)
  add('support surface', productBlueprint.installationRules?.supportSurface)
  add('placement', productBlueprint.installationRules?.placement)
  add('allowed installation relationship', productBlueprint.installationRules?.relationship)
  add('bundle contents', productBlueprint.bundleRules?.includedItems)
  add('bundle quantity', productBlueprint.bundleRules?.quantity)
  add('bundle arrangement', productBlueprint.bundleRules?.arrangement)

  return lines
}

function getExactCopyInstruction(listing, imagePlan) {
  const copyLines = summarizeCopyLines(imagePlan)
  if (copyLines.length === 0) {
    return 'Do not add on-image text, labels, icons, badges, logos, or decorative lettering unless the strategy explicitly requires them.'
  }

  return [
    `Render only this exact ${getTargetImageLanguage(listing)} on-image copy: ${copyLines.map((line) => `"${line}"`).join(' | ')}.`,
    'Do not add, rewrite, repeat, split, or invent any other words.'
  ].join(' ')
}

function createTransparentMaskPng(width, height) {
  const bytesPerPixel = 4
  const stride = width * bytesPerPixel
  const raw = Buffer.alloc((stride + 1) * height, 0)

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
  }

  const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex')
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const idat = zlib.deflateSync(raw)

  return Buffer.concat([
    pngSignature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const lengthBuffer = Buffer.alloc(4)
  lengthBuffer.writeUInt32BE(data.length, 0)

  const crcBuffer = Buffer.alloc(4)
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer])
}

let crcTable = null

function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
      }
      crcTable[n] = c >>> 0
    }
  }

  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

function summarizeCopyLines(imagePlan = {}) {
  return Array.isArray(imagePlan?.copy)
    ? imagePlan.copy.map((item) => cleanPromptText(item)).filter(Boolean).slice(0, 8)
    : []
}

function buildPromptWithLimit(coreSections = [], optionalSections = [], suffix = '') {
  const maxChars = Math.max(2400, Number(process.env.IMAGE_PROMPT_MAX_CHARS || 6500))
  const normalizeSection = (value) => cleanPromptText(value).replace(/[.\s]+$/g, '')
  const compactCore = coreSections.filter(Boolean).map(normalizeSection).filter(Boolean)
  const compactOptional = optionalSections.filter(Boolean).map(normalizeSection).filter(Boolean)
  let prompt = compactCore.join('. ')

  for (const section of compactOptional) {
    const candidate = prompt ? (prompt + '. ' + section) : section
    if (candidate.length > maxChars) break
    prompt = candidate
  }

  const suffixText = cleanPromptText(suffix)
  if (suffixText) {
    const candidate = prompt ? (prompt + '. ' + suffixText) : suffixText
    prompt = candidate.length <= maxChars ? candidate : (prompt + '. High quality, professional photography, sharp focus, realistic lighting.')
  }

  return prompt
}

export async function translatePlanPromptIfNeeded(plan, listing, resolution) {
  const sourcePrompt = plan?.strategyContent || ''
  const sourceExecutionRules = normalizeStringArray(plan?.executionRules || plan?.constraints, 12).join('\n')
  const promptEn = plan?.promptEn || ''

  if (promptEn && !plan.promptDirty) {
    return {
      ...plan,
      originalPrompt: sourcePrompt,
      prompt: promptEn,
      promptEn
    }
  }

  if (!containsChinese(sourcePrompt) && !containsChinese(sourceExecutionRules)) {
    return {
      ...plan,
      prompt: sourcePrompt,
      promptEn: sourcePrompt
    }
  }

  const apiKey = process.env.AGENT_API_KEY || process.env.OPENAI_API_KEY
  const baseUrl = process.env.AGENT_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const model = process.env.AGENT_MODEL || 'gpt-4o-mini'

  if (!apiKey || apiKey === 'sk-your-api-key-here') {
    throw new Error('检测到中文策略，但后端没有配置 AGENT_API_KEY，无法自动翻译成英文 prompt')
  }

  const targetLanguage = getTargetImageLanguage(listing)
  const cacheKey = crypto
    .createHash('sha256')
    .update([model, targetLanguage, sourcePrompt, sourceExecutionRules].join('\n'))
    .digest('hex')
  const cachedTranslation = strategyTranslationCache.get(cacheKey)
  if (cachedTranslation) {
    return {
      ...plan,
      originalPrompt: sourcePrompt,
      prompt: cachedTranslation,
      promptEn: cachedTranslation,
      promptDirty: false
    }
  }

  const productBlueprint = getProductBlueprint(listing)

  const userMessageSections = [
    'Target language: English',
    'Product terminology that must remain exact:',
    '- Product type: ' + (productBlueprint.identity?.productType || 'Product'),
    '- Key parts: ' + normalizeStringArray(productBlueprint.structure?.mainParts || productBlueprint.structure?.parts, 12).join(', '),
    '- Target image text language: ' + targetLanguage
  ]
  if (sourceExecutionRules) {
    userMessageSections.push('- Hard execution rules that must remain exact:', sourceExecutionRules)
  }
  userMessageSections.push(
    '',
    'Canonical Chinese strategy:',
    sourcePrompt
  )
  if (sourceExecutionRules) {
    userMessageSections.push('', 'Canonical Chinese execution rules:', sourceExecutionRules)
  }
  const userMessage = userMessageSections.join('\n')

  const response = await postJsonWithRetry(
    baseUrl + '/chat/completions',
    {
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a controlled visual strategy converter. Convert the canonical Chinese image strategy and execution rules into natural English for an image model. Preserve every requirement, relationship, selling focus, prohibition, execution rule, and exact quoted on-image copy. You may convert Chinese concepts into natural visual English, but you may not add new objects, scene elements, claims, layout decisions, product features, or instructions that are not already supported by the Chinese strategy and execution rules. Do not remove or summarize content. This is controlled visual conversion, not replanning. Return only the English execution strategy.'
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      temperature: 0.2,
      max_tokens: 1400
    },
    {
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      timeout: Number(process.env.STRATEGY_TRANSLATION_TIMEOUT_MS || 180000)
    },
    {
      maxAttempts: 2,
      retryDelayMs: 1200
    }
  )

  const translatedPrompt = response.data?.choices?.[0]?.message?.content?.trim()
  if (!translatedPrompt) {
    throw new Error('中文策略自动翻译失败：翻译接口没有返回英文 prompt')
  }

  strategyTranslationCache.set(cacheKey, translatedPrompt)
  if (strategyTranslationCache.size > MAX_TRANSLATION_CACHE_ENTRIES) {
    const oldestKey = strategyTranslationCache.keys().next().value
    strategyTranslationCache.delete(oldestKey)
  }

  return {
    ...plan,
    originalPrompt: sourcePrompt,
    prompt: translatedPrompt,
    promptEn: translatedPrompt,
    promptDirty: false
  }
}

export function buildAmazonPrompt(
  listing,
  imagePlan,
  complexity = 'L2',
  resolution = '2048x2048',
  primaryReferenceImageUrl = '',
  referenceImageRoles = []
) {
  const taskType = imagePlan?.taskType || imagePlan?.type || 'feature'
  const productBlueprint = getProductBlueprint(listing)
  const executionHint = getExecutionHint(imagePlan)

  if (taskType === 'main') {
    return buildMainImagePrompt(
      listing,
      imagePlan,
      productBlueprint,
      getVisualBlueprint(imagePlan, taskType),
      resolution,
      primaryReferenceImageUrl
    )
  }

  const truthFacts = summarizeProductTruth(productBlueprint)
  const negativeFacts = summarizeProductExclusions(productBlueprint)
  const executionRules = normalizeStringArray(imagePlan?.executionRules || imagePlan?.constraints, 10)
  const complexityLine = {
    L1: 'Keep the visual expression simple, direct, low-density, and easy to read at a glance. Avoid unnecessary decorative layers or extra proof panels.',
    L2: 'Use a balanced ecommerce layout with one clear primary proof and limited supporting information.',
    L3: 'Allow richer supporting proof, stronger scene integration, and denser but still controlled information hierarchy without changing the strategy mission.'
  }[String(complexity || 'L2').toUpperCase()] || 'Use a balanced ecommerce layout with one clear primary proof and limited supporting information.'
  const coreSections = [
    'Render one square Amazon-ready product image at ' + resolution + '.',
    'Use the primary product reference as the highest truth source for product identity, shape, structure, proportion, color, material appearance, and included parts.',
    'Generate the image from scratch but keep the same real product. Do not redesign the product. Do not add, remove, merge, deform, recolor, substitute, duplicate, or omit product parts.',
    truthFacts.length > 0 ? 'Confirmed product truth: ' + truthFacts.join(' | ') + '.' : '',
    productBlueprint.confirmedDimensions
      ? 'Only render numeric measurements that are explicitly present in confirmed dimensions. Omit any other measurement instead of estimating it.'
      : 'Do not render numeric measurements unless the current strategy explicitly provides a confirmed value.',
    negativeFacts.length > 0 ? 'Hard visual exclusions: ' + negativeFacts.join(' | ') + '.' : '',
    executionRules.length > 0 ? 'Execution protection rules: ' + executionRules.join(' | ') + '.' : '',
    formatReferenceRoles(referenceImageRoles) ? 'Reference image order: ' + formatReferenceRoles(referenceImageRoles) + '.' : '',
    'Treat the following strategy as the single execution truth. Do not add new meaning, new selling points, new layout logic, new scene logic, or new claims beyond it.',
    complexityLine,
    executionHint ? 'Execute this strategy exactly: ' + executionHint + '.' : '',
    getExactCopyInstruction(listing, imagePlan)
  ]

  const optionalSections = [
    imagePlan?.regenerationMode
      ? 'This is a regeneration request. Respect the latest edited strategy wording exactly.'
      : ''
  ]

  return buildPromptWithLimit(
    coreSections,
    optionalSections,
    'Photorealistic, sharp product detail, believable physical relationships, Amazon-ready readability.'
  )
}

export default router
