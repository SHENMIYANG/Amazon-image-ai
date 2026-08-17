import express from 'express'
import OpenAI from 'openai'

const router = express.Router()

function getOpenAIClient() {
  const apiKey = process.env.AGENT_API_KEY || process.env.OPENAI_API_KEY
  const baseURL = process.env.AGENT_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const timeout = Number(process.env.AGENT_TIMEOUT_MS || 600000)

  if (!apiKey) {
    const error = new Error('后端未配置 AGENT_API_KEY 或 OPENAI_API_KEY，无法使用图片反馈对话。')
    error.statusCode = 400
    throw error
  }

  return new OpenAI({ apiKey, baseURL, timeout })
}

function safeJsonParse(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function stringifyCompact(value, fallback = '') {
  if (!value) return fallback
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return fallback
  }
}

function normalizeMessages(messages = []) {
  if (!Array.isArray(messages)) return []
  return messages
    .slice(-12)
    .map((message) => ({
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      content: String(message?.content || '').slice(0, 3000)
    }))
    .filter((message) => message.content.trim())
}

function normalizeRevision(revision = {}) {
  return {
    strategyContent: String(revision.strategyContent || '').trim(),
    promptEn: String(revision.promptEn || '').trim(),
    executionRules: Array.isArray(revision.executionRules)
      ? revision.executionRules.map((rule) => String(rule || '').trim()).filter(Boolean)
      : []
  }
}

function getEffectiveRevision(revision = {}, payload = {}) {
  const currentRevision = payload.currentRevision || {}
  const imagePlan = payload.imagePlan || {}
  const generatedImage = payload.generatedImage || {}

  return {
    strategyContent:
      revision.strategyContent || currentRevision.strategyContent || imagePlan.strategyContent || generatedImage.strategyContent || '',
    promptEn:
      revision.promptEn || currentRevision.promptEn || imagePlan.promptEn || generatedImage.promptEn || '',
    executionRules:
      revision.executionRules.length > 0
        ? revision.executionRules
        : currentRevision.executionRules || imagePlan.executionRules || generatedImage.executionRules || []
  }
}

function buildSystemPrompt() {
  return [
    '你是当前单张亚马逊商品图的反馈修图助手，兼具亚马逊运营、电商视觉策划和英文生图执行稿编辑能力。',
    '工作边界：只处理当前这张图；不重新规划整套图；不改变产品事实；不新增未确认的结构、配件、材质、认证或绝对性 claim。',
    '输入依据：产品真相、当前中文策略、英文执行稿、执行保护、上次最终 prompt、用户反馈，以及本图对话里临时上传的参考图 URL。临时参考图只服务当前单张重生，不得升级成全局主图。',
    '意图判断：用户讨论问题或要求调整时返回 intent="discuss"；用户明确要求生成、重做、重新生成、按当前方案出图、可以了出图时返回 intent="generate_ready"。如果同一句同时包含修改和生成，先吸收修改再返回 generate_ready。',
    '回复方式：先用中文说明你理解的问题，再给出当前图的修图方向。你可以更新 strategyContent、promptEn、executionRules；promptEn 必须忠实于中文策略和用户反馈，只做受控英文视觉转换，不重新策划。',
    '生成规则：你自己不要生成图片。需要出图时只返回 generate_ready，前端会用最新 revision 和本图临时参考图调用真实生图接口。',
    '只返回 JSON，不要 Markdown。格式：{"intent":"discuss|generate_ready","reply":"中文回复","revision":{"strategyContent":"中文导演脚本","promptEn":"英文执行稿","executionRules":["硬性执行保护"]},"finalInstruction":"仅 generate_ready 时填写生图指令摘要，否则为空"}'
  ].join('\n')
}

function buildContextPrompt(payload) {
  const productBlueprint = payload.productBlueprint || payload.productTruth || {}
  const imagePlan = payload.imagePlan || {}
  const generatedImage = payload.generatedImage || {}
  const promptUsed = payload.promptUsed || generatedImage.promptUsed || ''
  const currentRevision = payload.currentRevision || {}
  const feedbackReferenceImages = Array.isArray(payload.feedbackReferenceImages)
    ? payload.feedbackReferenceImages
    : []

  return [
    '【单图信息】',
    `名称：${imagePlan.name || generatedImage.name || '未命名图片'}`,
    `类型：${imagePlan.type || imagePlan.taskType || generatedImage.type || '未知'}`,
    `复杂度：${payload.complexity || 'L2'}`,
    '',
    '【产品真相】',
    stringifyCompact(productBlueprint, '无'),
    '',
    '【中文策略】',
    currentRevision.strategyContent || imagePlan.strategyContent || generatedImage.strategyContent || '无',
    '',
    '【英文执行稿】',
    currentRevision.promptEn || imagePlan.promptEn || generatedImage.promptEn || '无',
    '',
    '【执行保护】',
    stringifyCompact(currentRevision.executionRules || imagePlan.executionRules || generatedImage.executionRules || [], '[]'),
    '',
    '【上次最终 prompt】',
    promptUsed || '无',
    '',
    '【本图对话临时参考图】',
    stringifyCompact(feedbackReferenceImages, '[]'),
    '',
    '【当前图片地址】',
    generatedImage.imageUrl || '无'
  ].join('\n')
}

router.post('/chat', async (req, res) => {
  try {
    const userMessage = String(req.body?.userMessage || '').trim()
    if (!userMessage) {
      return res.status(400).json({
        success: false,
        message: 'userMessage is required'
      })
    }

    const openai = getOpenAIClient()
    const model = process.env.IMAGE_FEEDBACK_MODEL || process.env.AGENT_MODEL || 'gpt-4o-mini'
    const messages = [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildContextPrompt(req.body || {}) },
      ...normalizeMessages(req.body?.messages),
      { role: 'user', content: userMessage }
    ]

    const completion = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0.25
    })

    const content = completion.choices?.[0]?.message?.content || ''
    const parsed = safeJsonParse(content)
    if (!parsed) {
      return res.status(502).json({
        success: false,
        message: 'AI 返回内容不是有效 JSON',
        raw: content
      })
    }

    const revision = normalizeRevision(parsed.revision)
    const intent = parsed.intent === 'generate_ready' ? 'generate_ready' : 'discuss'
    const effectiveRevision = getEffectiveRevision(revision, req.body || {})

    if (intent === 'generate_ready' && (!effectiveRevision.strategyContent || !effectiveRevision.promptEn)) {
      return res.status(422).json({
        success: false,
        message: '图片反馈没有得到完整的中文策略或英文执行稿，请先让 AI 补全本图修改方案。'
      })
    }

    res.json({
      success: true,
      data: {
        intent,
        reply: String(parsed.reply || '').trim(),
        revision,
        finalInstruction: String(parsed.finalInstruction || '').trim()
      }
    })
  } catch (error) {
    console.error('Image feedback chat error:', error.response?.data || error.message)
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || '图片反馈对话失败'
    })
  }
})

export default router
