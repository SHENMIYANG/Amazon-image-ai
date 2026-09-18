import express from 'express'
import multer from 'multer'
import path from 'path'
import { hasPermission } from '../services/auth/permissions.js'
import { getDatabaseClient, isPersistenceEnabled } from '../services/persistence/client.js'
import { createUploadedAsset } from '../services/persistence/workbenchRepository.js'
import { writeAsset } from '../services/storage.js'

const router = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, /^(image\/(jpeg|png|webp))$/.test(file.mimetype) && /\.(jpe?g|png|webp)$/i.test(file.originalname))
})

function requireManager(req, res) {
  if (!hasPermission(req.auth?.role, 'template:manage')) {
    res.status(403).json({ success: false, message: '只有管理员可以维护公共模板。' })
    return false
  }
  return true
}

function serialize(template) {
  return {
    id: template.id,
    name: template.name,
    scope: template.scope,
    imageUrl: template.asset?.publicUrl || '',
    createdAt: template.createdAt,
    archivedAt: template.archivedAt || null
  }
}

function templateScope(req) {
  return String(req.query?.scope || req.body?.scope || 'PUBLIC').toUpperCase() === 'PERSONAL'
    ? 'PERSONAL'
    : 'PUBLIC'
}

function canManageTemplate(template, actor) {
  return template.scope === 'PUBLIC'
    ? hasPermission(actor?.role, 'template:manage')
    : template.createdById === actor?.userId
}

async function getDbOrFail(res) {
  const db = isPersistenceEnabled() ? await getDatabaseClient() : null
  if (!db) {
    res.status(503).json({ success: false, message: '公共模板需要 PostgreSQL。' })
    return null
  }
  return db
}

router.get('/', async (req, res, next) => {
  try {
    const db = await getDbOrFail(res)
    if (!db) return
    const scope = templateScope(req)
    const templates = await db.layoutTemplate.findMany({
      where: {
        organizationId: req.auth.organizationId,
        scope,
        archivedAt: null,
        ...(scope === 'PERSONAL' ? { createdById: req.auth.userId } : {})
      },
      include: { asset: true },
      orderBy: { createdAt: 'desc' }
    })
    res.json({ success: true, templates: templates.map((template) => ({ ...serialize(template), canManage: canManageTemplate(template, req.auth) })) })
  } catch (error) {
    next(error)
  }
})

router.post('/', upload.single('image'), async (req, res, next) => {
  try {
    const scope = templateScope(req)
    if (scope === 'PUBLIC' && !requireManager(req, res)) return
    if (!req.file) return res.status(400).json({ success: false, message: '请选择一张模板图片。' })
    const db = await getDbOrFail(res)
    if (!db) return
    const extension = path.extname(req.file.originalname).toLowerCase()
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`
    const stored = await writeAsset({ objectKey: `template/${filename}`, body: req.file.buffer, contentType: req.file.mimetype })
    const asset = await createUploadedAsset({ ...stored, mimeType: req.file.mimetype, byteSize: req.file.size, role: 'LAYOUT_TEMPLATE', actor: req.auth })
    const name = String(req.body?.name || path.basename(req.file.originalname, extension)).trim().slice(0, 80)
    const template = await db.layoutTemplate.create({
      data: { organizationId: req.auth.organizationId, assetId: asset.id, name: name || '未命名模板', scope, createdById: req.auth.userId },
      include: { asset: true }
    })
    res.status(201).json({ success: true, template: { ...serialize(template), canManage: true } })
  } catch (error) {
    next(error)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const db = await getDbOrFail(res)
    if (!db) return
    const name = String(req.body?.name || '').trim().slice(0, 80)
    if (!name) return res.status(400).json({ success: false, message: '模板名称不能为空。' })
    const existing = await db.layoutTemplate.findFirst({ where: { id: req.params.id, organizationId: req.auth.organizationId, archivedAt: null } })
    if (!existing) return res.status(404).json({ success: false, message: '模板不存在。' })
    if (!canManageTemplate(existing, req.auth)) return res.status(403).json({ success: false, message: '你无权修改这个模板。' })
    await db.layoutTemplate.update({ where: { id: existing.id }, data: { name } })
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const db = await getDbOrFail(res)
    if (!db) return
    const existing = await db.layoutTemplate.findFirst({ where: { id: req.params.id, organizationId: req.auth.organizationId, archivedAt: null } })
    if (!existing) return res.status(404).json({ success: false, message: '模板不存在。' })
    if (!canManageTemplate(existing, req.auth)) return res.status(403).json({ success: false, message: '你无权删除这个模板。' })
    await db.layoutTemplate.update({ where: { id: existing.id }, data: { archivedAt: new Date() } })
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError || error.message === 'Unexpected field') return res.status(400).json({ success: false, message: '模板只支持 JPG、PNG、WebP，且不能超过 10MB。' })
  next(error)
})

export default router
