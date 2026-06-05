import express from 'express'
import axios from 'axios'

const router = express.Router()

// 测试 API Key 是否有效
router.post('/', async (req, res) => {
  try {
    const { baseUrl, apiKey, model } = req.body

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: 'API Key 不能为空'
      })
    }

    // 调用 OpenAI Images API（测试请求）
    const response = await axios.post(
      `${baseUrl}/images/generations`,
      {
        model: model || 'gpt-image-2',
        prompt: 'A simple test image',
        n: 1,
        size: '1024x1024'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 10000 // 10 秒超时
      }
    )

    if (response.status === 200) {
      res.json({ success: true, message: 'API Key 有效' })
    } else {
      res.status(response.status).json({
        success: false,
        message: `API 返回状态码：${response.status}`
      })
    }
  } catch (error) {
    console.error('API Key test error:', error.response?.data || error.message)
    
    if (error.response) {
      const errorMsg = error.response.data?.error?.message || 'API 请求失败'
      res.status(error.response.status).json({
        success: false,
        message: errorMsg
      })
    } else if (error.code === 'ECONNABORTED') {
      res.status(500).json({
        success: false,
        message: '请求超时，请检查网络或 API 地址'
      })
    } else {
      res.status(500).json({
        success: false,
        message: error.message || '测试失败'
      })
    }
  }
})

export default router
