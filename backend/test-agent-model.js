import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: 'sk-4949f86a91db7bd5198ef102ba4b92674a38e2f52de82941afa4c86b1f002bb6',
  baseURL: 'https://claudex.me/v1'
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
