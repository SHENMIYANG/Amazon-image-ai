import express from 'express'
import multer from 'multer'
import path from 'path'
import { createUploadedAsset } from '../services/persistence/workbenchRepository.js'
import { writeAsset } from '../services/storage.js'

const router = express.Router()
const MAX_UPLOAD_FILES = 8

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
  const mimetype = allowedTypes.test(file.mimetype)

  if (mimetype && extname) {
    return cb(null, true)
  }

  cb(new Error('只允许上传图片文件（jpeg, jpg, png, gif, webp）'))
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: MAX_UPLOAD_FILES
  },
  fileFilter
})

router.post('/', upload.array('images', MAX_UPLOAD_FILES), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No files uploaded',
        message: '请至少上传一张图片'
      })
    }

    const images = await Promise.all(req.files.map(async (file) => {
      const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`
      const stored = await writeAsset({ objectKey: `temp/${filename}`, body: file.buffer, contentType: file.mimetype })
      const asset = await createUploadedAsset({
        ...stored,
        mimeType: file.mimetype,
        byteSize: file.size,
        role: req.query?.kind === 'feedback' ? 'FEEDBACK_REFERENCE' : 'PRODUCT_REFERENCE',
        actor: req.auth
      })
      const url = asset?.publicUrl || stored.url

      return {
        url,
        filename,
        size: file.size,
        mimetype: file.mimetype,
        assetId: asset?.id || null,
        objectKey: stored.objectKey
      }
    }))

    res.json({
      success: true,
      count: req.files.length,
      images
    })
  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({
      error: 'Upload failed',
      message: error.message
    })
  }
})

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: '图片大小不能超过 10MB'
      })
    }
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        error: 'Too many files',
        message: `最多上传 ${MAX_UPLOAD_FILES} 张图片`
      })
    }
    return res.status(400).json({
      error: 'Multer error',
      message: error.message
    })
  }
  next(error)
})

export default router
