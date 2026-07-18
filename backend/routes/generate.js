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
  normalizeConfidenceValue,
  normalizeStringArray
} from '../utils/productModel.js'
import { postJsonWithRetry } from '../utils/upstreamRetry.js'
import { normalizeVisualBlueprint } from '../utils/visualBlueprints.js'
import { ensureUploadsDir, resolveUploadPathFromUrl } from '../utils/uploads.js'

const router = express.Router()
const strategyTranslationCache = new Map()
const MAX_TRANSLATION_CACHE_ENTRIES = 200

router.post('/', async (req, res) => {
  try {
    const {
      listing,
      imagePlans,
      resolution,
      referenceImages,
      primaryReferenceImageUrl,
      referenceImageRoles,
      complexity,
      productBlueprint
    } = req.body

    if (!listing || !imagePlans || imagePlans.length === 0) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Listing and imagePlans are required'
      })
    }

    const executionListing = {
      ...listing,
      productBlueprint: productBlueprint || listing.productBlueprint
    }

    const hasReferenceImages = referenceImages && referenceImages.length > 0

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

    const size = resolution === '4k' ? '4096x4096' : '2048x2048'
    const explicitPrimaryReferenceImageUrl = primaryReferenceImageUrl || referenceImages?.[0] || ''

    let refImagePaths = []
    let orderedReferenceRoles = []
    if (hasReferenceImages) {
      const roleByUrl = new Map(
        (Array.isArray(referenceImageRoles) ? referenceImageRoles : [])
          .filter((item) => item?.url)
          .map((item) => [item.url, item.role])
      )
      const candidateReferenceImages = [
        explicitPrimaryReferenceImageUrl,
        ...referenceImages.filter((imageUrl) => imageUrl && imageUrl !== explicitPrimaryReferenceImageUrl)
      ].filter(Boolean).filter((imageUrl, index, source) => source.indexOf(imageUrl) === index)
      const referencePriority = (imageUrl) => {
        if (imageUrl === explicitPrimaryReferenceImageUrl) return 0
        if (roleByUrl.get(imageUrl) === 'regeneration_reference') return 1
        return 2
      }
      const orderedReferenceImages = candidateReferenceImages
        .sort((left, right) => referencePriority(left) - referencePriority(right))
        .slice(0, 8)

      refImagePaths = orderedReferenceImages.map((imageUrl) => resolveUploadPathFromUrl(imageUrl))
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

    for (const plan of imagePlans) {
      try {
        const taskType = plan.taskType || plan.type || 'feature'
        const normalizedPlan = taskType === 'main' && !plan.regenerationMode
          ? { ...plan, originalPrompt: plan.strategyBody || plan.prompt || '' }
          : await translatePlanPromptIfNeeded(plan, executionListing, size)
        const prompt = buildAmazonPrompt(
          executionListing,
          normalizedPlan,
          complexity || 'L2',
          size,
          explicitPrimaryReferenceImageUrl,
          orderedReferenceRoles
        )

        const generatedImage = await callGPTImage2({
          prompt,
          refImagePaths: hasReferenceImages ? refImagePaths : [],
          size,
          apiKey,
          baseUrl,
          model,
          taskType: plan.taskType || plan.type || 'feature'
        })

        const requestedWidth = Number(size.split('x')[0])
        const requestedHeight = Number(size.split('x')[1])
        const hasDimensions = Number.isFinite(generatedImage.width) && Number.isFinite(generatedImage.height)

        generatedImages.push({
          imageId: plan.id,
          name: plan.name,
          taskType: plan.taskType || plan.type || null,
          imageUrl: generatedImage.imageUrl,
          prompt,
          promptEn: normalizedPlan.executionPrompt || normalizedPlan.executionPromptEn || '',
          executionPromptEn: prompt,
          promptZh: normalizedPlan.originalPrompt || plan.prompt || '',
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
          taskType: plan.taskType || plan.type || null,
          status: 'failed',
          error: errorMessage,
          prompt: buildAmazonPrompt(
            executionListing,
            plan,
            complexity || 'L2',
            size,
            explicitPrimaryReferenceImageUrl,
            orderedReferenceRoles
          )
        })
      }
    }

    res.json({
      success: true,
      images: generatedImages,
      timestamp: new Date().toISOString()
    })
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
      timeout: 60000
    })
    imageBuffer = Buffer.from(imageResponse.data)
  } else {
    throw new Error('图片接口既没有返回 b64_json，也没有返回图片 URL')
  }

  if (taskType === 'main') {
    imageBuffer = await normalizeAmazonMainImage(imageBuffer, size)
  }

  const dimensions = readImageDimensions(imageBuffer)
  const outputFilename = 'generated-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + '.png'
  const outputPath = path.join(ensureUploadsDir(), outputFilename)
  fs.writeFileSync(outputPath, imageBuffer)

  return {
    imageUrl: '/uploads/' + outputFilename,
    width: dimensions.width,
    height: dimensions.height
  }
}

function getImageGenerationTimeoutMs() {
  const timeoutMs = Number(process.env.IMAGE_GEN_TIMEOUT_MS || 300000)
  return Number.isFinite(timeoutMs) && timeoutMs >= 60000 ? timeoutMs : 300000
}

function formatGenerateError(err) {
  const rawMessage = err.response?.data?.message || err.response?.data?.error?.message || err.message || '图片生成失败'
  const isTimeout = err.code === 'ECONNABORTED' || String(rawMessage).toLowerCase().includes('timeout')

  if (isTimeout) {
    return '图片生成接口超过 ' + Math.round(getImageGenerationTimeoutMs() / 1000) + ' 秒仍未返回，请稍后重试，或先降低复杂度、减少同时生成的图片数量。'
  }

  return rawMessage
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
  const visibleParts = normalizeStringArray(productBlueprint.structure?.parts, 8)
  const strategyConstraints = normalizeStringArray(
    Array.isArray(imagePlan?.constraints) ? imagePlan.constraints : imagePlan?.hardConstraints,
    10
  )
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

  const uncertainties = normalizeStringArray(productBlueprint.uncertainties, 8)
  if (uncertainties.length > 0) {
    lines.push('Do not present these unverified facts as confirmed: ' + uncertainties.join(' | ') + '.')
  }

  if (productBlueprint.identity?.archetype === 'Clamp Mounted Device') {
    lines.push('For isolated main-image presentation, show the clamp as part of the product itself and do not attach it to glass, mesh, tank walls, desks, frames, or any external support surface.')
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

  if (imagePlan?.regenerationMode && executionHint) {
    lines.push('User regeneration direction: ' + executionHint + '.')
    lines.push('The user direction may refine angle, accessory arrangement, or lighting, but it may not override the fixed white-background, centered, full-product, approximately 85% framing, no-text, and no-decoration rules above.')
  }

  return lines.join(' ')
}

function cleanPromptText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function getExecutionHint(imagePlan = {}) {
  const translatedExecution = cleanPromptText(imagePlan.executionPrompt || imagePlan.executionPromptEn)
  if (translatedExecution) return translatedExecution

  const reusableEnglishPrompt = !imagePlan.promptDirty
    ? cleanPromptText(imagePlan.promptEn || imagePlan.englishPrompt)
    : ''
  if (reusableEnglishPrompt) return reusableEnglishPrompt

  return cleanPromptText(imagePlan.strategyBody || imagePlan.prompt || imagePlan.promptHint || '')
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
  const mounting = blueprint.mounting && typeof blueprint.mounting === 'object' ? blueprint.mounting : {}
  const relationships = blueprint.relationships && typeof blueprint.relationships === 'object' ? blueprint.relationships : {}
  const behavior = blueprint.behavior && typeof blueprint.behavior === 'object' ? blueprint.behavior : {}
  const usage = blueprint.usage && typeof blueprint.usage === 'object' ? blueprint.usage : {}
  const reference = blueprint.reference && typeof blueprint.reference === 'object' ? blueprint.reference : {}
  const confidence = blueprint.confidence && typeof blueprint.confidence === 'object' ? blueprint.confidence : {}

  return {
    identity: {
      productType: cleanPromptText(identity.productType || listing.productName || 'Product'),
      category: cleanPromptText(identity.category || listing.category || 'General'),
      market: cleanPromptText(identity.market || ('Amazon ' + (listing.marketplace || 'UK'))),
      archetype: cleanPromptText(identity.archetype || inferArchetype(rawContext))
    },
    appearance: {
      primaryColor: normalizeStringArray(appearance.primaryColor, 6),
      material: normalizeStringArray(appearance.material, 6).length > 0
        ? normalizeStringArray(appearance.material, 6)
        : normalizeLineList(listing.material, 5, 120),
      distinctiveFeatures: normalizeStringArray(appearance.distinctiveFeatures, 10)
    },
    structure: {
      parts: normalizeStringArray(structure.parts, 10),
      connections: normalizeStringArray(structure.connections, 10),
      visibleEvidence: normalizeStringArray(structure.visibleEvidence, 10)
    },
    mounting: {
      mountType: cleanPromptText(mounting.mountType || ''),
      supportSurface: normalizeStringArray(mounting.supportSurface, 8),
      placement: normalizeStringArray(mounting.placement, 8),
      connectionType: cleanPromptText(mounting.connectionType || ''),
      relationship: normalizeStringArray(mounting.relationship, 10),
      allowed: normalizeStringArray(mounting.allowed, 10),
      forbidden: normalizeStringArray(mounting.forbidden, 10)
    },
    usage: {
      useMode: cleanPromptText(usage.useMode || ''),
      supportObject: normalizeStringArray(usage.supportObject, 8),
      contactPoint: normalizeStringArray(usage.contactPoint, 8),
      spatialRelationship: normalizeStringArray(usage.spatialRelationship, 10),
      effectDirection: normalizeStringArray(usage.effectDirection, 8),
      requiredVisibleEvidence: normalizeStringArray(usage.requiredVisibleEvidence, 10),
      forbiddenSpatialRelations: normalizeStringArray(usage.forbiddenSpatialRelations, 10)
    },
    relationships: {
      mustKeep: normalizeStringArray(relationships.mustKeep, 10)
    },
    behavior: {
      motion: normalizeStringArray(behavior.motion, 8),
      adjustment: normalizeStringArray(behavior.adjustment, 8)
    },
    reference: {
      primaryReference: cleanPromptText(reference.primaryReference || 'Primary product image'),
      secondaryReference: cleanPromptText(reference.secondaryReference || 'Supporting product images'),
      styleReference: cleanPromptText(reference.styleReference || 'Style references'),
      rules: normalizeStringArray(reference.rules, 8)
    },
    confidence: {
      appearance: normalizeConfidenceValue(confidence.appearance),
      structure: normalizeConfidenceValue(confidence.structure),
      mounting: normalizeConfidenceValue(confidence.mounting)
    },
    uncertainties: normalizeStringArray(blueprint.uncertainties, 8)
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
  add('real colors', productBlueprint.appearance?.primaryColor)
  add('visible parts', productBlueprint.structure?.parts)
  add('part connections', productBlueprint.structure?.connections)
  add('distinctive visual features', productBlueprint.appearance?.distinctiveFeatures)
  return facts
}

function getExactCopyInstruction(listing, imagePlan) {
  const copyLines = summarizeCopyLines(imagePlan)
  if (!imagePlan?.allowTextOverlay || copyLines.length === 0) {
    return 'Do not render any text, captions, labels, icons, logos, or decorative lettering.'
  }

  return [
    `Render only this exact ${getTargetImageLanguage(listing)} on-image copy: ${copyLines.map((line) => `"${line}"`).join(' | ')}.`,
    'Do not add, rewrite, repeat, split, or invent any other words.'
  ].join(' ')
}

function buildUsageScenePrompt(
  listing,
  imagePlan,
  productBlueprint,
  visualBlueprint,
  resolution,
  primaryReferenceImageUrl,
  referenceImageRoles = []
) {
  const usage = productBlueprint.usage || {}
  const strategyConstraints = normalizeStringArray(
    Array.isArray(imagePlan?.constraints) ? imagePlan.constraints : imagePlan?.hardConstraints,
    12
  )
  const executionHint = getExecutionHint(imagePlan)
  const successCriteria = [
    ...normalizeStringArray(imagePlan?.successCriteria, 3),
    ...normalizeStringArray(usage.requiredVisibleEvidence, 3),
    ...normalizeStringArray(usage.spatialRelationship, 2)
  ].filter((item, index, source) => source.indexOf(item) === index).slice(0, 6)
  const failureCriteria = [
    ...normalizeStringArray(imagePlan?.failureCriteria, 3),
    ...normalizeStringArray(usage.forbiddenSpatialRelations, 3),
    ...normalizeStringArray(productBlueprint.mounting?.forbidden, 2)
  ].filter((item, index, source) => source.indexOf(item) === index).slice(0, 6)
  const lines = [
    'Create one commercially usable Amazon product usage image at ' + resolution + '.',
    'Canonical strategy to execute faithfully: ' + executionHint + '.',
    'Product truth: ' + (summarizeProductTruth(productBlueprint).join(' | ') || 'preserve the complete product exactly as shown in the primary reference') + '.',
    'The primary product reference controls product identity, shape, proportions, colors, parts, and connections. Supporting references cannot redesign the product.',
    formatReferenceRoles(referenceImageRoles) ? 'Reference image order: ' + formatReferenceRoles(referenceImageRoles) + '.' : '',
    'Use mode: ' + (usage.useMode || productBlueprint.mounting?.mountType || 'realistic normal use') + '.',
    'Support object: ' + (normalizeStringArray(usage.supportObject, 8).join(' | ') || normalizeStringArray(productBlueprint.mounting?.supportSurface, 8).join(' | ') || 'the real support described by the strategy') + '.',
    'Contact point and geometry: ' + (normalizeStringArray(usage.contactPoint, 8).join(' | ') || productBlueprint.mounting?.connectionType || 'show a valid physical contact') + '.',
    'Spatial relationships: ' + (normalizeStringArray(usage.spatialRelationship, 10).join(' | ') || normalizeStringArray(productBlueprint.mounting?.relationship, 10).join(' | ') || 'show a physically valid placement') + '.',
    'Functional direction: ' + (normalizeStringArray(usage.effectDirection, 8).join(' | ') || 'show the product acting toward its intended target') + '.',
    'Success is visible only when: ' + (successCriteria.join(' | ') || 'the real use relationship is immediately understandable') + '.',
    'Reject the image if it shows: ' + (failureCriteria.join(' | ') || 'penetration, fusion, floating parts, broken connections, or impossible support') + '.',
    'Respect solid-object collision, gravity, continuous connections, plausible support, and correct front/back and inside/outside relationships.',
    getExactCopyInstruction(listing, imagePlan),
    'Keep all text and props away from the product body and any contact or mounting point.'
  ]

  if (imagePlan?.layout) lines.push('Required scene composition: ' + cleanPromptText(imagePlan.layout) + '.')
  if (strategyConstraints.length > 0) {
    lines.push('Additional hard constraints: ' + strategyConstraints.slice(0, 4).join(' | ') + '.')
  }

  return buildPromptWithLimit(lines, [], 'Photorealistic, physically believable, clean Amazon-ready composition.')
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
  return imagePlan?.allowTextOverlay && Array.isArray(imagePlan?.copy)
    ? imagePlan.copy.map((item) => cleanPromptText(item)).filter(Boolean).slice(0, 2)
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
  const sourcePrompt = plan?.strategyBody || plan?.prompt || plan?.promptHint || ''
  const promptEn = plan?.executionPrompt || plan?.executionPromptEn || plan?.promptEn || plan?.englishPrompt || ''
  const isCompositePrompt = /Global rules:|Product blueprint:|Create one conversion-focused Amazon product image/i.test(promptEn)

  if (promptEn && !plan.promptDirty && !isCompositePrompt) {
    return {
      ...plan,
      originalPrompt: sourcePrompt,
      prompt: promptEn,
      executionPrompt: promptEn,
      executionPromptEn: promptEn,
      promptHint: plan.promptHint || sourcePrompt
    }
  }

  if (!containsChinese(sourcePrompt)) {
    return {
      ...plan,
      promptHint: plan.promptHint || sourcePrompt,
      prompt: sourcePrompt,
      executionPrompt: sourcePrompt,
      executionPromptEn: sourcePrompt
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
    .update([model, targetLanguage, sourcePrompt].join('\n'))
    .digest('hex')
  const cachedTranslation = strategyTranslationCache.get(cacheKey)
  if (cachedTranslation) {
    return {
      ...plan,
      originalPrompt: sourcePrompt,
      prompt: cachedTranslation,
      promptEn: cachedTranslation,
      executionPrompt: cachedTranslation,
      executionPromptEn: cachedTranslation,
      promptDirty: false
    }
  }

  const productBlueprint = getProductBlueprint(listing)

  const userMessage = [
    'Target language: English',
    'Product terminology that must remain exact:',
    '- Product type: ' + (productBlueprint.identity?.productType || 'Product'),
    '- Key parts: ' + normalizeStringArray(productBlueprint.structure?.parts, 12).join(', '),
    '- Target image text language: ' + targetLanguage,
    '',
    'Canonical Chinese strategy:',
    sourcePrompt
  ].join('\n')

  const response = await postJsonWithRetry(
    baseUrl + '/chat/completions',
    {
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a faithful strategy translator. Translate the canonical Chinese image strategy into English for an image model. Preserve every requirement, relationship, selling point, prohibition, success condition, and exact quoted on-image copy. Do not add a layout, claim, feature, object, style, or instruction. Do not remove or summarize content. This is translation, not replanning. Return only the English translation.'
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
      timeout: 60000
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

  return {
    ...plan,
    originalPrompt: sourcePrompt,
    promptHint: plan.promptHint || sourcePrompt,
    prompt: translatedPrompt,
    promptEn: translatedPrompt,
    executionPrompt: translatedPrompt,
    executionPromptEn: translatedPrompt,
    promptDirty: false
  }


  strategyTranslationCache.set(cacheKey, translatedPrompt)
  if (strategyTranslationCache.size > MAX_TRANSLATION_CACHE_ENTRIES) {
    const oldestKey = strategyTranslationCache.keys().next().value
    strategyTranslationCache.delete(oldestKey)
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
  const visualBlueprint = getVisualBlueprint(imagePlan, taskType)
  const selectedTypographyStyle = getTypographyStyle(listing?.fontPreference)
  const strategyConstraints = normalizeStringArray(
    Array.isArray(imagePlan?.constraints) ? imagePlan.constraints : imagePlan?.hardConstraints,
    12
  )
  const executionHint = getExecutionHint(imagePlan)

  if (taskType === 'main') {
    return buildMainImagePrompt(
      listing,
      imagePlan,
      productBlueprint,
      visualBlueprint,
      resolution,
      primaryReferenceImageUrl
    )
  }

  if (taskType === 'scenario' || taskType === 'steps') {
    return buildUsageScenePrompt(
      listing,
      imagePlan,
      productBlueprint,
      visualBlueprint,
      resolution,
      primaryReferenceImageUrl,
      referenceImageRoles
    )
  }

  const strategyText = [
    executionHint,
    imagePlan?.strategyBody,
    imagePlan?.prompt,
    imagePlan?.goal,
    imagePlan?.focus,
    imagePlan?.layout
  ].filter(Boolean).join(' ')
  const needsUsageGeometry = /(mount|clamp|clip|install|attach|grip|support|hang|夹|安装|固定|悬挂|支撑|接触)/i.test(strategyText)
  const successCriteria = normalizeStringArray(imagePlan?.successCriteria, 3)
  const failureCriteria = normalizeStringArray(imagePlan?.failureCriteria, 3)

  const coreSections = [
    'Create one conversion-focused Amazon product image for task type ' + taskType + ' at ' + resolution + '.',
    'Canonical strategy to execute faithfully: ' + executionHint + '.',
    'Product truth: ' + (summarizeProductTruth(productBlueprint).join(' | ') || 'preserve the complete product exactly as shown in the primary reference') + '.',
    'The primary product reference is the highest authority for product appearance, proportions, structure, colors, printed marks, and included parts.',
    'Do not add, remove, merge, deform, recolor, or substitute product parts. Do not create penetration, fused geometry, floating parts, or impossible support.',
    formatReferenceRoles(referenceImageRoles) ? 'Reference image order: ' + formatReferenceRoles(referenceImageRoles) + '.' : '',
    getExactCopyInstruction(listing, imagePlan)
  ]

  if (imagePlan?.layout) {
    coreSections.push('Required product-specific composition: ' + cleanPromptText(imagePlan.layout) + '.')
  }

  if (taskType === 'dimensions' && cleanPromptText(listing?.dimensions)) {
    coreSections.push('Use only these confirmed measurements, each shown once: ' + cleanPromptText(listing.dimensions) + '.')
  }

  if (taskType === 'detail' && normalizeStringArray(productBlueprint.appearance?.material, 6).length > 0) {
    coreSections.push('Confirmed materials: ' + normalizeStringArray(productBlueprint.appearance.material, 6).join(' | ') + '.')
  }

  if (needsUsageGeometry) {
    const usageRules = [
      ...normalizeStringArray(productBlueprint.usage?.contactPoint, 2),
      ...normalizeStringArray(productBlueprint.usage?.spatialRelationship, 2),
      ...normalizeStringArray(productBlueprint.usage?.effectDirection, 1),
      ...normalizeStringArray(productBlueprint.usage?.requiredVisibleEvidence, 2)
    ].filter((item, index, source) => source.indexOf(item) === index).slice(0, 5)
    const forbiddenUsage = [
      ...normalizeStringArray(productBlueprint.usage?.forbiddenSpatialRelations, 3),
      ...normalizeStringArray(productBlueprint.mounting?.forbidden, 3)
    ].filter((item, index, source) => source.indexOf(item) === index).slice(0, 4)

    if (usageRules.length > 0) coreSections.push('Required visible use geometry: ' + usageRules.join(' | ') + '.')
    if (forbiddenUsage.length > 0) coreSections.push('Invalid use geometry: ' + forbiddenUsage.join(' | ') + '.')
  }

  if (strategyConstraints.length > 0) {
    coreSections.push('Additional hard constraints: ' + strategyConstraints.slice(0, 4).join(' | ') + '.')
  }

  if (successCriteria.length > 0) {
    coreSections.push('The image succeeds only when these are visibly true: ' + successCriteria.join(' | ') + '.')
  }
  if (failureCriteria.length > 0) {
    coreSections.push('Reject the image if it shows: ' + failureCriteria.join(' | ') + '.')
  }
  if (listing?.brandColorMode === 'manual' && listing?.brandColor) {
    coreSections.push('Use accent color ' + listing.brandColor + ' only in layout graphics, never to recolor the product.')
  }

  if (cleanPromptText(listing?.designNotes)) {
    coreSections.push('User design preference: ' + cleanPromptText(listing.designNotes).slice(0, 500) + '.')
  }

  if (complexity === 'L1') {
    coreSections.push('Visual density only: restrained layout, one dominant message, generous clarity. Do not shorten or ignore the strategy.')
  } else if (complexity === 'L2') {
    coreSections.push('Visual density only: balanced information with clear hierarchy and realistic presentation.')
  } else if (complexity === 'L3') {
    coreSections.push('Visual density only: refined premium presentation while preserving immediate readability and product realism.')
  }

  coreSections.push('Typography style: ' + selectedTypographyStyle + '. Keep text outside the product and preserve clear visual hierarchy.')
  coreSections.push('Visual guardrails: ' + visualBlueprint.lighting + '; ' + visualBlueprint.background + '. The canonical strategy controls the composition.')

  return buildPromptWithLimit(
    coreSections,
    [],
    'High quality, sharp product detail, believable photography, Amazon-ready readability.'
  )
}

export default router
