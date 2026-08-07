import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import generateRoutes from './routes/generate.js'
import uploadRoutes from './routes/upload.js'
import testApiKeyRoutes from './routes/testApiKey.js'
import agentAnalyzeRoutes from './routes/agent-analyze.js'
import promptPreviewRoutes from './routes/prompt-preview.js'
import imageFeedbackRoutes from './routes/image-feedback.js'
import workspaceChatRoutes from './routes/workspace-chat.js'
import { cleanupExpiredUploads, ensureUploadsDir, UPLOADS_DIR } from './utils/uploads.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.BACKEND_PORT || 3001
const NODE_ENV = process.env.NODE_ENV || 'development'
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '4mb'

// Middleware
if (NODE_ENV !== 'production') {
  app.use(cors())
} else if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN }))
}
app.use(express.json({ limit: JSON_BODY_LIMIT }))

// Routes
app.use('/api/upload', uploadRoutes)
app.use('/api/generate', generateRoutes)
app.use('/api/test-api-key', testApiKeyRoutes)
app.use('/api/agent-analyze', agentAnalyzeRoutes)
app.use('/api/prompt-preview', promptPreviewRoutes)
app.use('/api/image-feedback', imageFeedbackRoutes)
app.use('/api/workspace-chat', workspaceChatRoutes)

// Serve uploaded images (development)
ensureUploadsDir()
app.use('/uploads', express.static(UPLOADS_DIR))

const uploadRetentionHours = Math.max(1, Number(process.env.UPLOAD_RETENTION_HOURS || 24))
const cleanupUploads = () => {
  const deletedCount = cleanupExpiredUploads(uploadRetentionHours * 60 * 60 * 1000)
  if (deletedCount > 0) {
    console.log(`已清理 ${deletedCount} 个过期上传文件`)
  }
}

cleanupUploads()
setInterval(cleanupUploads, 6 * 60 * 60 * 1000).unref()

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Production: Serve static files from frontend build
if (NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '..', 'frontend', 'dist')
  app.use(express.static(frontendPath))
  
  // Handle React Router - return index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'))
  })
}

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err.message)
  res.status(500).json({ 
    error: 'Server error', 
    message: err.message 
  })
})

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`)
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`)
  console.log(`📁 Upload directory: http://localhost:${PORT}/uploads`)
  if (NODE_ENV === 'production') {
    console.log(`🌐 Frontend: http://localhost:${PORT}`)
  }
})
