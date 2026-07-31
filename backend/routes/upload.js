import express from 'express'
import multer from 'multer'
import path from 'path'
import { ensureUploadsDir } from '../utils/uploads.js'

const router = express.Router()
const MAX_UPLOAD_FILES = 8

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ensureUploadsDir())
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
})

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
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: MAX_UPLOAD_FILES
  },
  fileFilter
})

router.post('/', upload.array('images', MAX_UPLOAD_FILES), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No files uploaded',
        message: '请至少上传一张图片'
      })
    }

    const imageUrls = req.files.map((file) => `/uploads/${file.filename}`)

    res.json({
      success: true,
      count: req.files.length,
      images: imageUrls.map((url, index) => ({
        url,
        filename: req.files[index].filename,
        size: req.files[index].size,
        mimetype: req.files[index].mimetype
      }))
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
