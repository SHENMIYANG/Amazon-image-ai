import express from 'express'
import axios from 'axios'
import dotenv from 'dotenv'
import FormData from 'form-data'
import fs from 'fs'
import path from 'path'

dotenv.config()

const router = express.Router()

// 获取配置状态
router.get('/status', (req, res) => {
  const { IMAGE_GEN_BASE_URL, IMAGE_GEN_API_KEY, IMAGE_GENERATION_MODEL } = process.env
  const configured = !!(IMAGE_GEN_API_KEY && IMAGE_GEN_API_KEY !== 'sk-your-api-key-here')
  res.json({ configured, baseUrl: IMAGE_GEN_BASE_URL, model: IMAGE_GENERATION_MODEL })
})

// 测试接口
router.post('/', async (req, res) => {
  const testImagePath = path.join(process.cwd(), 'uploads', `test-${Date.now()}.png`)

  try {
    const { IMAGE_GEN_BASE_URL, IMAGE_GEN_API_KEY, IMAGE_GENERATION_MODEL } = process.env

    if (!IMAGE_GEN_API_KEY || IMAGE_GEN_API_KEY === 'sk-your-api-key-here') {
      return res.status(400).json({ success: false, message: '未配置 IMAGE_GEN_API_KEY，请检查 backend/.env' })
    }
    if (!IMAGE_GEN_BASE_URL) {
      return res.status(400).json({ success: false, message: '未配置 IMAGE_GEN_BASE_URL，请检查 backend/.env' })
    }
    if (!IMAGE_GENERATION_MODEL) {
      return res.status(400).json({ success: false, message: '未配置 IMAGE_GENERATION_MODEL，请检查 backend/.env' })
    }

    // 确保 uploads 目录存在
    const uploadsDir = path.join(process.cwd(), 'uploads')
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

    // 最小有效 PNG（1x1 像素）
    const minimalPng = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
      '2e00000000c4944415478016360f8cfc00000000200016ebe6c5600000000' +
      '49454e44ae426082', 'hex'
    )
    fs.writeFileSync(testImagePath, minimalPng)

    // 使用 /images/edits 接口（图生图）测试
    const form = new FormData()
    form.append('model', IMAGE_GENERATION_MODEL)
    form.append('prompt', 'Professional product photography test, clean background')
    form.append('size', '1024x1024')
    form.append('n', '1')
    form.append('response_format', 'b64_json')
    form.append('image', fs.createReadStream(testImagePath), {
      filename: 'test.png',
      contentType: 'image/png'
    })

    const response = await axios.post(
      `${IMAGE_GEN_BASE_URL}/images/edits`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${IMAGE_GEN_API_KEY}`
        },
        timeout: Number(process.env.IMAGE_GEN_TIMEOUT_MS || 300000)
      }
    )

    if (!response.data?.data?.[0]?.b64_json) {
      return res.status(500).json({ success: false, message: 'API 返回数据格式异常' })
    }

    res.json({ success: true, message: '连接成功！接口完全正常', baseUrl: IMAGE_GEN_BASE_URL, model: IMAGE_GENERATION_MODEL })

  } catch (error) {
    console.error('API test error:', error.response?.data || error.message)
    if (error.response) {
      const status = error.response.status
      let message = error.response.data?.error?.message || 'API 请求失败'
      if (status === 401) message = 'API Key 无效'
      if (status === 403) message = '无权限使用该模型'
      if (status === 429) message = 'API 额度不足或请求过于频繁'
      if (status === 400) message = `请求参数错误：${message}`
      res.status(status).json({ success: false, message })
    } else if (error.code === 'ECONNABORTED') {
      res.status(500).json({ success: false, message: '连接超时，请检查 API Base URL' })
    } else {
      res.status(500).json({ success: false, message: error.message || '测试失败' })
    }
  } finally {
    try { fs.unlinkSync(testImagePath) } catch (e) {}
  }
})

export default router
