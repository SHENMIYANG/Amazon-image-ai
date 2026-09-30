import assert from 'node:assert/strict'
import { formatApiError, parseApiJson } from './src/utils/apiResponse.js'

for (const [stage, label] of Object.entries({ layout_templates: '模板读取', reference_images: '参考图片读取', model_request: '模型请求', model_response: '模型返回解析' })) {
  const response = new Response(JSON.stringify({ message: '测试错误', stage, requestId: 'agent-test-123' }), { status: 503, headers: { 'content-type': 'application/json' } })
  await assert.rejects(parseApiJson(response, '策略'), (error) => {
    const message = formatApiError(error, '策略分析')
    assert.ok(message.includes(label))
    assert.ok(message.includes('测试错误'))
    assert.ok(message.includes('agent-test-123'))
    return true
  })
}
assert.match(formatApiError(new Error('Failed to fetch'), '策略分析'), /无法连接服务器/)
console.log('API error tests passed')
