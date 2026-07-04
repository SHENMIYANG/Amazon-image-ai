import OpenAI from 'openai'

// ⚠️ 注意：不要在此文件中硬编码密钥！
// 请使用环境变量：IMAGE_GEN_API_KEY 或 AGENT_API_KEY
const openai = new OpenAI({
  apiKey: process.env.IMAGE_GEN_API_KEY || process.env.AGENT_API_KEY || 'sk-your-api-key-here',
  baseURL: process.env.IMAGE_GEN_BASE_URL || process.env.AGENT_BASE_URL || 'https://claudex.me/v1'
})

async function testModels() {
  try {
    console.log('测试 API 连接...')
    
    // 测试模型列表
    const models = await openai.models.list()
    console.log('可用模型:', models.data.map(m => m.id))
    
    // 测试 GPT-4o
    console.log('\n测试 GPT-4o...')
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    })
    console.log('GPT-4o 响应:', completion.choices[0].message.content)
    
  } catch (error) {
    console.error('测试失败:', error.message)
  }
}

testModels()
