import express from 'express'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import FormData from 'form-data'

const router = express.Router()

router.post('/', async (req, res) => {
  try {
    const { listing, imagePlans, style, resolution, referenceImages } = req.body

    // 验证输入
    if (!listing || !imagePlans || imagePlans.length === 0) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Listing and imagePlans are required'
      })
    }

    if (!referenceImages || referenceImages.length === 0) {
      return res.status(400).json({
        error: 'Missing product images',
        message: '请至少上传一张产品图片'
      })
    }

    // 从后端 .env 读取配置，不从前端接收
    const apiKey = process.env.OPENAI_API_KEY
    const baseUrl = process.env.OPENAI_BASE_URL
    const model = process.env.OPENAI_MODEL

    // 严格检查配置是否完整
    if (!apiKey || apiKey === 'sk-your-api-key-here') {
      return res.status(500).json({
        error: 'Missing API Key',
        message: '后端未配置 OPENAI_API_KEY，请联系管理员检查 backend/.env'
      })
    }
    if (!baseUrl) {
      return res.status(500).json({
        error: 'Missing Base URL',
        message: '后端未配置 OPENAI_BASE_URL，请联系管理员检查 backend/.env'
      })
    }
    if (!model) {
      return res.status(500).json({
        error: 'Missing Model',
        message: '后端未配置 OPENAI_MODEL，请联系管理员检查 backend/.env'
      })
    }

    // 尺寸
    const size = resolution === '4k' ? '4096x4096' : '2048x2048'

    // 参考图路径
    const refImagePath = path.join(process.cwd(), referenceImages[0].replace('/uploads/', 'uploads/'))
    if (!fs.existsSync(refImagePath)) {
      return res.status(400).json({
        error: 'Reference image not found',
        message: '参考图片不存在，请重新上传'
      })
    }

    // 逐张生成
    const generatedImages = []

    for (const plan of imagePlans) {
      try {
        const prompt = buildAmazonPrompt(listing, plan, style)
        const imageUrl = await callGPTImage2({ prompt, refImagePath, size, apiKey, baseUrl, model })

        generatedImages.push({
          imageId: plan.id,
          imageUrl,
          prompt,
          status: 'completed',
          resolution: size
        })
      } catch (err) {
        console.error(`Plan ${plan.id} failed:`, err.message)
        generatedImages.push({
          imageId: plan.id,
          imageUrl: null,
          prompt: '',
          status: 'failed',
          error: err.message
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
  // 用 multipart/form-data 发送（gpt-image-2 edits 接口标准格式）
  const form = new FormData()
  form.append('model', model)
  form.append('prompt', prompt)
  form.append('size', size)
  form.append('n', '1')
  form.append('response_format', 'b64_json')
  
  // 根据实际文件扩展名设置正确的 Content-Type
  const ext = path.extname(refImagePath).toLowerCase()
  const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 
                      ext === '.png' ? 'image/png' : 'image/jpeg'
  
  form.append('image', fs.createReadStream(refImagePath), {
    filename: path.basename(refImagePath),
    contentType: contentType
  })

  const response = await axios.post(
    `${baseUrl}/images/edits`,
    form,
    {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 120000 // 2分钟超时（生成大图需要时间）
    }
  )

  // 把 base64 存为本地文件，返回 URL
  const b64 = response.data.data[0].b64_json
  const outputFilename = `generated-${Date.now()}.png`
  const outputPath = path.join(process.cwd(), 'uploads', outputFilename)
  fs.writeFileSync(outputPath, Buffer.from(b64, 'base64'))

  return `/uploads/${outputFilename}`
}

function buildAmazonPrompt(listing, imagePlan, style) {
  const { productName, category, targetAudience, sellingPoints, dimensions, material, marketplace } = listing

  const styleKeywords = style ? getStyleKeywords(style) : ''

  let prompt = `Professional Amazon product photography for ${productName}`
  prompt += `. Category: ${category}`

  if (targetAudience) prompt += `. Target audience: ${targetAudience}`

  if (sellingPoints) {
    const points = sellingPoints.split('\n').filter(s => s.trim()).slice(0, 3)
    prompt += `. Key features: ${points.join(', ')}`
  }

  if (dimensions) prompt += `. Dimensions: ${dimensions}`
  if (material) prompt += `. Material: ${material}`

  if (imagePlan.scene) prompt += `. Scene: ${imagePlan.scene}`
  if (imagePlan.composition) prompt += `. Composition: ${imagePlan.composition}`
  if (imagePlan.colorTone) prompt += `. Color tone: ${imagePlan.colorTone}`
  if (imagePlan.elements) prompt += `. Elements: ${imagePlan.elements}`

  if (styleKeywords) prompt += `. Style: ${styleKeywords}`

  if (marketplace === 'US') prompt += `. US market style, American lifestyle`
  else if (marketplace === 'EU') prompt += `. European market style, minimalist design`
  else if (marketplace === 'JP') prompt += `. Japanese market style, clean and detailed`

  prompt += '. Ultra high quality, professional commercial photography, photorealistic, detailed product showcase, Amazon listing compliant, no watermarks, no text overlays'

  return prompt
}

function getStyleKeywords(styleKey) {
  const styles = {
    'minimalist': 'minimalist, clean, modern, simple, professional lighting',
    'lifestyle': 'lifestyle, natural lighting, realistic, warm tone',
    'premium': 'premium, luxury, elegant, sophisticated, dramatic lighting',
    'vibrant': 'vibrant, colorful, energetic, eye-catching, bright',
    'natural': 'natural, eco-friendly, organic, earth tone, sustainable',
    'tech': 'futuristic, tech, digital, innovation, blue tone, neon',
    'cozy': 'cozy, warm, comfortable, homey, soft lighting',
    'professional': 'professional, business, corporate, clean, trustworthy'
  }
  return styles[styleKey] || ''
}

export default router