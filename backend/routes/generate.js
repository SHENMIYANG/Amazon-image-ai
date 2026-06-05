import express from 'express'
import axios from 'axios'
import fs from 'fs'
import path from 'path'

const router = express.Router()

router.post('/', async (req, res) => {
  try {
    const { 
      listing, 
      imagePlans, 
      imageType, 
      style, 
      resolution, 
      referenceImages,
      apiConfig 
    } = req.body

    // Validate input
    if (!listing || !imagePlans || imagePlans.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        message: 'Listing and imagePlans are required' 
      })
    }

    // Validate product images (required)
    if (!referenceImages || referenceImages.length === 0) {
      return res.status(400).json({
        error: 'Missing product images',
        message: '请至少上传一张产品图片'
      })
    }

    // Validate API Key
    const apiKey = apiConfig?.apiKey || process.env.OPENAI_API_KEY
    if (!apiKey) {
      return res.status(400).json({
        error: 'Missing API Key',
        message: '请先配置 API Key（点击右上角设置）'
      })
    }

    // Determine resolution
    const size = resolution === '4k' ? '4096x4096' : '2048x2048'

    // Build prompt for each image
    const generatedImages = []
    
    for (const plan of imagePlans) {
      const prompt = buildAmazonPrompt(listing, plan, style)
      
      // Call GPT-Image-2 API with product reference image
      const imageUrl = await callGPTImage2(prompt, referenceImages[0], size, apiKey, apiConfig)
      
      generatedImages.push({
        imageId: plan.id,
        imageUrl,
        prompt,
        status: 'completed',
        resolution: size
      })
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
        error: 'GPT-Image-2 API error',
        message: error.response.data.error?.message || 'Unknown error'
      })
    } else {
      res.status(500).json({
        error: 'Server error',
        message: error.message
      })
    }
  }
})

function buildAmazonPrompt(listing, imagePlan, style) {
  const { 
    productName, category, targetAudience, sellingPoints, 
    dimensions, material, sceneRequirements, marketplace 
  } = listing

  // Style keywords
  const styleKeywords = style ? getStyleKeywords(style) : ''

  // Base prompt for Amazon
  let prompt = `Professional Amazon product photography for ${productName}`
  
  prompt += `. Category: ${category}`
  prompt += `. Target audience: ${targetAudience}`
  
  if (sellingPoints) {
    const points = sellingPoints.split('\n').filter(s => s.trim()).slice(0, 3)
    prompt += `. Key features: ${points.join(', ')}`
  }
  
  if (dimensions) {
    prompt += `. Dimensions: ${dimensions}`
  }
  
  if (material) {
    prompt += `. Material: ${material}`
  }

  // Add image plan specifics
  if (imagePlan.scene) {
    prompt += `. Scene: ${imagePlan.scene}`
  }
  
  if (imagePlan.composition) {
    prompt += `. Composition: ${imagePlan.composition}`
  }
  
  if (imagePlan.colorTone) {
    prompt += `. Color tone: ${imagePlan.colorTone}`
  }
  
  if (imagePlan.elements) {
    prompt += `. Elements: ${imagePlan.elements}`
  }

  // Add style keywords
  if (styleKeywords) {
    prompt += `. Style: ${styleKeywords}`
  }

  // Marketplace specific requirements
  if (marketplace === 'US') {
    prompt += `. US market style, American lifestyle`
  } else if (marketplace === 'EU') {
    prompt += `. European market style, minimalist design`
  } else if (marketplace === 'JP') {
    prompt += `. Japanese market style, clean and detailed`
  }

  // Quality modifiers
  prompt += '. Ultra high quality, professional commercial photography, 8k resolution, photorealistic, detailed product showcase'

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

async function callGPTImage2(prompt, referenceImageUrl, size, apiKey, apiConfig) {
  // Use dynamic config or default to OpenAI
  const baseUrl = apiConfig?.baseUrl || 'https://api.openai.com/v1'
  const endpoint = apiConfig?.endpoint || '/images/generations'
  const model = apiConfig?.model || 'gpt-image-2'
  const quality = apiConfig?.defaultQuality || 'high'

  // Read the reference image and convert to base64
  const imagePath = path.join(process.cwd(), referenceImageUrl.replace('/uploads/', 'uploads/'))
  const imageBuffer = fs.readFileSync(imagePath)
  const base64Image = imageBuffer.toString('base64')
  const mimeType = path.extname(imagePath).slice(1)

  const response = await axios.post(
    `${baseUrl}${endpoint}`,
    {
      model: model,
      prompt: prompt,
      image: `data:image/${mimeType};base64,${base64Image}`,
      n: 1,
      size: size,
      quality: quality,
      response_format: 'url'
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 60000 // 60 秒超时
    }
  )

  return response.data.data[0].url
}

export default router
