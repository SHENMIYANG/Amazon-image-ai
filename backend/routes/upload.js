import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

const router = express.Router()

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
})

// 文件过滤（只允许图片）
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
  const mimetype = allowedTypes.test(file.mimetype)
  
  if (mimetype && extname) {
    return cb(null, true)
  } else {
    cb(new Error('只允许上传图片文件 (jpeg, jpg, png, gif, webp)'))
  }
}

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB 限制
  },
  fileFilter: fileFilter
})

// 上传接口
router.post('/', upload.array('images', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No files uploaded',
        message: '请至少上传一张图片'
      })
    }

    // 返回图片 URL（本地路径，开发环境）
    const imageUrls = req.files.map(file => `/uploads/${file.filename}`)

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

// 错误处理中间件
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: '图片大小不能超过 10MB'
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
