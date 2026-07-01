// 测试 agent-analyze API - 模拟前端请求
const testPayload = {
  productName: 'Wireless Bluetooth Earbuds',
  sellingPoints: '40H Battery Life\nActive Noise Cancelling\nIPX7 Waterproof',
  marketplace: 'US',
  style: 'professional'
}

console.log('发送请求到：http://localhost:3001/api/agent-analyze')
console.log('请求数据:', JSON.stringify(testPayload, null, 2))
console.log()

fetch('http://localhost:3001/api/agent-analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(testPayload)
})
.then(async res => {
  console.log('HTTP Status:', res.status)
  console.log('Headers:', JSON.stringify(Object.fromEntries(res.headers.entries()), null, 2))
  
  const text = await res.text()
  console.log('Raw Response:')
  console.log(text)
  console.log()
  
  try {
    const json = JSON.parse(text)
    console.log('✅ JSON 解析成功!')
    console.log(JSON.stringify(json, null, 2))
  } catch (e) {
    console.error('❌ JSON 解析失败:', e.message)
  }
})
.catch(err => {
  console.error('❌ 请求失败:', err)
})
