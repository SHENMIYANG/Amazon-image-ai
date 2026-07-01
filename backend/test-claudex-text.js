// 测试 claudex.me 文本模型
import 'dotenv/config'
import OpenAI from 'openai'

const apiKey = process.env.AGENT_API_KEY
const baseUrl = process.env.AGENT_BASE_URL
const model = process.env.AGENT_MODEL

console.log('🔧 测试配置:')
console.log('  API Key:', apiKey ? '✓ 已配置' : '✗ 未配置')
console.log('  Base URL:', baseUrl)
console.log('  Model:', model)
console.log()

async function testTextModel() {
  console.log('🚀 开始测试 claudex.me 文本模型...')
  
  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: baseUrl
  })
  
  try {
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: '你是一个助手。请用简短的中文回答。' },
        { role: 'user', content: '你好，测试文本模型是否可用？' }
      ],
      temperature: 0.7,
      max_tokens: 100
    })
    
    console.log('✅ 测试成功！')
    console.log('响应:', completion.choices[0].message.content)
    console.log('Usage:', completion.usage)
    
  } catch (error) {
    console.error('❌ 测试失败!')
    console.error('错误信息:', error.message)
    if (error.response) {
      console.error('HTTP 状态:', error.response.status)
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2))
    }
    if (error.stack) {
      console.error('堆栈:', error.stack)
    }
  }
}

testTextModel()
