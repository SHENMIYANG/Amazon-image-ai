import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import dotenv from 'dotenv'
import pg from 'pg'
import sharp from 'sharp'
import { S3Client, CreateBucketCommand, DeleteObjectCommand, DeleteBucketCommand } from '@aws-sdk/client-s3'
import { getDatabaseClient, disconnectDatabaseClient } from './services/persistence/client.js'
import { claimRequest, readRequest, updateRequest } from './services/persistence/requestJournal.js'
import { recordCompletedResult, repairRecordedResult } from './services/persistence/resultRecovery.js'
import { beginGenerationRun, getGenerationRunByRequestId, getStrategyResultByRequestId, getAccessibleAsset } from './services/persistence/workbenchRepository.js'
import { writeAsset, readAssetBuffer } from './services/storage.js'

dotenv.config()
const databaseUrl = new URL(process.env.DATABASE_URL)
const endpoint = new URL(process.env.STORAGE_S3_ENDPOINT)
for (const host of [databaseUrl.hostname, endpoint.hostname]) {
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(host), 'Integration tests require local PostgreSQL and MinIO')
}
assert.ok(process.env.STORAGE_S3_ACCESS_KEY && process.env.STORAGE_S3_SECRET_KEY, 'MinIO credentials are required')
const suffix = crypto.randomUUID().replaceAll('-', '')
const databaseName = `recovery_check_${suffix}`
const bucket = `recovery-check-${suffix}`
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'image-studio-integration-'))
const objectKey = `generated/${suffix}.png`
const admin = new pg.Client({ connectionString: databaseUrl.href, connectionTimeoutMillis: 5000 })
const s3 = new S3Client({
  endpoint: endpoint.href, region: process.env.STORAGE_S3_REGION || 'us-east-1', forcePathStyle: true,
  credentials: { accessKeyId: process.env.STORAGE_S3_ACCESS_KEY, secretAccessKey: process.env.STORAGE_S3_SECRET_KEY }
})
let databaseCreated = false
let bucketCreated = false
databaseUrl.pathname = `/${databaseName}`
process.env.DATABASE_URL = databaseUrl.href
process.env.REQUEST_JOURNAL_DIR = directory
process.env.STORAGE_S3_BUCKET = bucket
process.env.STORAGE_S3_FORCE_PATH_STYLE = 'true'

// Use an unreachable connection in this process; never stop the shared database.
async function withDatabaseUnavailable(action) {
  await disconnectDatabaseClient()
  const unavailable = new URL(databaseUrl)
  unavailable.port = '1'
  unavailable.searchParams.set('connect_timeout', '1')
  process.env.DATABASE_URL = unavailable.href
  const logError = console.error
  const errors = []
  console.error = (...args) => errors.push(args)
  try {
    const result = await action()
    assert.ok(errors.length > 0, 'A real connection error should have been logged')
    return result
  } finally {
    console.error = logError
    await disconnectDatabaseClient()
    process.env.DATABASE_URL = databaseUrl.href
  }
}

try {
  await admin.connect()
  await admin.query(`CREATE DATABASE "${databaseName}"`)
  databaseCreated = true
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
    env: process.env, stdio: 'pipe'
  })
  console.log('PASS: migrations applied to an isolated PostgreSQL database')
  await s3.send(new CreateBucketCommand({ Bucket: bucket }))
  bucketCreated = true
  const png = await sharp({ create: { width: 384, height: 384, channels: 3, background: '#ffffff' } }).png().toBuffer()
  const stored = await writeAsset({ objectKey, body: png, contentType: 'image/png' })
  assert.equal(stored.storageProvider, 's3')
  assert.deepEqual(await readAssetBuffer('s3', objectKey), png)
  console.log('PASS: application storage writes and reads a real MinIO object')

  let db = await getDatabaseClient()
  const organization = await db.organization.create({ data: { name: 'Recovery integration', slug: suffix } })
  const user = await db.user.create({ data: { loginName: suffix } })
  await db.membership.create({ data: { userId: user.id, organizationId: organization.id, role: 'OPERATOR' } })
  const actor = { userId: user.id, organizationId: organization.id, role: 'OPERATOR' }
  const otherUser = await db.user.create({ data: { loginName: `other-${suffix}` } })
  const otherActor = { ...actor, userId: otherUser.id }
  const strategyId = `analysis-${suffix}`
  const input = { productName: 'Integration fixture', analysisRevision: 1 }
  const output = {
    productBlueprint: {},
    imagePlans: [{ taskKey: 'main-1', taskType: 'main', name: '主图', strategyContent: '白底展示产品', promptEn: 'Show the product on white.' }],
    _meta: { requestId: strategyId }
  }
  const strategyEntry = claimRequest('strategy', strategyId, actor, input).entry
  const pendingStrategy = await withDatabaseUnavailable(() => recordCompletedResult(strategyEntry,
    { input, output, requestId: strategyId, model: 'integration-fixture', actor }, { success: true, data: output }))
  assert.equal(pendingStrategy.pendingPersistence, true)
  assert.equal(pendingStrategy.result.data.imagePlans[0].strategyContent, '白底展示产品')
  const recoveredStrategy = await repairRecordedResult(pendingStrategy)
  assert.equal(recoveredStrategy.pendingPersistence, false)
  const persistence = recoveredStrategy.result.data._meta.persistence
  assert.ok(persistence?.imagePlans[0].imagePlanVersionId)
  assert.equal(readRequest('strategy', strategyId, otherActor), null)
  assert.equal((await getStrategyResultByRequestId({ requestId: strategyId, actor })).persistence.strategyRunId, persistence.strategyRunId)
  assert.equal((await getStrategyResultByRequestId({ requestId: strategyId, actor: otherActor })).inaccessible, true)
  const replayStrategy = await repairRecordedResult(updateRequest(recoveredStrategy, { pendingPersistence: true }))
  assert.equal(replayStrategy.pendingPersistence, false)
  db = await getDatabaseClient()
  assert.equal(await db.strategyRun.count(), 1)
  assert.equal(await db.imagePlanVersion.count(), 1)
  console.log('PASS: strategy survives a real connection failure, repairs once, and rejects another user')

  const generationId = `generation-${suffix}`
  const plan = persistence.imagePlans[0]
  const executionContext = {
    persistence: { workspaceId: persistence.workspaceId, ...plan, referenceAssetIds: [] },
    output: { resolution: '1024x1024' }, strategy: { promptEn: output.imagePlans[0].promptEn }
  }
  const generationEntry = claimRequest('generation', generationId, actor, executionContext).entry
  const run = await beginGenerationRun({ executionContext, requestId: generationId, actor })
  assert.equal(run.status, 'RUNNING')
  const images = [{ status: 'completed', imageUrl: stored.url, actualWidth: 384, actualHeight: 384, resolution: '1024x1024' }]
  const pendingImage = await withDatabaseUnavailable(() => recordCompletedResult(generationEntry,
    { executionContext, images, generationRunId: run.id, requestId: generationId, actor }, { success: true, images }))
  assert.equal(pendingImage.pendingPersistence, true)
  assert.equal(pendingImage.result.images[0].imageUrl, stored.url)
  const recoveredImage = await repairRecordedResult(pendingImage)
  assert.equal(recoveredImage.pendingPersistence, false)
  const replayImage = await repairRecordedResult(updateRequest(recoveredImage, { pendingPersistence: true }))
  assert.equal(replayImage.pendingPersistence, false)
  const completed = await getGenerationRunByRequestId({ requestId: generationId, actor })
  assert.equal(completed.status, 'SUCCEEDED')
  assert.equal(completed.images.length, 1)
  assert.equal(completed.images[0].sizeMatchesRequest, false)
  assert.equal((await beginGenerationRun({ executionContext, requestId: generationId, actor })).existing, true)
  assert.ok(await getAccessibleAsset({ storageProvider: 's3', objectKey, actor }))
  assert.equal(await getAccessibleAsset({ storageProvider: 's3', objectKey, actor: otherActor }), null)
  db = await getDatabaseClient()
  assert.equal(await db.generationRun.count(), 1)
  assert.equal(await db.generatedImage.count(), 1)
  assert.equal(await db.modelRequest.count(), 2)
  assert.equal(await db.auditEvent.count(), 2)
  console.log('PASS: image repairs once with real PostgreSQL/MinIO, reports its actual size, and enforces ownership')

  const templateKey = `template/${suffix}.png`
  const templateAsset = await db.asset.create({ data: { organizationId: organization.id, createdById: user.id, role: 'LAYOUT_TEMPLATE', storageProvider: 's3', objectKey: templateKey } })
  const template = await db.layoutTemplate.create({ data: { organizationId: organization.id, assetId: templateAsset.id, createdById: user.id, name: 'Archive access fixture', scope: 'PUBLIC' } })
  assert.ok(await getAccessibleAsset({ storageProvider: 's3', objectKey: templateKey, actor: otherActor }))
  await db.imagePlanVersion.update({ where: { id: plan.imagePlanVersionId }, data: { layoutTemplateId: template.id } })
  await db.layoutTemplate.update({ where: { id: template.id }, data: { archivedAt: new Date() } })
  assert.ok(await getAccessibleAsset({ storageProvider: 's3', objectKey: templateKey, actor }))
  assert.equal(await getAccessibleAsset({ storageProvider: 's3', objectKey: templateKey, actor: otherActor }), null)
  assert.equal(await getAccessibleAsset({ storageProvider: 's3', objectKey: templateKey, actor: { ...actor, organizationId: otherUser.id } }), null)
  console.log('PASS: archived templates remain readable for their bound workspace owner, without opening access to other members')
} finally {
  await disconnectDatabaseClient()
  const cleanup = await Promise.allSettled([
    (async () => {
      if (!bucketCreated) return
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }))
      await s3.send(new DeleteBucketCommand({ Bucket: bucket }))
    })(),
    (async () => {
      if (databaseCreated) await admin.query(`DROP DATABASE "${databaseName}"`)
    })()
  ])
  await admin.end()
  s3.destroy()
  fs.rmSync(directory, { recursive: true, force: true })
  for (const result of cleanup) if (result.status === 'rejected') throw result.reason
  console.log('CLEANUP: removed only the isolated test database, bucket and journal directory')
}
