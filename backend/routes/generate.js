import express from 'express'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import FormData from 'form-data'
import { STRATEGY_LIBRARY } from '../strategy-library.js'

const router = express.Router()

router.post('/', async (req, res) => {
  try {
    const { listing, imagePlans, imageType, resolution, referenceImages, complexity } = req.body

    if (!listing || !imagePlans || imagePlans.length === 0) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Listing and imagePlans are required'
      })
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

    let refImagePaths = []
    if (hasReferenceImages) {
      refImagePaths = referenceImages
        .slice(0, 3)
        .map((imageUrl) => path.join(process.cwd(), imageUrl.replace('/uploads/', 'uploads/')))

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
        const normalizedPlan = await translatePlanPromptIfNeeded(plan, listing, size)
        const prompt = buildAmazonPrompt(listing, normalizedPlan, imageType, complexity || 'L2', size)
        const generatedImage = await callGPTImage2({
          prompt, 
          refImagePaths: hasReferenceImages ? refImagePaths : [], 
          size, 
          apiKey, 
          baseUrl, 
          model 
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
          promptEn: prompt,
          promptZh: normalizedPlan.originalPrompt || plan.prompt || '',
          status: 'completed',
          resolution: size,
          actualWidth: generatedImage.width,
          actualHeight: generatedImage.height,
          actualResolution: hasDimensions ? `${generatedImage.width}x${generatedImage.height}` : null,
          sizeMatchesRequest: hasDimensions ? generatedImage.width === requestedWidth && generatedImage.height === requestedHeight : null
        })
      } catch (err) {
        const errorMessage = formatGenerateError(err)
        console.error(`生成图 ${plan.id} 失败:`, err.response?.data || errorMessage)
        generatedImages.push({
          imageId: plan.id,
          name: plan.name,
          taskType: plan.taskType || plan.type || null,
          status: 'failed',
          error: errorMessage,
          prompt: buildAmazonPrompt(listing, plan, imageType, complexity || 'L2', size)
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

async function callGPTImage2({ prompt, refImagePaths = [], size, apiKey, baseUrl, model }) {
  const form = new FormData()
  form.append('model', model)
  form.append('prompt', prompt)
  form.append('size', size)
  form.append('n', '1')
  form.append('response_format', 'b64_json')
  
  const hasReferenceImages = Array.isArray(refImagePaths) && refImagePaths.length > 0
  const endpoint = hasReferenceImages ? '/images/edits' : '/images/generations'
  
  if (hasReferenceImages) {
    refImagePaths.forEach((refImagePath, index) => {
      const ext = path.extname(refImagePath).toLowerCase()
      const contentType = ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg'

      form.append(refImagePaths.length > 1 ? 'image[]' : 'image', fs.createReadStream(refImagePath), {
        filename: path.basename(refImagePath) || `reference-${index + 1}.png`,
        contentType
      })
    })
  }

  const response = await axios.post(
    `${baseUrl}${endpoint}`,
    form,
    {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: getImageGenerationTimeoutMs()
    }
  )

  const b64 = response.data.data[0].b64_json
  const imageBuffer = Buffer.from(b64, 'base64')
  const dimensions = readImageDimensions(imageBuffer)
  const outputFilename = `generated-${Date.now()}.png`
  const outputPath = path.join(process.cwd(), 'uploads', outputFilename)
  fs.writeFileSync(outputPath, imageBuffer)

  return {
    imageUrl: `/uploads/${outputFilename}`,
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
    return `图片生成接口超过 ${Math.round(getImageGenerationTimeoutMs() / 1000)} 秒仍未返回，请稍后重试，或先降低复杂度、减少同时生成的图片数量。`
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

function getMarketplaceLanguage(marketplace = 'UK') {
  const languageMap = {
    US: 'English',
    UK: 'English',
    CA: 'English',
    AU: 'English',
    DE: 'German',
    FR: 'French',
    IT: 'Italian',
    ES: 'Spanish',
    JP: 'Japanese',
    NL: 'Dutch',
    SE: 'Swedish',
    PL: 'Polish'
  }

  return languageMap[marketplace] || 'English'
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

export async function translatePlanPromptIfNeeded(plan, listing, resolution) {
  const prompt = plan?.prompt || ''
  const promptEn = plan?.promptEn || plan?.englishPrompt || ''

  if (promptEn && !plan.promptDirty) {
    return {
      ...plan,
      originalPrompt: prompt,
      prompt: promptEn
    }
  }

  if (!containsChinese(prompt)) {
    return plan
  }

  const apiKey = process.env.AGENT_API_KEY || process.env.OPENAI_API_KEY
  const baseUrl = process.env.AGENT_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const model = process.env.AGENT_MODEL || 'gpt-4o-mini'

  if (!apiKey || apiKey === 'sk-your-api-key-here') {
    throw new Error('检测到中文策略，但后端没有配置 AGENT_API_KEY，无法自动翻译成英文 prompt')
  }

  const userMessage = [
    'Product name: ' + (listing?.productName || 'Unknown product'),
    'Marketplace: ' + (listing?.marketplace || 'UK'),
    'Text overlay language: ' + getTargetImageLanguage(listing),
    'Image size: ' + resolution,
    'Chinese strategy:',
    prompt
  ].join('\n')

  const response = await axios.post(baseUrl + '/chat/completions', {
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are an expert Amazon image-generation prompt translator. Convert Chinese visual strategy notes into one complete, production-ready English prompt for an image generation model. Keep product facts accurate. Add concrete composition, lighting, background, layout, typography, e-commerce infographic details, and quality details. Make sure any visible text overlays use the target marketplace language. Return only the English prompt, no markdown.'
      },
      {
        role: 'user',
        content: userMessage
      }
    ],
    temperature: 0.2,
    max_tokens: 900
  }, {
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    timeout: 60000
  })

  const translatedPrompt = response.data?.choices?.[0]?.message?.content?.trim()

  if (!translatedPrompt) {
    throw new Error('中文策略自动翻译失败：翻译接口没有返回英文 prompt')
  }

  return {
    ...plan,
    originalPrompt: prompt,
    prompt: translatedPrompt
  }
}

export function buildAmazonPrompt(listing, imagePlan, imageType, complexity = 'L2', resolution = '2048x2048') {
  const {
    productName,
    listingInfo,
    category,
    targetAudience,
    sellingPoints,
    dimensions,
    material,
    marketplace,
    imageLanguage,
    fontPreference,
    brandColorMode,
    brandColor,
    designNotes,
    additionalInfo
  } = listing

  const planPromptIsEnglish = imagePlan?.prompt && !containsChinese(imagePlan.prompt)
  const shouldIncludeRawField = (value) => value && (!planPromptIsEnglish || !containsChinese(value))
  const targetLanguage = imageLanguage || getMarketplaceLanguage(marketplace || 'UK')
  const strategy = STRATEGY_LIBRARY[imageType]
  const taskType = imagePlan?.taskType || imagePlan?.type || null
  const visualStyle = strategy?.visualStyle || {}
  const selectedTypographyStyle = getTypographyStyle(fontPreference)
  const isL1 = complexity === 'L1'
  const isL3 = complexity === 'L3'

  let prompt = 'Professional Amazon product photography for '
  prompt += shouldIncludeRawField(productName) ? productName : 'the product'
  prompt += '. Category: ' + (shouldIncludeRawField(category) ? category : 'General')
  prompt += '. Image size: ' + resolution

  if (shouldIncludeRawField(targetAudience)) {
    prompt += '. Target audience: ' + targetAudience
  }

  if (shouldIncludeRawField(sellingPoints)) {
    const points = String(sellingPoints)
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
    if (points.length > 0) {
      prompt += '. Key selling points: ' + points.join(', ')
    }
  }

  if (
    shouldIncludeRawField(listingInfo) &&
    String(listingInfo || '').trim() !== String(sellingPoints || '').trim()
  ) {
    prompt += '. Full listing context: ' + listingInfo
  }

  if (shouldIncludeRawField(dimensions)) {
    prompt += '. Dimensions: ' + dimensions
  }

  if (shouldIncludeRawField(material)) {
    prompt += '. Material: ' + material
  }

  prompt += '. Typography: Use ' + selectedTypographyStyle + ' for any text overlays'
  prompt += '. Text overlay language: ' + targetLanguage
  prompt += '. All visible titles, labels, feature text, badges, and infographic copy must use this language'

  if (shouldIncludeRawField(designNotes)) {
    prompt += '. Additional design requirements: ' + designNotes
  }

  if (shouldIncludeRawField(additionalInfo)) {
    prompt += '. Additional product context: ' + additionalInfo
  }

  prompt += '. Reference consistency: if reference product images are provided, preserve the exact product identity across all generated images, including shape, silhouette, structure, proportions, color, material, surface details, and accessories. Do not invent new parts or alter the product body'

  if (isL1) {
    prompt += '. SIMPLE clean composition, minimal text, white background, basic product photography'
  } else if (isL3) {
    prompt += '. ULTRA-DETAILED professional photography, cinematic lighting, premium quality, magazine editorial style, hyper-realistic'
  } else {
    prompt += '. Balanced e-commerce composition with clear hierarchy, product readability, and conversion-focused layout'
  }

  if (strategy) {
    if (brandColorMode === 'manual' && brandColor) {
      prompt += '. Accent color guidance: use ' + brandColor + ' as the primary highlight color for titles, badges, icons, and graphic elements while keeping the product truthful'
    } else {
      prompt += '. Color palette: adapt to the actual product colors, material, reference image, and use scenario. Do not force a fixed template color scheme'
    }

    if (visualStyle.mood) {
      prompt += '. Mood: ' + visualStyle.mood
    }

    if (visualStyle.background) {
      prompt += '. Background: ' + visualStyle.background
    }
  }

  if (imagePlan?.prompt && imagePlan.prompt.length > 20) {
    prompt += '. ' + imagePlan.prompt
  } else {
    const planId = Number(imagePlan?.id || 0)

    if (taskType ? taskType === 'main' : planId === 1) {
      prompt += '. PURE WHITE BACKGROUND (RGB 255,255,255), product fully visible, centered, no crop, no text, no logos, no watermarks, no unrelated props'
    } else if (taskType ? taskType === 'feature' : planId === 2) {
      prompt += '. Hero feature image with the strongest selling point, clear headline area, strong visual focus, product remains dominant'
    } else if (taskType ? taskType === 'steps' : planId === 3) {
      prompt += '. Usage steps or feature infographic with clear icon structure, concise text blocks, and easy-to-scan layout'
    } else if (taskType ? taskType === 'dimensions' : planId === 4) {
      prompt += '. Dimension or specification image with size lines, scale reference, and structured annotation layout'
    } else if (taskType ? taskType === 'detail' : planId === 5) {
      prompt += '. Close-up detail image showing material, craftsmanship, texture, or durability highlights'
    } else if (taskType ? taskType === 'scenario' : planId === 6) {
      prompt += '. Multi-scene or multi-use collage showing the product in several realistic usage contexts'
    } else if (taskType === 'comparison') {
      prompt += '. Comparison layout showing clear product advantages, before-after improvement, or versus-other-options structure without inventing unsupported claims'
    } else if (taskType === 'package') {
      prompt += '. Package contents or kit overview image showing only confirmed included items and accessories, arranged clearly for quick understanding'
    } else if (taskType ? taskType === 'summary' : planId === 7) {
      prompt += '. Closing lifestyle or trust-building image showing package value, final atmosphere, or purchase confidence'
    }
  }

  prompt += '. High quality, professional photography, studio lighting'
  if (!isL1) {
    prompt += ', ultra-detailed, sharp focus'
  }

  return prompt
}

export default router

