import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const UPLOADS_DIR = path.join(__dirname, '..', 'uploads')
export const TEMP_UPLOADS_DIR = path.join(UPLOADS_DIR, 'temp')
export const GENERATED_UPLOADS_DIR = path.join(UPLOADS_DIR, 'generated')

export function ensureUploadsDir() {
  for (const directory of [UPLOADS_DIR, TEMP_UPLOADS_DIR, GENERATED_UPLOADS_DIR]) {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true })
    }
  }

  return UPLOADS_DIR
}

export function getLocalObjectKeyFromUrl(imageUrl = '') {
  const rawUrl = String(imageUrl || '').trim()
  const assetMatch = rawUrl.match(/^\/?api\/assets\/local\/((?:temp|generated)\/[^/\\]+|[^/\\]+)$/)
  if (assetMatch) return assetMatch[1]

  const legacyMatch = rawUrl.match(/^\/?uploads\/([^/\\]+)$/)
  return legacyMatch ? legacyMatch[1] : ''
}

export function buildLocalAssetUrl(objectKey = '') {
  const normalizedKey = String(objectKey || '').replace(/\\/g, '/').trim()
  return normalizedKey ? `/api/assets/local/${normalizedKey}` : ''
}

export function resolveUploadPathFromUrl(imageUrl = '') {
  const objectKey = getLocalObjectKeyFromUrl(imageUrl)
  if (!objectKey) return ''

  const uploadsRoot = path.resolve(UPLOADS_DIR)
  const resolvedPath = path.resolve(uploadsRoot, objectKey)
  return resolvedPath.startsWith(`${uploadsRoot}${path.sep}`) ? resolvedPath : ''
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function isTransientFileReadError(error) {
  const code = String(error?.code || '').toUpperCase()
  return ['ENOENT', 'EBUSY', 'EPERM'].includes(code)
}

export async function readUploadFileBufferWithRetry(filePath, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 3))
  const delayMs = Math.max(0, Number(options.delayMs || 180))

  let lastError = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fs.promises.readFile(filePath)
    } catch (error) {
      lastError = error
      const shouldRetry = attempt < attempts && isTransientFileReadError(error)
      if (!shouldRetry) throw error
      await wait(delayMs)
    }
  }

  throw lastError || new Error(`Failed to read upload file: ${filePath}`)
}

export function cleanupExpiredUploads(maxAgeMs = 24 * 60 * 60 * 1000, uploadsDir = TEMP_UPLOADS_DIR) {
  ensureUploadsDir()
  if (!fs.existsSync(uploadsDir)) return 0
  const cutoff = Date.now() - maxAgeMs
  let deletedCount = 0

  for (const entry of fs.readdirSync(uploadsDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue

    const filePath = path.join(uploadsDir, entry.name)
    try {
      const stats = fs.statSync(filePath)
      if (stats.mtimeMs < cutoff) {
        fs.unlinkSync(filePath)
        deletedCount += 1
      }
    } catch (error) {
      console.warn(`清理上传文件失败：${entry.name}`, error.message)
    }
  }

  return deletedCount
}
