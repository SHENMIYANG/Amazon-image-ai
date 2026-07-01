import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: 'sk-4949f86a91db7bd5198ef102ba4b92674a38e2f52de82941afa4c86b1f002bb6',
  baseURL: 'https://claudex.me/v1'
})

async function testModels() {
  try {
    console.log('=== 测试 claudex.me 可用模型 ===\n')
    
    // 测试模型列表
    const models = await openai.models.list()
    console.log('所有可用模型:')
    models.data.forEach(m => console.log('  -', m.id))
    
    console.log('\n=== 测试文本模型 ===\n')
    
    // 测试不同的文本模型
    const textModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini']
    
    for (const model of textModels) {
      try {
        console.log(`测试 ${model}...`)
        const completion = await openai.chat.completions.create({
          model: model,
          messages: [
            { role: 'user', content: 'Hello, test only.' }
          ],
          max_tokens: 20
        })
        console.log(`✅ ${model} 可用 - 响应：${completion.choices[0].message.content}`)
      } catch (error) {
        console.log(`❌ ${model} 不可用 - ${error.message}`)
      }
    }
    
  } catch (error) {
    console.error('测试失败:', error.message)
  }
}

testModels()
