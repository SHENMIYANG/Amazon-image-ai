import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import express from 'express'
import axios from 'axios'
import { S3Client } from '@aws-sdk/client-s3'
import { getDatabaseClient, disconnectDatabaseClient } from './services/persistence/client.js'
import generateRouter, { translatePlanPromptIfNeeded } from './routes/generate.js'
import promptRouter from './routes/prompt-preview.js'
import assetRouter from './routes/assets.js'
import feedbackRouter from './routes/image-feedback.js'
import { writeAsset, readAssetBuffer, repairPendingAssets } from './services/storage.js'
import sharp from 'sharp'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'image-studio-safety-'))
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test', REQUEST_JOURNAL_DIR: directory,
  AGENT_API_KEY: 'test', IMAGE_GEN_API_KEY: 'test', IMAGE_GEN_BASE_URL: 'http://127.0.0.1:1/v1', IMAGE_GENERATION_MODEL: 'test',
  STORAGE_S3_ENDPOINT: 'http://127.0.0.1:1', STORAGE_S3_BUCKET: 'isolated-test', STORAGE_S3_ACCESS_KEY: 'test', STORAGE_S3_SECRET_KEY: 'test'
})
const actor = { userId: 'test-user', organizationId: 'test-org', role: 'OPERATOR' }
const servers = []
async function listen(app) {
  const server = app.listen(0, '127.0.0.1')
  servers.push(server)
  await once(server, 'listening')
  return `http://127.0.0.1:${server.address().port}`
}
const originalPost = axios.post
const originalSend = S3Client.prototype.send
try {
  const db = await getDatabaseClient()
  const assetChecks = []
  db.asset.findFirst = async ({ where }) => { assetChecks.push(where.objectKey); return null }
  const app = express()
  app.use(express.json(), (req, res, next) => { req.auth = actor; next() })
  app.use('/generate', generateRouter)
  app.use('/prompt', promptRouter)
  app.use('/feedback', feedbackRouter)
  app.use('/assets', assetRouter)
  const base = await listen(app)
  const post = async (route, body) => {
    const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { status: response.status, body: await response.json() }
  }
  let modelCalls = 0
  axios.post = async () => { modelCalls += 1; throw new Error('Unexpected model invocation') }
  const plan = { id: 1, taskType: 'main', strategyContent: '白底主图' }
  for (const referenceImages of [[], ['/api/assets/local/reference/owned.png']]) {
    const response = await post('/generate', { listing: {}, imagePlans: [plan], referenceImages, primaryReferenceImageUrl: '/api/assets/local/reference/another-user.png' })
    assert.equal(response.status, 403)
    assert.ok(assetChecks.includes('reference/another-user.png'))
  }
  const batch = await post('/generate', { listing: {}, imagePlans: Array.from({ length: 17 }, () => plan) })
  assert.equal(batch.status, 400)
  assert.equal(modelCalls, 0)
  console.log('PASS: explicit primary images are authorized, and legacy batches stop before any model call')

  const translations = []
  axios.post = async (url, body) => {
    translations.push(body.messages[1].content)
    return { data: { choices: [{ message: { content: `Exact translation ${translations.length}` } }] } }
  }
  const product = (productType) => ({ productBlueprint: { identity: { productType }, structure: { mainParts: [productType] } } })
  const dirty = { strategyContent: '展示产品结构', promptDirty: true }
  const first = await translatePlanPromptIfNeeded(dirty, product('Door lock'), '2048x2048')
  const second = await translatePlanPromptIfNeeded(dirty, product('Paper holder'), '2048x2048')
  const repeat = await translatePlanPromptIfNeeded(dirty, product('Paper holder'), '2048x2048')
  assert.notEqual(first.promptEn, second.promptEn)
  assert.equal(repeat.promptEn, second.promptEn)
  assert.equal(translations.length, 2)
  console.log('PASS: identical Chinese strategies do not reuse translations from another product')

  let versionData
  db.$transaction = async (action) => action({
    imagePlan: { findFirst: async () => ({ id: 'plan' }) },
    imagePlanVersion: { findFirst: async () => ({ version: 1 }), create: async ({ data }) => { versionData = data; return { id: 'version-2', version: 2 } } }
  })
  const saved = await post('/prompt', { listing: {}, plan: { ...plan, strategyContent: '用户修改的主图策略', databasePlanId: 'plan' }, persistence: { workspaceId: 'workspace' } })
  assert.equal(saved.status, 200)
  assert.equal(saved.body.data.persistence.imagePlanVersionId, 'version-2')
  assert.equal(versionData.strategyContent, '用户修改的主图策略')
  assert.equal(versionData.source, 'OPERATOR')
  assert.equal(translations.length, 2, 'Saving a main strategy must not call the translation model')
  console.log('PASS: edited main strategies create an operator version without translation')

  const png = await sharp({ create: { width: 384, height: 384, channels: 3, background: '#fff' } }).png().toBuffer()
  S3Client.prototype.send = async () => { throw new Error('Simulated object storage failure') }
  const stored = await writeAsset({ objectKey: 'generated/safety-check.png', body: png, contentType: 'image/png' })
  assert.match(stored.storageWarning, /请勿重复生成/)
  assert.deepEqual(await readAssetBuffer('s3', stored.objectKey), png)
  let uploads = 0
  S3Client.prototype.send = async (command) => {
    if (command.constructor.name === 'PutObjectCommand') {
      uploads += 1
      assert.equal(command.input.Key, stored.objectKey)
      assert.deepEqual(command.input.Body, png)
      return {}
    }
    return { Body: { transformToByteArray: async () => png } }
  }
  await repairPendingAssets()
  await repairPendingAssets()
  assert.equal(uploads, 1)
  assert.deepEqual(await readAssetBuffer('s3', stored.objectKey), png)
  console.log('PASS: an object storage outage preserves image bytes and repairs once without a model call')

  db.productWorkspace.findFirst = async () => ({ id: 'workspace', organizationId: actor.organizationId })
  db.imagePlan.findFirst = async () => ({ id: 'plan', taskType: 'main', strategyRun: {}, versions: [], generationRuns: [{ generatedImages: [{ id: 'image', asset: { storageProvider: 's3', objectKey: stored.objectKey } }] }] })
  db.feedbackThread.findFirst = async () => ({ id: 'thread', messages: [] })
  db.asset.findFirst = async ({ where }) => where.objectKey === stored.objectKey ? { id: 'asset' } : null
  const completions = []
  const provider = express()
  provider.use(express.json({ limit: '5mb' }))
  provider.post('/chat/completions', (req, res) => {
    completions.push(req.body)
    // Invalid output stops before persistence; this test checks the visual input boundary.
    res.json({ choices: [{ message: { content: 'not-json' } }] })
  })
  process.env.AGENT_BASE_URL = await listen(provider)
  const feedback = await post('/feedback/chat', { workspaceId: 'workspace', imagePlanId: 'plan', userMessage: '检查这张图片' })
  assert.equal(feedback.status, 502)
  assert.equal(completions.length, 1)
  const imageParts = completions[0].messages.flatMap((message) => Array.isArray(message.content) ? message.content : []).filter((part) => part.type === 'image_url')
  assert.equal(imageParts.length, 1)
  assert.ok(imageParts[0].image_url.url.startsWith('data:image/png;base64,'))
  const denied = await post('/feedback/chat', { workspaceId: 'workspace', imagePlanId: 'plan', userMessage: '检查', feedbackReferenceImages: ['/api/assets/local/reference/private.png'] })
  assert.equal(denied.status, 403)
  assert.equal(completions.length, 1)
  console.log('PASS: feedback sends actual image pixels and rejects private attachments before the model')

  delete process.env.DATABASE_URL
  process.env.AUTH_ENABLED = 'false'
  const asset = await fetch(`${base}/assets/s3/${stored.objectKey}`)
  assert.equal(asset.status, 200)
  assert.match(asset.headers.get('content-type'), /image\/png/)
  assert.deepEqual(Buffer.from(await asset.arrayBuffer()), png)
  console.log('PASS: database-free development serves uploaded assets with the right content type')
} finally {
  axios.post = originalPost
  S3Client.prototype.send = originalSend
  await Promise.all(servers.map((server) => new Promise((resolve) => { server.close(resolve); server.closeAllConnections() })))
  await disconnectDatabaseClient()
  fs.rmSync(directory, { recursive: true, force: true })
}
