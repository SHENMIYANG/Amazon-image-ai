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

function buildSystemPrompt() {
  return [
    '你是亚马逊商品图反馈修图助手，角色是：亚马逊运营 + 电商视觉策划 + 英文生图执行稿编辑。',
    '你只服务当前这一张图片，不要重新规划整套图，不要污染其它产品或其它图片。',
    '你要根据当前图片的产品真相、中文策略、英文执行稿、执行保护、最终 prompt，以及用户反馈进行真实分析。',
    '你需要智能识别用户意图：',
    '1. 如果用户在讨论问题、指出哪里不对、要求调整方向，返回 intent="discuss"。',
    '2. 如果用户明确要求生成、重做、重新生成、按当前方案出图、可以了出图、没问题生成图片，返回 intent="generate_ready"。',
    '3. 如果用户一句话里同时提出修改和生成，你必须先吸收修改，再返回 intent="generate_ready"。',
    '当用户指出问题时，先说明你理解的问题，再给出你会如何修改当前图的导演脚本。',
    '你可以更新 strategyContent、promptEn、executionRules，但不能改变产品事实，不能新增未经确认的产品结构、配件、材质、认证或绝对性 claim。',
    'promptEn 是受控英文视觉执行稿：必须忠实于中文策略和用户反馈，可以转换成更适合图像模型理解的英文视觉语言，但不能重新策划。',
    '如果用户要求生成，你不要自己生成图片，只返回 generate_ready。前端会用你返回的最新 revision 调用真实生图接口。',
    '必须只返回 JSON，不要输出 Markdown 代码块。',
    'JSON 格式：{"intent":"discuss|generate_ready","reply":"中文回复","revision":{"strategyContent":"中文导演脚本","promptEn":"英文执行稿","executionRules":["硬性执行保护"]},"finalInstruction":"仅在 generate_ready 时给出生图指令摘要，否则为空"}'
  ].join('\n')
}

function buildContextPrompt(payload) {
  const productBlueprint = payload.productBlueprint || payload.productTruth || {}
  const imagePlan = payload.imagePlan || {}
  const generatedImage = payload.generatedImage || {}
  const promptUsed = payload.promptUsed || generatedImage.promptUsed || ''
  const currentRevision = payload.currentRevision || {}

  return [
    '【当前单图上下文】',
    `图片名称：${imagePlan.name || generatedImage.name || '未命名图片'}`,
    `图片类型：${imagePlan.type || imagePlan.taskType || generatedImage.type || '未知'}`,
    `复杂度：${payload.complexity || 'L2'}`,
    '',
    '【产品真相 / Product Blueprint】',
    stringifyCompact(productBlueprint, '无'),
    '',
    '【当前中文策略 strategyContent】',
    currentRevision.strategyContent || imagePlan.strategyContent || generatedImage.strategyContent || '无',
    '',
    '【当前英文执行稿 promptEn】',
    currentRevision.promptEn || imagePlan.promptEn || generatedImage.promptEn || '无',
    '',
    '【当前执行保护 executionRules】',
    stringifyCompact(currentRevision.executionRules || imagePlan.executionRules || generatedImage.executionRules || [], '[]'),
    '',
    '【上次最终生图 Prompt / promptUsed】',
    promptUsed || '无',
    '',
    '【当前图片地址，仅作上下文标识】',
    generatedImage.imageUrl || '无',
    '',
    '请基于以上上下文和用户最新反馈，进行单图修图对话，并智能判断是否需要触发真实生图。'
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

    const revision = parsed.revision || {}
    res.json({
      success: true,
      data: {
        intent: parsed.intent === 'generate_ready' ? 'generate_ready' : 'discuss',
        reply: String(parsed.reply || '').trim(),
        revision: {
          strategyContent: String(revision.strategyContent || '').trim(),
          promptEn: String(revision.promptEn || '').trim(),
          executionRules: Array.isArray(revision.executionRules)
            ? revision.executionRules.map((rule) => String(rule || '').trim()).filter(Boolean)
            : []
        },
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
