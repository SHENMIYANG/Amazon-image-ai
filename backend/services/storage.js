import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { UPLOADS_DIR, ensureUploadsDir } from '../utils/uploads.js'

let client = null

function normalizeObjectKey(objectKey = '') {
  const key = String(objectKey || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!key || key.includes('..') || !/^(temp|generated)\/[A-Za-z0-9._-]+$/.test(key)) return ''
  return key
}

export function getStorageProvider() {
  return String(process.env.STORAGE_S3_BUCKET || '').trim() ? 's3' : 'local'
}

export function buildAssetUrl(storageProvider = getStorageProvider(), objectKey = '') {
  const key = normalizeObjectKey(objectKey)
  return key ? `/api/assets/${storageProvider}/${key}` : ''
}

export function getAssetReferenceFromUrl(url = '') {
  const match = String(url || '').trim().match(/^\/?api\/assets\/(local|s3)\/((?:temp|generated)\/[A-Za-z0-9._-]+)$/)
  if (match) return { storageProvider: match[1], objectKey: match[2] }
  const legacy = String(url || '').trim().match(/^\/?uploads\/((?:temp|generated)\/[A-Za-z0-9._-]+)$/)
  return legacy ? { storageProvider: 'local', objectKey: legacy[1] } : null
}

function getS3Client() {
  const bucket = String(process.env.STORAGE_S3_BUCKET || '').trim()
  const region = String(process.env.STORAGE_S3_REGION || 'us-east-1').trim()
  const endpoint = String(process.env.STORAGE_S3_ENDPOINT || '').trim()
  const accessKeyId = String(process.env.STORAGE_S3_ACCESS_KEY || '').trim()
  const secretAccessKey = String(process.env.STORAGE_S3_SECRET_KEY || '').trim()
  if (!bucket || !accessKeyId || !secretAccessKey) throw new Error('S3 存储未配置完整：需要 STORAGE_S3_BUCKET、STORAGE_S3_ACCESS_KEY 和 STORAGE_S3_SECRET_KEY。')
  if (!client) {
    client = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: process.env.STORAGE_S3_FORCE_PATH_STYLE !== 'false' } : {}),
      credentials: { accessKeyId, secretAccessKey }
    })
  }
  return { client, bucket }
}

export async function writeAsset({ objectKey, body, contentType = 'application/octet-stream' }) {
  const key = normalizeObjectKey(objectKey)
  if (!key) throw new Error('无效的存储对象路径。')
  const storageProvider = getStorageProvider()
  if (storageProvider === 'local') {
    ensureUploadsDir()
    const filePath = path.join(UPLOADS_DIR, key)
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    await fs.promises.writeFile(filePath, body)
  } else {
    const s3 = getS3Client()
    await s3.client.send(new PutObjectCommand({ Bucket: s3.bucket, Key: key, Body: body, ContentType: contentType }))
  }
  return { storageProvider, objectKey: key, url: buildAssetUrl(storageProvider, key) }
}

export async function readAssetBuffer(storageProvider, objectKey) {
  const key = normalizeObjectKey(objectKey)
  if (!key) throw new Error('无效的存储对象路径。')
  if (storageProvider === 'local') return await fs.promises.readFile(path.join(UPLOADS_DIR, key))
  if (storageProvider !== 's3') throw new Error('不支持的存储提供方。')
  const s3 = getS3Client()
  const result = await s3.client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: key }))
  return Buffer.from(await result.Body.transformToByteArray())
}

export async function readAssetUrlBuffer(url) {
  const reference = getAssetReferenceFromUrl(url)
  if (!reference) throw new Error('图片地址无效。')
  return await readAssetBuffer(reference.storageProvider, reference.objectKey)
}

export async function materializeAssetUrls(urls = []) {
  const paths = []
  const temporaryPaths = []
  try {
    for (const url of urls) {
      const reference = getAssetReferenceFromUrl(url)
      if (!reference) throw new Error('参考图片地址无效，请重新上传。')
      if (reference.storageProvider === 'local') {
        paths.push(path.join(UPLOADS_DIR, reference.objectKey))
        continue
      }
      const extension = path.extname(reference.objectKey) || '.png'
      const temporaryPath = path.join(UPLOADS_DIR, 'work', `${crypto.randomUUID()}${extension}`)
      await fs.promises.mkdir(path.dirname(temporaryPath), { recursive: true })
      await fs.promises.writeFile(temporaryPath, await readAssetBuffer(reference.storageProvider, reference.objectKey))
      paths.push(temporaryPath)
      temporaryPaths.push(temporaryPath)
    }
    return { paths, cleanup: async () => await Promise.all(temporaryPaths.map((filePath) => fs.promises.rm(filePath, { force: true }))) }
  } catch (error) {
    await Promise.all(temporaryPaths.map((filePath) => fs.promises.rm(filePath, { force: true })))
    throw error
  }
}
