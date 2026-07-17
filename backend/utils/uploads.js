import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const UPLOADS_DIR = path.join(__dirname, '..', 'uploads')

export function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  }

  return UPLOADS_DIR
}

export function resolveUploadPathFromUrl(imageUrl = '') {
  const rawUrl = String(imageUrl || '').trim()
  if (!/^\/?uploads\/[^/\\]+$/.test(rawUrl)) return ''

  const filename = rawUrl.replace(/^\/?uploads\//, '')
  if (!filename || path.basename(filename) !== filename) return ''

  const uploadsRoot = path.resolve(UPLOADS_DIR)
  const resolvedPath = path.resolve(uploadsRoot, filename)
  return path.dirname(resolvedPath) === uploadsRoot ? resolvedPath : ''
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

export function cleanupExpiredUploads(maxAgeMs = 24 * 60 * 60 * 1000) {
  const uploadsDir = ensureUploadsDir()
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
