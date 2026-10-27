import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { once } from 'node:events'
import express from 'express'
import { claimRequest, readRequest, updateRequest, failRequest, pendingRequests } from './services/persistence/requestJournal.js'
import { recordCompletedResult, repairRecordedResult } from './services/persistence/resultRecovery.js'
import { getDatabaseClient, disconnectDatabaseClient } from './services/persistence/client.js'
import { persistGenerationResult, persistStrategyResult } from './services/persistence/workbenchRepository.js'
import { isAuthEnabled } from './services/auth/session.js'
import { assertReferenceBudget } from './utils/referenceLimits.js'
import { normalizeStrategyPlans } from './services/agent/planNormalizer.js'
import { getActivityPagination } from './routes/activity.js'
import activityRouter from './routes/activity.js'
import analysisRouter from './routes/agent-analyze.js'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'image-studio-recovery-'))
process.env.REQUEST_JOURNAL_DIR = directory
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test'
const actor = { userId: 'test-user', organizationId: 'test-org', role: 'MEMBER' }
const servers = []
async function listen(app) {
  const server = app.listen(0, '127.0.0.1')
  servers.push(server)
  await once(server, 'listening')
  return `http://127.0.0.1:${server.address().port}`
}
try {
  process.env.NODE_ENV = 'production'
  process.env.AUTH_ENABLED = 'false'
  assert.throws(isAuthEnabled, /生产环境/)
  process.env.AUTH_ENABLED = 'true'
  const databaseUrl = process.env.DATABASE_URL
  delete process.env.DATABASE_URL
  assert.throws(isAuthEnabled, /生产环境/)
  process.env.DATABASE_URL = databaseUrl
  assert.equal(isAuthEnabled(), true)
  process.env.NODE_ENV = 'test'

  assert.throws(() => assertReferenceBudget(Array.from({ length: 8 }, (_, i) => `product-${i}`), 1), /最多支持 8/)
  assert.doesNotThrow(() => assertReferenceBudget(Array.from({ length: 7 }, (_, i) => `product-${i}`), 1))
  process.env.IMAGE_MAX_REFERENCE_IMAGES = '4'
  assert.throws(() => assertReferenceBudget(['1', '2', '3', '4'], 1), /最多支持 4/)
  delete process.env.IMAGE_MAX_REFERENCE_IMAGES

  const requestedTasks = [{ taskKey: 'main-1', taskType: 'main' }, { taskKey: 'feature-1', taskType: 'feature' }]
  const strategyPlans = [{ taskKey: 'feature-1', strategyContent: '卖点图策略' }, { taskKey: 'main-1', strategyContent: '主图策略' }]
  assert.deepEqual(normalizeStrategyPlans({ requestedTasks, strategyPlans }).map((plan) => plan.strategyContent), ['主图策略', '卖点图策略'])
  for (const invalid of [[strategyPlans[0]], [strategyPlans[0], strategyPlans[0]], [{ strategyContent: '无编号' }]]) {
    assert.throws(() => normalizeStrategyPlans({ requestedTasks, strategyPlans: invalid }), /任务|策略/)
  }
  assert.deepEqual(getActivityPagination({ page: '3' }), { page: 3, pageSize: 20, skip: 40 })
  assert.equal(getActivityPagination({ page: '-1' }).page, 1)
  assert.equal(getActivityPagination({ page: 'Infinity' }).page, 1000000)

  const requestId = 'analysis-recovery-test-001'
  const { entry } = claimRequest('strategy', requestId, actor, { productName: 'test' })
  assert.equal(claimRequest('strategy', requestId, actor, { productName: 'test' }).existing, true)
  assert.throws(() => claimRequest('strategy', requestId, actor, { productName: 'changed' }), /已使用/)
  assert.equal(readRequest('strategy', requestId, { ...actor, userId: 'other' }), null)
  assert.equal(readRequest('strategy', requestId, { ...actor, organizationId: 'other' }), null)
  assert.throws(() => readRequest('strategy', '../secret', actor), /无效/)

  const db = await getDatabaseClient()
  let transactions = 0
  db.$transaction = async () => { transactions += 1; throw new Error('simulated database outage') }
  const output = { imagePlans: [{ taskKey: 'main-1', strategyContent: '中文策略', promptEn: 'English' }], _meta: { requestId } }
  const payload = { input: { productName: 'test' }, output, requestId, actor }
  const recorded = await recordCompletedResult(entry, payload, { success: true, data: output })
  assert.equal(recorded.status, 'SUCCEEDED')
  assert.equal(recorded.pendingPersistence, true)
  assert.equal(pendingRequests().length, 1)

  const moduleUrl = pathToFileURL(path.resolve('services/persistence/requestJournal.js')).href
  const childResult = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
    `import { readRequest } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(readRequest('strategy', ${JSON.stringify(requestId)}, ${JSON.stringify(actor)})))`
  ], { encoding: 'utf8' }))
  assert.equal(childResult.result.data.imagePlans[0].strategyContent, '中文策略')
  assert.equal(childResult.pendingPersistence, true)

  db.$transaction = async () => {
    transactions += 1
    return { workspaceId: 'workspace', strategyRunId: 'strategy', inputVersionId: 'input', referenceAssetIds: [], imagePlans: [{ taskKey: 'main-1', imagePlanId: 'plan', imagePlanVersionId: 'version' }] }
  }
  const beforeRepair = transactions
  const [repaired, duplicate] = await Promise.all([repairRecordedResult(recorded), repairRecordedResult(recorded)])
  assert.equal(transactions, beforeRepair + 1)
  assert.deepEqual(repaired, duplicate)
  assert.equal(repaired.pendingPersistence, false)
  assert.equal(repaired.result.data.imagePlans[0].databasePlanVersionId, 'version')
  await repairRecordedResult(recorded)
  assert.equal(transactions, beforeRepair + 1)
  failRequest(entry, 'late transport error')
  assert.equal(readRequest('strategy', requestId, actor).status, 'SUCCEEDED')

  const generationId = 'generation-recovery-test-001'
  const generation = claimRequest('generation', generationId, actor, {}).entry
  const image = { status: 'completed', imageUrl: '/api/assets/local/generated/recovered.png' }
  const generationPayload = { executionContext: { persistence: { workspaceId: 'workspace', imagePlanId: 'plan', imagePlanVersionId: 'version' } }, images: [image], generationRunId: 'run', requestId: generationId, actor }
  db.$transaction = async () => { throw new Error('simulated image database outage') }
  const pendingImage = await recordCompletedResult(generation, generationPayload, { success: true, images: [image] })
  assert.equal(pendingImage.result.images[0].imageUrl, image.imageUrl)
  assert.equal(pendingImage.pendingPersistence, true)
  db.$transaction = async () => ({ generationRunId: 'run' })
  assert.equal((await repairRecordedResult(pendingImage)).result.persistence.generationRunId, 'run')

  for (const status of ['SUCCEEDED', 'FAILED']) {
    db.$transaction = async (transaction) => transaction({
      productWorkspace: { findFirst: async () => ({ id: 'workspace', organizationId: actor.organizationId }) },
      imagePlan: { findFirst: async () => ({ id: 'plan' }) },
      imagePlanVersion: { findFirst: async () => ({ id: 'version' }) },
      generationRun: {
        findFirst: async () => ({ id: 'run', status, generatedImages: status === 'SUCCEEDED' ? [image] : [] }),
        update: async () => assert.fail('a terminal run must not be written twice'),
        create: async () => assert.fail('a terminal run must not be created twice')
      }
    })
    const saved = await persistGenerationResult({ ...generationPayload, images: status === 'SUCCEEDED' ? [image] : [{ status: 'failed', error: 'upstream failed' }] })
    assert.equal(saved.generationRunId, 'run')
  }
  db.$transaction = async (transaction) => transaction({ strategyRun: { findUnique: async () => ({
    id: 'strategy', workspaceId: 'workspace', inputVersionId: 'input',
    workspace: { organizationId: actor.organizationId }, inputVersion: { references: [] },
    imagePlans: [{ id: 'plan', taskKey: 'main-1', versions: [{ id: 'version', createdById: actor.userId }] }]
  }) } })
  assert.equal((await persistStrategyResult(payload)).strategyRunId, 'strategy')

  const runningId = 'analysis-interrupted-test-001'
  claimRequest('strategy', runningId, actor, {})
  const interrupted = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
    `import { readRequest } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(readRequest('strategy', ${JSON.stringify(runningId)}, ${JSON.stringify(actor)})))`
  ], { encoding: 'utf8' }))
  assert.equal(interrupted.status, 'UNKNOWN')
  let modelCalls = 0
  let releaseModel
  let notifyModelStarted
  const modelHeld = new Promise((resolve) => { releaseModel = resolve })
  const modelStarted = new Promise((resolve) => { notifyModelStarted = resolve })
  const upstream = express()
  upstream.use(express.json())
  upstream.post('/v1/chat/completions', async (req, res) => {
    modelCalls += 1
    notifyModelStarted()
    await modelHeld
    res.json({ choices: [{ message: { content: JSON.stringify({ productBlueprint: {}, imagePlans: [{ taskKey: 'main-1', name: 'Main', type: 'main', strategyContent: '中文主图策略，保留产品原貌。', promptEn: 'Show the real product on white.' }] }) } }] })
  })
  process.env.AGENT_BASE_URL = `${await listen(upstream)}/v1`
  process.env.AGENT_API_KEY = 'local-test-only'
  db.strategyRun.findUnique = async () => null
  db.$transaction = async () => ({ workspaceId: 'workspace', strategyRunId: 'strategy', inputVersionId: 'input', referenceAssetIds: [], imagePlans: [{ taskKey: 'main-1', imagePlanId: 'plan', imagePlanVersionId: 'version' }] })
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => { req.auth = { ...actor, userId: req.get('X-Test-User') || actor.userId }; next() })
  app.use('/api/agent-analyze', analysisRouter)
  app.use('/api/activity', activityRouter)
  app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }))
  const backendUrl = await listen(app)
  const httpRequestId = 'analysis-http-recovery-001'
  const body = JSON.stringify({ productName: 'Test product', selectedImageTasks: [{ type: 'main', count: 1 }], referenceImages: [] })
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Analysis-Request-Id': httpRequestId }, body }
  const firstRequest = fetch(`${backendUrl}/api/agent-analyze`, options)
  await modelStarted
  const inFlight = await fetch(`${backendUrl}/api/agent-analyze`, options)
  assert.equal(inFlight.status, 202)
  assert.equal(readRequest('strategy', httpRequestId, actor).status, 'RUNNING')
  releaseModel()
  const initialResponse = await (await firstRequest).json()
  assert.equal(initialResponse.data.imagePlans[0].databasePlanId, 'plan')
  const repeated = await (await fetch(`${backendUrl}/api/agent-analyze`, options)).json()
  assert.deepEqual(repeated, initialResponse)
  assert.equal(modelCalls, 1)
  assert.equal((await fetch(`${backendUrl}/api/agent-analyze/status/${httpRequestId}`, { headers: { 'X-Test-User': 'another-user' } })).status, 404)
  assert.equal((await fetch(`${backendUrl}/api/agent-analyze`, { ...options, body: JSON.stringify({ productName: 'Changed' }) })).status, 409)
  assert.equal(modelCalls, 1)

  fs.unlinkSync(path.join(directory, `strategy-${httpRequestId}.json`))
  db.strategyRun.findUnique = async ({ where }) => where.requestId === httpRequestId ? {
    id: 'strategy', workspaceId: 'workspace', inputVersionId: 'input', productBlueprint: {},
    workspace: { organizationId: actor.organizationId, deletedAt: null }, modelRequests: [{ actorId: actor.userId }],
    rawResponse: { imagePlans: initialResponse.data.imagePlans }, completedAt: new Date(),
    inputVersion: { inputSnapshot: { analysisRevision: 0 }, references: [] },
    imagePlans: [{ id: 'plan', taskKey: 'main-1', versions: [{ id: 'version' }] }]
  } : null
  const afterExpiry = await (await fetch(`${backendUrl}/api/agent-analyze`, options)).json()
  assert.equal(afterExpiry.data.imagePlans[0].databasePlanId, 'plan')
  assert.equal(modelCalls, 1, 'an expired local journal must not cause another paid request')
  assert.equal((await fetch(`${backendUrl}/api/agent-analyze/status/${httpRequestId}`, { headers: { 'X-Test-User': 'another-user' } })).status, 404)

  let workspaceQuery
  db.productWorkspace.count = async () => 21
  db.productWorkspace.findMany = async (query) => { workspaceQuery = query; return [] }
  const activity = await (await fetch(`${backendUrl}/api/activity?page=2`)).json()
  assert.equal(activity.pagination.total, 21)
  assert.equal(workspaceQuery.skip, 20)
  assert.equal(workspaceQuery.take, 20)
  assert.equal(workspaceQuery.where.organizationId, actor.organizationId)
  assert.equal(workspaceQuery.where.createdById, actor.userId)
  console.log('request recovery tests passed: auth, reference budget, task identity, pagination, owner isolation, restart, database repair, duplicate suppression')
} finally {
  for (const server of servers) {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
  await disconnectDatabaseClient()
  fs.rmSync(directory, { recursive: true, force: true })
}
