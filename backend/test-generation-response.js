import assert from 'assert/strict'
import { buildGenerationSuccessResponse } from './routes/generate.js'
import { applyStrategyPersistenceResult } from './routes/agent-analyze.js'
import { buildPromptPreviewSuccessResponse } from './routes/prompt-preview.js'

const image = { imageId: 'main-1', imageUrl: '/api/assets/local/generated/main-1.png', status: 'completed' }

const warningResponse = buildGenerationSuccessResponse({
  images: [image],
  persistence: null,
  persistenceRequired: true
})

assert.equal(warningResponse.success, true)
assert.deepEqual(warningResponse.images, [image])
assert.match(warningResponse.persistenceWarning, /图片已生成/)

const persistedResponse = buildGenerationSuccessResponse({
  images: [image],
  persistence: { generationId: 'generation-1' },
  persistenceRequired: true
})

assert.equal(persistedResponse.persistenceWarning, undefined)

const strategyData = applyStrategyPersistenceResult({ imagePlans: [{ id: 1 }], _meta: {} }, null, true)
assert.deepEqual(strategyData.imagePlans, [{ id: 1 }])
assert.match(strategyData._meta.persistenceWarning, /策略已生成/)

const promptResponse = buildPromptPreviewSuccessResponse({
  promptZh: '中文策略',
  promptEn: 'English prompt',
  executionPromptEn: 'Execution prompt',
  persistence: null,
  persistenceRequired: true
})
assert.equal(promptResponse.success, true)
assert.equal(promptResponse.data.promptEn, 'English prompt')
assert.match(promptResponse.persistenceWarning, /英文执行稿已生成/)
console.log('generation response tests passed')
