import express from 'express'
import multer from 'multer'
import OpenAI from 'openai'

const router = express.Router()

const MAX_ATTACHMENTS = 8
const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_TEXT_CHARS = 12000

const supportedTextTypes = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json'
])

const supportedTextExtensions = new Set(['.txt', '.md', '.csv', '.json'])
const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_ATTACHMENTS,
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    const extension = getFileExtension(file.originalname)
    const isSupportedText = supportedTextTypes.has(file.mimetype) || supportedTextExtensions.has(extension)
    const isSupportedImage = supportedImageTypes.has(file.mimetype)

    if (!isSupportedText && !isSupportedImage) {
      return cb(new Error('只支持 JPG、PNG、WEBP 图片，以及 TXT、MD、CSV、JSON 文件。'))
    }

    cb(null, true)
  }
})

function parseWorkspaceChatUpload(req, res, next) {
  upload.array('attachments', MAX_ATTACHMENTS)(req, res, (error) => {
    if (!error) {
      next()
      return
    }

    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? '单个附件不能超过 10MB。'
        : error.code === 'LIMIT_FILE_COUNT'
          ? `一次最多上传 ${MAX_ATTACHMENTS} 个附件。`
          : error.message || '附件上传失败。'

    res.status(400).json({
      success: false,
      message
    })
  })
}

function getOpenAIClient() {
  const apiKey = process.env.WORKSPACE_CHAT_API_KEY || process.env.AGENT_API_KEY || process.env.OPENAI_API_KEY
  const baseURL =
    process.env.WORKSPACE_CHAT_BASE_URL ||
    process.env.AGENT_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.openai.com/v1'
  const timeout = Number(process.env.WORKSPACE_CHAT_TIMEOUT_MS || process.env.AGENT_TIMEOUT_MS || 600000)

  if (!apiKey) {
    const error = new Error('后端未配置 WORKSPACE_CHAT_API_KEY、AGENT_API_KEY 或 OPENAI_API_KEY。')
    error.statusCode = 400
    throw error
  }

  return new OpenAI({ apiKey, baseURL, timeout })
}

function getFileExtension(filename = '') {
  const match = String(filename || '').toLowerCase().match(/\.[a-z0-9]+$/)
  return match ? match[0] : ''
}

function safeJsonParse(value, fallback) {
  if (typeof value !== 'string') return value ?? fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function clampText(value, max = MAX_TEXT_CHARS) {
  const text = String(value || '').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n[内容过长，已截取前 ${max} 字符]`
}

function normalizeHistory(history = []) {
  if (!Array.isArray(history)) return []
  return history
    .slice(-16)
    .map((message) => ({
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      content: clampText(message?.content, 4000)
    }))
    .filter((message) => message.content)
}

function buildAttachmentParts(files = []) {
  const imageParts = []
  const textBlocks = []

  for (const file of files) {
    if (supportedImageTypes.has(file.mimetype)) {
      const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
      imageParts.push({
        type: 'image_url',
        image_url: { url: dataUrl }
      })
      continue
    }

    const text = clampText(file.buffer.toString('utf8'), MAX_TEXT_CHARS)
    textBlocks.push(`【上传文件：${file.originalname}】\n${text}`)
  }

  return { imageParts, textBlocks }
}

function buildSystemPrompt() {
  return [
    '你是亚马逊产品分析助手。',
    '你的角色是：亚马逊运营 + 电商视觉策划 + 产品资料分析。',
    '你只做产品分析、卖点梳理、受众分析、竞品/参考图理解、图片表达建议和文案建议。',
    '不要生成图片，不要替用户调用生图接口，不要改写工作台表单，不要替代现有“生成策略”功能。',
    '分析图片时，先说看到了什么，再说它能证明什么卖点。不要凭空添加材质、认证、数量、规格或绝对性 claim。',
    '做图片建议时，遵守这条规则：图片先证明卖点，文字只补充结论、机制、标签或边界。',
    '场景图建议必须回答：谁在用、在哪里用、做什么动作、解决什么需求、用户看到什么结果。',
    '回答要用中文，短句，直接给可执行建议。'
  ].join('\n')
}

router.post('/', parseWorkspaceChatUpload, async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim()
    if (!message) {
      return res.status(400).json({
        success: false,
        message: '请输入要分析的问题。'
      })
    }

    const history = normalizeHistory(safeJsonParse(req.body?.history, []))
    const { imageParts, textBlocks } = buildAttachmentParts(req.files || [])

    const userText = clampText(
      [
        textBlocks.join('\n\n'),
        `【用户问题】\n${message}`
      ].filter(Boolean).join('\n\n'),
      26000
    )

    const openai = getOpenAIClient()
    const model = process.env.WORKSPACE_CHAT_MODEL || process.env.AGENT_MODEL || 'gpt-4o-mini'

    const messages = [
      { role: 'system', content: buildSystemPrompt() },
      ...history,
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          ...imageParts
        ]
      }
    ]

    const completion = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0.35
    })

    const reply = completion.choices?.[0]?.message?.content || ''

    res.json({
      success: true,
      reply: reply.trim(),
      usage: completion.usage || null
    })
  } catch (error) {
    console.error('Workspace chat error:', error.response?.data || error.message)
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || '产品分析对话失败'
    })
  }
})

export default router
