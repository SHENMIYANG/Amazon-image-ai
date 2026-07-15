import express from 'express'
import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'
import { STRATEGY_LIBRARY } from '../strategy-library.js'

const router = express.Router()

const IMAGE_TASK_LIBRARY = {
  main: {
    label: '主图',
    defaultName: '白底主图',
    purpose: '符合亚马逊主图规范并完整展示产品',
    guidance: '纯白背景、完整展示产品全貌、不裁切主体、无文字、无 Logo、无水印、无无关道具'
  },
  feature: {
    label: '卖点图',
    defaultName: '核心卖点图',
    purpose: '突出核心卖点和转化理由',
    guidance: '围绕功能、利益点、优势表达，可配轻量标题、图标、局部特写，但产品主体清晰'
  },
  scenario: {
    label: '场景图',
    defaultName: '场景应用图',
    purpose: '展示真实场景和使用效果',
    guidance: '让产品自然融入真实环境，突出使用氛围、适配空间和代入感'
  },
  detail: {
    label: '细节图',
    defaultName: '细节特写图',
    purpose: '放大展示材质、结构、做工与质感',
    guidance: '强调纹理、连接结构、表面处理、灯光质感、防水耐用等真实细节'
  },
  dimensions: {
    label: '尺寸图',
    defaultName: '尺寸参数图',
    purpose: '帮助买家快速理解大小和结构',
    guidance: '清晰展示尺寸、容量、比例、参照物、安装位置或结构关系'
  },
  steps: {
    label: '步骤图',
    defaultName: '使用步骤图',
    purpose: '说明使用方式、安装或操作流程',
    guidance: '分步清晰，不要信息过载，优先让买家一眼看懂怎么用'
  },
  comparison: {
    label: '对比图',
    defaultName: '对比说明图',
    purpose: '强化产品优势',
    guidance: '可做竞品对比、前后对比、效果对比，但不能虚构不存在的能力'
  },
  package: {
    label: '包装图',
    defaultName: '包装清单图',
    purpose: '说明包装内容和套装信息',
    guidance: '只展示已确认的包装、配件和套装内容，不要杜撰配件'
  },
  summary: {
    label: '总结图',
    defaultName: '补充总结图',
    purpose: '补充综合价值和收尾购买理由',
    guidance: '可用于礼品属性、信任感、总结卖点、氛围收尾等强化表达'
  }
}

function getDefaultSelectedImageTasks() {
  return [
    { type: 'main', count: 1 },
    { type: 'feature', count: 2 },
    { type: 'scenario', count: 1 },
    { type: 'detail', count: 1 },
    { type: 'dimensions', count: 1 },
    { type: 'summary', count: 1 }
  ]
}

function normalizeSelectedImageTasks(selectedImageTasks = []) {
  const source = Array.isArray(selectedImageTasks) && selectedImageTasks.length > 0
    ? selectedImageTasks
    : getDefaultSelectedImageTasks()

  return source
    .map((item) => {
      const type = item?.type
      const count = Math.max(0, Math.min(6, Number(item?.count || 0)))
      if (!IMAGE_TASK_LIBRARY[type] || count === 0) return null
      return { type, count }
    })
    .filter(Boolean)
}

function expandSelectedImageTasks(selectedImageTasks = []) {
  const normalized = normalizeSelectedImageTasks(selectedImageTasks)
  const expanded = []

  normalized.forEach((item) => {
    const meta = IMAGE_TASK_LIBRARY[item.type]
    for (let index = 1; index <= item.count; index += 1) {
      expanded.push({
        taskType: item.type,
        taskKey: `${item.type}-${index}`,
        name: item.count > 1 ? `${meta.defaultName} ${index}` : meta.defaultName,
        purpose: meta.purpose,
        guidance: meta.guidance
      })
    }
  })

  return expanded
}

function getMarketplaceLanguage(marketplace = 'UK') {
  const languageMap = {
    US: 'English',
    UK: 'English',
    CA: 'English',
    AU: 'English',
    DE: 'German',
    FR: 'French',
    IT: 'Italian',
    ES: 'Spanish',
    JP: 'Japanese',
    NL: 'Dutch',
    SE: 'Swedish',
    PL: 'Polish'
  }

  return languageMap[marketplace] || 'English'
}

function getTargetImageLanguage({ marketplace = 'UK', imageLanguage } = {}) {
  return imageLanguage || getMarketplaceLanguage(marketplace)
}

function getFontStyleLabel(fontPreference = 'auto') {
  const fontMap = {
    auto: '自动匹配字体风格',
    'geometric-sans': '几何无衬线字体',
    'bold-sans': '硬朗无衬线字体',
    'elegant-serif': '优雅衬线字体',
    'rounded-playful': '圆润亲和字体',
    'handwritten-playful': '手写趣味字体'
  }

  return fontMap[fontPreference] || '自动匹配字体风格'
}

function getBrandColorLabel(brandColorMode, brandColor) {
  if (brandColorMode === 'manual' && brandColor) {
    return `手动指定主色 ${brandColor}`
  }

  return '智能主色（根据产品图片、材质和场景自动判断）'
}

function buildImageContentParts(referenceImages = []) {
  return referenceImages
    .slice(0, 3)
    .map((imageUrl) => {
      const imagePath = path.join(process.cwd(), imageUrl.replace('/uploads/', 'uploads/'))

      if (!fs.existsSync(imagePath)) {
        return null
      }

      const ext = path.extname(imagePath).toLowerCase()
      const mimeType =
        ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'

      return {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${fs.readFileSync(imagePath).toString('base64')}`
        }
      }
    })
    .filter(Boolean)
}

function recommendStrategy(productName, category, sellingPoints) {
  const name = String(productName || '').toLowerCase()
  const cat = String(category || '').toLowerCase()
  const points = String(sellingPoints || '').toLowerCase()

  if (
    cat.includes('tech') ||
    cat.includes('electronic') ||
    cat.includes('数码') ||
    cat.includes('电子') ||
    name.includes('bluetooth') ||
    name.includes('wireless') ||
    name.includes('usb') ||
    name.includes('charger')
  ) {
    return 'technical'
  }

  if (
    cat.includes('fashion') ||
    cat.includes('cloth') ||
    cat.includes('apparel') ||
    cat.includes('服装') ||
    cat.includes('鞋') ||
    cat.includes('beauty') ||
    name.includes('dress') ||
    name.includes('shirt') ||
    name.includes('shoe')
  ) {
    return 'fashion'
  }

  if (
    cat.includes('home') ||
    cat.includes('kitchen') ||
    cat.includes('garden') ||
    cat.includes('家居') ||
    cat.includes('厨房') ||
    cat.includes('园艺') ||
    name.includes('storage') ||
    name.includes('organizer') ||
    name.includes('container')
  ) {
    return 'lifestyle'
  }

  if (
    points.includes('luxury') ||
    points.includes('premium') ||
    points.includes('高端') ||
    points.includes('礼品') ||
    points.includes('gift')
  ) {
    return 'premium'
  }

  if (
    points.includes('waterproof') ||
    points.includes('battery') ||
    points.includes('capacity') ||
    points.includes('防水') ||
    points.includes('电池') ||
    points.includes('容量') ||
    String(sellingPoints || '').split('\n').length >= 5
  ) {
    return 'infographic'
  }

  if (
    points.includes('fast') ||
    points.includes('quick') ||
    points.includes('powerful') ||
    points.includes('strong') ||
    points.includes('高效') ||
    points.includes('强力')
  ) {
    return 'featureFocus'
  }

  return 'basic'
}

router.post('/', async (req, res) => {
  try {
    const {
      productName,
      listingInfo,
      category,
      marketplace,
      imageLanguage,
      dimensions,
      material,
      targetAudience,
      additionalInfo,
      designNotes,
      fontPreference,
      brandColorMode,
      brandColor,
      sellingPoints,
      imageType,
      complexity,
      selectedImageTasks = [],
      referenceImages = []
    } = req.body

    if (!productName || !sellingPoints) {
      return res.status(400).json({
        error: 'Invalid input',
        message: '产品名称和核心卖点是必填项。'
      })
    }

    const requestedTasks = expandSelectedImageTasks(selectedImageTasks)
    if (requestedTasks.length === 0) {
      return res.status(400).json({
        error: 'Invalid tasks',
        message: '请至少选择 1 张要生成的图片任务。'
      })
    }

    if (requestedTasks.length > 12) {
      return res.status(400).json({
        error: 'Too many tasks',
        message: '单次最多分析 12 张图片任务，请先缩减张数。'
      })
    }

    const recommendedStrategy = recommendStrategy(productName, category, sellingPoints)
    const strategyKey = imageType || recommendedStrategy || 'basic'
    const strategy = STRATEGY_LIBRARY[strategyKey] || STRATEGY_LIBRARY.basic

    const marketplaceLanguage = getTargetImageLanguage({
      marketplace: marketplace || 'UK',
      imageLanguage
    })
    const fontStyleLabel = getFontStyleLabel(fontPreference)
    const brandColorLabel = getBrandColorLabel(brandColorMode, brandColor)
    const imageContentParts = buildImageContentParts(referenceImages)

    const apiKey = process.env.AGENT_API_KEY || process.env.OPENAI_API_KEY
    const baseUrl =
      process.env.AGENT_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    const model = process.env.AGENT_MODEL || 'gpt-4o-mini'

    if (!apiKey || apiKey === 'sk-your-api-key-here') {
      return res.status(500).json({
        error: 'Missing API Key',
        message: '后端未配置 OPENAI_API_KEY。'
      })
    }

    const taskFrameworkDescription = requestedTasks
      .map((item, index) => {
        return [
          `图 ${index + 1} | ${item.name}`,
          `任务类型：${item.taskType}`,
          `目标：${item.purpose}`,
          `要求：${item.guidance}`
        ].join('\n')
      })
      .join('\n\n')

    const hiddenStrategyDescription = [
      `内部视觉策略：${strategy.name}`,
      `策略特点：${Array.isArray(strategy.features) ? strategy.features.join('、') : '无'}`,
      strategy.visualStyle?.mood ? `画面气质：${strategy.visualStyle.mood}` : '',
      strategy.visualStyle?.background ? `背景倾向：${strategy.visualStyle.background}` : ''
    ]
      .filter(Boolean)
      .join('\n')

    const openai = new OpenAI({
      apiKey,
      baseURL: baseUrl
    })

    const systemPrompt = `
你是一名专业的亚马逊产品套图策略师。
你的任务是根据产品信息、参考图、图片任务清单、销售地区、语言和视觉偏好，输出完整的图片策略方案。

输出规则：
1. 只返回 JSON，对象顶层必须包含 imagePlans 数组。
2. imagePlans 必须严格包含 ${requestedTasks.length} 项，且 id 为 1 到 ${requestedTasks.length}。
3. 必须严格按照“图片任务清单”的顺序输出，不能擅自补主图、删尺寸图，或把卖点图改成别的类型。
4. 每项必须包含：id、name、type、purpose、prompt、mappedSellingPoints。
5. prompt 必须是中文可读、方便运营修改的视觉策略说明，不要直接输出英文长 prompt。
6. 如果图片任务里包含主图，主图必须符合亚马逊主图规范：纯白背景、完整展示产品、不裁切主体、无文字、无 logo、无水印、无无关道具。
7. 参考图是产品一致性的最高依据。必须尽量保持产品外形、轮廓、颜色、材质、结构、比例、纹理、配件和关键细节一致，不要擅自改产品本体。
8. 如果用户补充信息或自定义设置中明确要求某个场景、禁用项、语言、氛围或版式，优先服从，不要被默认模板覆盖。
9. 销售国家、生成图片语言、品牌主色、字体风格都要体现在方案建议里。
10. 如果品牌主色是手动指定，就把它作为标题、角标、图标或重点信息的强调色；如果是智能主色，就明确说明配色应根据产品和场景自适应。
11. 如果字体风格是手动指定，就在方案里保持一致；如果是自动匹配，就让字体风格跟随产品类型和站点语言自动判断。
12. 不要虚构不存在的功能、配件、认证、包装或竞品优势。
13. 如果某张图更适合少字、无字、信息图、对比图、步骤图、氛围图，请直接在 prompt 里写明。
`.trim()

    const userPrompt = `
【产品信息】
- 产品名称：${productName}
- 完整 Listing 信息：${listingInfo || '未提供'}
- 类目：${category || '未提供'}
- 销售国家/地区：${marketplace || 'UK'}
- 生成图片语言：${marketplaceLanguage}
- 字体风格：${fontStyleLabel}
- 品牌主色：${brandColorLabel}
- 尺寸规格：${dimensions || '未提供'}
- 材质：${material || '未提供'}
- 目标受众：${targetAudience || '未提供'}
- 补充信息：${additionalInfo || '无'}
- 自定义设置：${designNotes || '无'}
- 复杂度：${complexity || 'L2'}

【核心卖点与 Listing 信息】
${sellingPoints}

【当前图片任务清单】
${taskFrameworkDescription}

【内部视觉策略（隐藏逻辑，仅供你参考，不要机械套模板）】
${hiddenStrategyDescription}

【输出补充要求】
- mappedSellingPoints 里放当前图片承接的主要卖点句子数组。
- prompt 要直接写清楚画面重点、构图方式、文字密度、文案语言、产品展示方式，以及是否需要图标、尺寸线、对比结构。
- 如果参考图展示了产品颜色、造型或结构特征，所有图片方案都必须尽量保持一致。
- 如果某张图不适合放文字，也请直接写明少字或无字。
`.trim()

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            imageContentParts.length > 0
              ? [{ type: 'text', text: userPrompt }, ...imageContentParts]
              : userPrompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 5000
    })

    let rawContent = completion.choices[0].message.content || ''
    rawContent = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    const firstBrace = rawContent.indexOf('{')
    const lastBrace = rawContent.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      rawContent = rawContent.slice(firstBrace, lastBrace + 1)
    }

    const result = JSON.parse(rawContent)

    if (!Array.isArray(result.imagePlans) || result.imagePlans.length !== requestedTasks.length) {
      throw new Error(`Agent 返回的图片策略格式不正确，必须严格输出 ${requestedTasks.length} 张图。`)
    }

    result.imagePlans = result.imagePlans.map((plan, index) => {
      const requestedTask = requestedTasks[index]

      return {
        id: index + 1,
        name: plan.name || requestedTask.name,
        type: plan.type || requestedTask.taskType,
        taskType: requestedTask.taskType,
        taskKey: requestedTask.taskKey,
        purpose: plan.purpose || requestedTask.purpose,
        prompt: plan.prompt || '',
        mappedSellingPoints: Array.isArray(plan.mappedSellingPoints) ? plan.mappedSellingPoints : [],
        promptEn: plan.promptEn || plan.englishPrompt || '',
        promptDirty: false
      }
    })

    result._meta = {
      strategyUsed: strategyKey,
      strategyName: strategy.name,
      recommendedStrategy: recommendedStrategy !== strategyKey ? recommendedStrategy : null,
      complexity: complexity || 'L2',
      requestedImageCount: requestedTasks.length,
      generatedAt: new Date().toISOString()
    }

    res.json({
      success: true,
      data: {
        imagePlans: result.imagePlans,
        _meta: result._meta
      },
      usage: completion.usage
    })
  } catch (error) {
    console.error('Agent analysis error:', error)
    res.status(500).json({
      error: 'Agent analysis failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

export default router
