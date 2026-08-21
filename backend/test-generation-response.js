import assert from 'assert/strict'
import { buildGenerationSuccessResponse } from './routes/generate.js'

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
console.log('generation response tests passed')
