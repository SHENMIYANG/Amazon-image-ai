import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import generateRoutes from './routes/generate.js'
import uploadRoutes from './routes/upload.js'
import testApiKeyRoutes from './routes/testApiKey.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.BACKEND_PORT || 3001
const NODE_ENV = process.env.NODE_ENV || 'development'

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use('/api/upload', uploadRoutes)
app.use('/api/generate', generateRoutes)
app.use('/api/test-api-key', testApiKeyRoutes)

// Serve uploaded images (development)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

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
