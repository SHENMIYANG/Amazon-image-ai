import axios from 'axios'

async function checkAPI() {
  // ⚠️ 注意：不要在此文件中硬编码密钥！
  // 请使用环境变量：IMAGE_GEN_API_KEY 或 AGENT_API_KEY
  const apiKey = process.env.IMAGE_GEN_API_KEY || process.env.AGENT_API_KEY || 'sk-your-api-key-here'
  const baseUrl = process.env.IMAGE_GEN_BASE_URL || process.env.AGENT_BASE_URL || 'https://claudex.me/v1'
  
  try {
    console.log('=== 检查 claudex.me API ===\n')
    
    // 1. 测试 /models 端点
    console.log('1. 测试 /models 端点...')
    const modelsRes = await axios.get(`${baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    })
    console.log('可用模型:', modelsRes.data.data.map(m => m.id))
    
    // 2. 测试 /chat/completions 端点（使用 gpt-image-2 以外的模型）
    console.log('\n2. 测试文本聊天...')
    const chatRes = await axios.post(`${baseUrl}/chat/completions`, {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }]
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })
    console.log('聊天响应:', chatRes.data)
    
    // 3. 检查是否有其他端点
    console.log('\n3. 尝试访问根路径...')
    const rootRes = await axios.get('https://claudex.me/', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    })
    console.log('根路径响应状态:', rootRes.status)
    
  } catch (error) {
    console.error('错误:', error.response?.status, error.response?.data || error.message)
  }
}

checkAPI()
