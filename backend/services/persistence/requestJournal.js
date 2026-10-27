import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { UPLOADS_DIR } from '../../utils/uploads.js'

const processToken = crypto.randomUUID()

function journalDirectory() {
  return process.env.REQUEST_JOURNAL_DIR || path.join(UPLOADS_DIR, 'recovery')
}

function journalPath(kind, requestId) {
  if (!['strategy', 'generation'].includes(kind) || !/^[A-Za-z0-9_-]{12,100}$/.test(requestId)) {
    throw Object.assign(new Error('无效的任务请求编号。'), { statusCode: 400 })
  }
  return path.join(journalDirectory(), `${kind}-${requestId}.json`)
}

function durableWrite(filePath, value, flags) {
  const fd = fs.openSync(filePath, flags, 0o600)
  try {
    fs.writeFileSync(fd, JSON.stringify(value))
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
}

function syncDirectory() {
  if (process.platform === 'win32') return
  const fd = fs.openSync(journalDirectory(), 'r')
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}

export function readRequest(kind, requestId, actor) {
  let entry
  try {
    entry = JSON.parse(fs.readFileSync(journalPath(kind, requestId), 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
  if ((entry.actor?.userId || null) !== (actor?.userId || null) ||
      (entry.actor?.organizationId || null) !== (actor?.organizationId || null)) return null
  if (entry.status === 'RUNNING' && entry.processToken !== processToken) {
    return { ...entry, status: 'UNKNOWN', message: '服务重启前的模型请求结果尚未确认，请核对记录，勿重复提交。' }
  }
  return entry
}

export function claimRequest(kind, requestId, actor, input) {
  fs.mkdirSync(journalDirectory(), { recursive: true, mode: 0o700 })
  const inputHash = crypto.createHash('sha256').update(JSON.stringify(input ?? {})).digest('hex')
  const entry = {
    kind, requestId, inputHash, processToken, status: 'RUNNING',
    actor: actor ? { userId: actor.userId, organizationId: actor.organizationId, role: actor.role } : null,
    createdAt: Date.now(), updatedAt: Date.now()
  }
  try {
    durableWrite(journalPath(kind, requestId), entry, 'wx')
    syncDirectory()
    return { entry, existing: false }
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const previous = readRequest(kind, requestId, actor)
    if (!previous || previous.inputHash !== inputHash) {
      throw Object.assign(new Error('该请求编号已使用，不能用于另一个任务。'), { statusCode: 409 })
    }
    return { entry: previous, existing: true }
  }
}

export function updateRequest(entry, patch) {
  const next = { ...entry, ...patch, updatedAt: Date.now() }
  const target = journalPath(entry.kind, entry.requestId)
  const temporary = `${target}.${crypto.randomUUID()}.tmp`
  try {
    durableWrite(temporary, next, 'wx')
    fs.renameSync(temporary, target)
    syncDirectory()
  } finally {
    fs.rmSync(temporary, { force: true })
  }
  return next
}

export function failRequest(entry, message) {
  if (!entry) return
  try {
    const current = readRequest(entry.kind, entry.requestId, entry.actor)
    if (current?.status === 'RUNNING') updateRequest(current, { status: 'FAILED', message })
  } catch (error) {
    console.error('[recovery] cannot finalize request', { requestId: entry.requestId, message: error.message })
  }
}

export function pendingRequests() {
  fs.mkdirSync(journalDirectory(), { recursive: true, mode: 0o700 })
  const pending = []
  for (const file of fs.readdirSync(journalDirectory())) {
    if (!/^(strategy|generation)-[A-Za-z0-9_-]{12,100}\.json$/.test(file)) continue
    const filePath = path.join(journalDirectory(), file)
    try {
      const entry = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      if (entry.pendingPersistence) pending.push(entry)
      // 未确认和待补存的结果不自动删除。
      else if (entry.status !== 'RUNNING' && Date.now() - entry.updatedAt > 7 * 86400000) fs.unlinkSync(filePath)
    } catch (error) {
      console.error('[recovery] cannot read journal', { file, message: error.message })
    }
  }
  return pending
}
