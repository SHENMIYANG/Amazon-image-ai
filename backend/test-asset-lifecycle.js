import assert from 'assert/strict'
import fs from 'fs'
import path from 'path'
import {
  GENERATED_UPLOADS_DIR,
  REFERENCE_UPLOADS_DIR,
  UPLOADS_DIR,
  buildLocalAssetUrl,
  cleanupExpiredUploads,
  ensureUploadsDir,
  getLocalObjectKeyFromUrl,
  resolveUploadPathFromUrl
} from './utils/uploads.js'
import { buildAssetUrl, getAssetReferenceFromUrl } from './services/storage.js'

const testDir = path.join(UPLOADS_DIR, `test-assets-${process.pid}-${Date.now()}`)
const tempFile = path.join(testDir, 'temporary.png')
const generatedFile = path.join(GENERATED_UPLOADS_DIR, `test-generated-${process.pid}-${Date.now()}.png`)
const referenceFile = path.join(REFERENCE_UPLOADS_DIR, `test-reference-${process.pid}-${Date.now()}.png`)

ensureUploadsDir()
fs.mkdirSync(testDir, { recursive: true })
fs.writeFileSync(tempFile, 'temporary')
fs.writeFileSync(generatedFile, 'generated')
fs.writeFileSync(referenceFile, 'reference')
fs.utimesSync(tempFile, new Date(0), new Date(0))

try {
  assert.equal(getLocalObjectKeyFromUrl('/api/assets/local/temp/example.png'), 'temp/example.png')
  assert.equal(getLocalObjectKeyFromUrl('/api/assets/local/generated/example.png'), 'generated/example.png')
  assert.equal(getLocalObjectKeyFromUrl('/api/assets/local/reference/example.png'), 'reference/example.png')
  assert.equal(getLocalObjectKeyFromUrl('/api/assets/local/legacy-example.png'), 'legacy-example.png')
  assert.equal(getLocalObjectKeyFromUrl('/api/assets/local/temp/../secret.png'), '')
  assert.equal(buildLocalAssetUrl('generated/example.png'), '/api/assets/local/generated/example.png')
  assert.equal(buildAssetUrl('s3', 'generated/example.png'), '/api/assets/s3/generated/example.png')
  assert.equal(buildAssetUrl('s3', 'reference/example.png'), '/api/assets/s3/reference/example.png')
  assert.deepEqual(getAssetReferenceFromUrl('/api/assets/s3/temp/example.png'), { storageProvider: 's3', objectKey: 'temp/example.png' })
  assert.equal(getAssetReferenceFromUrl('/api/assets/s3/temp/../secret.png'), null)
  assert.equal(resolveUploadPathFromUrl('/api/assets/local/temp/../secret.png'), '')
  assert.equal(cleanupExpiredUploads(1, testDir), 1)
  assert.equal(fs.existsSync(tempFile), false)
  assert.equal(fs.existsSync(generatedFile), true)
  assert.equal(fs.existsSync(referenceFile), true)
  console.log('asset lifecycle tests passed')
} finally {
  fs.rmSync(testDir, { recursive: true, force: true })
  fs.rmSync(generatedFile, { force: true })
  fs.rmSync(referenceFile, { force: true })
}
