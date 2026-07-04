import express from 'express'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import FormData from 'form-data'
import { STRATEGY_LIBRARY } from '../strategy-library.js'

const router = express.Router()

router.post('/', async (req, res) => {
  try {
    // 注意：前端发送 imageType，不是 style
    const { listing, imagePlans, imageType, resolution, referenceImages, complexity } = req.body

    // 验证输入
    if (!listing || !imagePlans || imagePlans.length === 0) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Listing and imagePlans are required'
      })
    }

    // 产品参考图是可选的，不是必须的
    // 如果有参考图，用于 image-to-image；没有则纯 text-to-image
    const hasReferenceImages = referenceImages && referenceImages.length > 0

    // 从后端 .env 读取配置（图像生成专用）
    const apiKey = process.env.IMAGE_GEN_API_KEY || process.env.OPENAI_API_KEY
    const baseUrl = process.env.IMAGE_GEN_BASE_URL || process.env.OPENAI_BASE_URL
    const model = process.env.IMAGE_GENERATION_MODEL || process.env.OPENAI_MODEL

    // 严格检查配置是否完整
    if (!apiKey || apiKey === 'sk-your-api-key-here') {
      return res.status(500).json({
        error: 'Missing API Key',
        message: '后端未配置 IMAGE_GEN_API_KEY，请联系管理员检查 backend/.env'
      })
    }
    if (!baseUrl) {
      return res.status(500).json({
        error: 'Missing Base URL',
        message: '后端未配置 IMAGE_GEN_BASE_URL，请联系管理员检查 backend/.env'
      })
    }
    if (!model) {
      return res.status(500).json({
        error: 'Missing Model',
        message: '后端未配置 IMAGE_GENERATION_MODEL，请联系管理员检查 backend/.env'
      })
    }

    // 尺寸
    const size = resolution === '4k' ? '4096x4096' : '2048x2048'

    // 参考图路径（如果有）
    let refImagePath = null
    if (hasReferenceImages) {
      refImagePath = path.join(process.cwd(), referenceImages[0].replace('/uploads/', 'uploads/'))
      if (!fs.existsSync(refImagePath)) {
        return res.status(400).json({
          error: 'Reference image not found',
          message: '参考图片不存在，请重新上传'
        })
      }
    }

    // 逐张生成
    const generatedImages = []

    for (const plan of imagePlans) {
      try {
        const prompt = buildAmazonPrompt(listing, plan, imageType, complexity || 'L2', size)
        const generatedImage = await callGPTImage2({
          prompt, 
          refImagePath: hasReferenceImages ? refImagePath : null, 
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
          imageUrl: generatedImage.imageUrl,
          prompt,
          status: 'completed',
          resolution: size,
          actualWidth: generatedImage.width,
          actualHeight: generatedImage.height,
          actualResolution: hasDimensions ? `${generatedImage.width}x${generatedImage.height}` : null,
          sizeMatchesRequest: hasDimensions ? generatedImage.width === requestedWidth && generatedImage.height === requestedHeight : null
        })
      } catch (err) {
        console.error(`生成图${plan.id}失败:`, err.response?.data || err.message)
        generatedImages.push({
          imageId: plan.id,
          status: 'failed',
          error: err.response?.data?.message || err.message,
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

async function callGPTImage2({ prompt, refImagePath, size, apiKey, baseUrl, model }) {
  // 用 multipart/form-data 发送
  const form = new FormData()
  form.append('model', model)
  form.append('prompt', prompt)
  form.append('size', size)
  form.append('n', '1')
  form.append('response_format', 'b64_json')
  
  // 如果有参考图，使用 images/edits 接口（image-to-image）
  // 如果没有参考图，使用 images/generations 接口（text-to-image）
  const endpoint = refImagePath ? '/images/edits' : '/images/generations'
  
  if (refImagePath) {
    // 根据实际文件扩展名设置正确的 Content-Type
    const ext = path.extname(refImagePath).toLowerCase()
    const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 
                        ext === '.png' ? 'image/png' : 'image/jpeg'
    
    form.append('image', fs.createReadStream(refImagePath), {
      filename: path.basename(refImagePath),
      contentType: contentType
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
      timeout: 120000 // 2 分钟超时（生成大图需要时间）
    }
  )

  // 把 base64 存为本地文件，返回 URL
  const b64 = response.data.data[0].b64_json
  const imageBuffer = Buffer.from(b64, 'base64')
  const dimensions = readPngDimensions(imageBuffer)
  const outputFilename = `generated-${Date.now()}.png`
  const outputPath = path.join(process.cwd(), 'uploads', outputFilename)
  fs.writeFileSync(outputPath, imageBuffer)

  return {
    imageUrl: `/uploads/${outputFilename}`,
    width: dimensions.width,
    height: dimensions.height
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

function buildAmazonPrompt(listing, imagePlan, imageType, complexity = 'L2', resolution = '2048x2048') {
  const { productName, category, targetAudience, sellingPoints, dimensions, material, marketplace, fontPreference, designNotes, additionalInfo } = listing

  // 获取策略库中的视觉风格
  const strategy = STRATEGY_LIBRARY[imageType]
  const visualStyle = strategy?.visualStyle || {}
  
  // 字体映射
  const fontMap = {
    'arial': 'Arial, Helvetica, sans-serif',
    'times': 'Times New Roman, serif',
    'roboto': 'Roboto, sans-serif',
    'open-sans': 'Open Sans, sans-serif',
    'montserrat': 'Montserrat, sans-serif'
  }
  const selectedFont = fontMap[fontPreference] || fontMap['arial']

  // ========== 基础 prompt ==========
  let prompt = `Professional Amazon product photography for ${productName}`
  prompt += `. Category: ${category || 'General'}`
  prompt += `. Image size: ${resolution}`

  if (targetAudience) prompt += `. Target audience: ${targetAudience}`

  // 卖点
  if (sellingPoints) {
    const points = sellingPoints.split('\n').filter(s => s.trim())
    prompt += `. Key selling points: ${points.join(', ')}`
  }

  if (dimensions) prompt += `. Dimensions: ${dimensions}`
  if (material) prompt += `. Material: ${material}`

  // 字体要求
  prompt += `. Typography: Use ${selectedFont} font for any text overlays`

  if (designNotes) prompt += `. Additional design requirements: ${designNotes}`

  // ========== 根据复杂度调整详细程度 ==========
  const isL1 = complexity === 'L1'
  const isL3 = complexity === 'L3'
  
  // L1 极速版：简化描述
  if (isL1) {
    prompt += `. SIMPLE clean composition, minimal text, white background, basic product photography`
  }
  // L3 精品版：极致详细
  else if (isL3) {
    prompt += `. ULTRA-DETAILED professional photography, cinematic lighting, premium quality, magazine editorial style, hyper-realistic, 8K resolution`
  }

  // ========== 根据策略类型添加视觉风格 ==========
  if (strategy) {
    // 色彩方案
    if (visualStyle.colorScheme) {
      prompt += `. Color scheme: ${visualStyle.colorScheme}`
    }
    // 视觉风格描述
    if (visualStyle.mood) {
      prompt += `. Mood: ${visualStyle.mood}`
    }
    // 背景风格
    if (visualStyle.background) {
      prompt += `. Background: ${visualStyle.background}`
    }
  }

  // ========== 根据图片 ID 添加具体构图要求 ==========
  const plan = imagePlan
  
  // 如果 AI 已经生成了详细的 prompt，优先使用
  if (plan.prompt && plan.prompt.length > 50) {
    prompt += `. ${plan.prompt}`
  } else {
    // 否则使用框架默认 prompt
    if (plan.id === 1) {
      // 主图：纯白底
      prompt += `. PURE WHITE BACKGROUND (RGB 255,255,255), product centered filling 85% of frame, professional studio lighting, NO text, NO logos, NO watermarks`
      if (isL3) prompt += `, soft shadow beneath product for depth`
    } 
    else if (plan.id === 2) {
      // 核心卖点图
      if (isL1) {
        prompt += `. Clean infographic: ONE key selling point with simple icon and short text label, minimal layout`
      } else if (isL3) {
        prompt += `. Professional infographic layout: LARGE BOLD TITLE at top. 4-5 selling points in vertical list with colorful icons, numbered badges (①②③④⑤), arrows, and callout text. Product hero image integrated. Modern clean design with strong visual hierarchy, high contrast`
      } else {
        prompt += `. Infographic layout: LARGE TITLE "Key Features". 3-4 selling points with icons + text labels. Product on right side. Clean white background with subtle gradient`
      }
    } 
    else if (plan.id === 3) {
      // 功能/使用步骤
      if (isL1) {
        prompt += `. Simple 3-step diagram with numbered icons and brief text`
      } else if (isL3) {
        prompt += `. Detailed step-by-step flowchart: 4 numbered panels (1→2→3→4) connected by arrows. Each panel has icon + instruction text + mini product photo. Professional educational infographic style`
      } else {
        prompt += `. Step-by-step guide: 3-4 numbered steps with icons and short text. Arrows show flow. Product shown in action`
      }
    } 
    else if (plan.id === 4) {
      // 尺寸/规格图
      if (isL1) {
        prompt += `. Simple dimension lines with measurements in inches/cm`
      } else if (isL3) {
        prompt += `. Technical specification diagram: precise measurement lines, size callouts, weight/capacity specs. Include scale reference objects (coin, smartphone, soda can). Engineering drawing style with blue accent colors, grid background`
      } else {
        prompt += `. Dimension diagram with measurement lines and size labels. Include comparison objects for scale reference`
      }
    } 
    else if (plan.id === 5) {
      // 材质/细节图
      if (isL1) {
        prompt += `. Close-up shot showing material texture and build quality`
      } else if (isL3) {
        prompt += `. Extreme macro photography: ultra-detailed material texture, stitching precision, surface finish, craftsmanship details. Shallow depth of field, soft directional lighting creating micro-shadows. Shows tactile premium quality`
      } else {
        prompt += `. Close-up macro shot: material texture, craftsmanship details, connection points. Soft studio lighting highlights quality`
      }
    } 
    else if (plan.id === 6) {
      // 多场景拓展
      if (isL1) {
        prompt += `. Product in 2-3 different usage scenarios, simple collage`
      } else if (isL3) {
        prompt += `. Multi-scene lifestyle collage: 4 different environments (living room, bathroom, bedroom, outdoor) in 2x2 grid. Real people interacting naturally. Warm authentic photography, shows versatility across use cases. Thin white borders between scenes`
      } else {
        prompt += `. Multi-scene collage: product in different spaces (living room, bathroom, bedroom, outdoor). 4-grid layout. Warm lifestyle photography`
      }
    } 
    else if (plan.id === 7) {
      // 补充场景/生活方式
      if (isL1) {
        prompt += `. Lifestyle scene showing product in use, natural lighting`
      } else if (isL3) {
        prompt += `. Premium lifestyle photography: aspirational moment with emotional connection. Golden hour lighting, cinematic composition. Product as hero in beautiful setting. Magazine editorial quality, warm inviting atmosphere`
      } else {
        prompt += `. Emotional lifestyle moment: warm usage scene with human interaction. Natural lighting, authentic not staged`
      }
    }
  }

  // ========== 质量要求（所有 prompt 都包含） ==========
  prompt += `. high quality, professional photography, studio lighting`
  if (!isL1) {
    prompt += `, ultra-detailed, sharp focus`
  }

  return prompt
}

// ========== 已弃用：风格关键词映射（暂时注释保留，以后可能用） ==========
// function getStyleKeywords(style) {
//   const styleMap = {
//     'minimalist': 'minimalist, clean, simple, modern',
//     'professional': 'professional, corporate, polished, high-end',
//     'playful': 'playful, fun, colorful, energetic',
//     'luxury': 'luxury, premium, elegant, sophisticated',
//     'eco-friendly': 'eco-friendly, natural, sustainable, green'
//   }
//   return styleMap[style] || ''
// }

export default router
