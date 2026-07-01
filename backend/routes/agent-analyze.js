import express from 'express'
import OpenAI from 'openai'
import { STRATEGY_LIBRARY } from '../strategy-library.js'

const router = express.Router()

// 智能策略推荐函数
function recommendStrategy(productName, category, sellingPoints) {
  const name = (productName || '').toLowerCase()
  const cat = (category || '').toLowerCase()
  const points = (sellingPoints || '').toLowerCase()
  
  // 科技/数码产品 → Technical
  if (cat.includes('tech') || cat.includes('electronic') || cat.includes('数码') || cat.includes('电子') ||
      name.includes('bluetooth') || name.includes('wireless') || name.includes('usb') || name.includes('charger')) {
    return 'technical'
  }
  
  // 服装/时尚/美妆 → Fashion
  if (cat.includes('fashion') || cat.includes('cloth') || cat.includes('apparel') || 
      cat.includes('服装') || cat.includes('服饰') || cat.includes('美妆') || cat.includes('beauty') ||
      name.includes('dress') || name.includes('shirt') || name.includes('shoe')) {
    return 'fashion'
  }
  
  // 家居/生活/厨房 → Lifestyle
  if (cat.includes('home') || cat.includes('kitchen') || cat.includes('家具') || 
      cat.includes('家居') || cat.includes('厨房') || cat.includes('收纳') ||
      name.includes('storage') || name.includes('organizer') || name.includes('container')) {
    return 'lifestyle'
  }
  
  // 高端/奢侈/礼品 → Premium
  if (points.includes('luxury') || points.includes('premium') || points.includes('高端') || 
      points.includes('奢侈') || points.includes('gift') || points.includes('礼品')) {
    return 'premium'
  }
  
  // 功能性强/参数多 → Infographic
  if (points.includes('waterproof') || points.includes('battery') || points.includes('capacity') ||
      points.includes('防水') || points.includes('电池') || points.includes('容量') ||
      sellingPoints.split('\n').length >= 5) {
    return 'infographic'
  }
  
  // 有明确核心卖点 → Feature Focus
  if (points.includes('fast') || points.includes('quick') || points.includes('powerful') ||
      points.includes('strong') || points.includes('高效') || points.includes('强力')) {
    return 'featureFocus'
  }
  
  // 默认：Basic（通用）
  return 'basic'
}

// Agent 分析产品并生成套图策略（基于策略库 V2.0）
router.post('/', async (req, res) => {
  try {
    const { 
      productName, 
      category, 
      marketplace, 
      dimensions, 
      material, 
      targetAudience,
      additionalInfo,
      sellingPoints, 
      imageType,
      complexity,  // L1/L2/L3
      imagePlans 
    } = req.body

    // 验证输入
    if (!productName || !sellingPoints) {
      return res.status(400).json({
        error: 'Invalid input',
        message: '产品名称和卖点是必需的'
      })
    }

    // 智能推荐：根据产品特征自动推荐最佳策略
    const recommendedStrategy = recommendStrategy(productName, category, sellingPoints)
    
    // 获取策略框架：用户选择的优先，否则用推荐的，最后默认 basic
    const strategyKey = imageType || recommendedStrategy || 'basic'
    const strategy = STRATEGY_LIBRARY[strategyKey]
    
    if (!strategy) {
      return res.status(400).json({
        error: 'Invalid strategy',
        message: `未知的策略类型：${strategyKey}，可选值：${Object.keys(STRATEGY_LIBRARY).join(', ')}`
      })
    }

    // 从 .env 读取配置
    const apiKey = process.env.AGENT_API_KEY || process.env.OPENAI_API_KEY
    const baseUrl = process.env.AGENT_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    const model = process.env.AGENT_MODEL || 'gpt-4o-mini'

    if (!apiKey || apiKey === 'sk-your-api-key-here') {
      return res.status(500).json({
        error: 'Missing API Key',
        message: '后端未配置 OPENAI_API_KEY'
      })
    }

    // 构建框架描述（传给 AI 作为约束）
    const frameworkDescription = strategy.framework.map(f => 
      `**图${f.id} | ${f.name}**\n   类型：${f.type}\n   目的：${f.purpose}\n   内容：${f.content}\n   要求：${(f.requirements || []).join(', ')}`
    ).join('\n\n')

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: baseUrl
    })

    // System Prompt - 基于策略库的专业策划师
    const systemPrompt = `你是一个专业的亚马逊电商图像策略师。你的任务是根据产品信息和指定的营销策略框架，为每张图片生成详细的视觉方案。

## 核心原则
1. 你必须严格遵循给定的 7 图框架结构
2. 每张图的 type 和 purpose 必须与框架一致
3. 根据产品卖点合理分配视觉元素
4. 考虑目标市场（US/EU/JP）的审美偏好

## 输出格式要求
你必须输出一个完整的 JSON 对象，格式如下：

{
  "imagePlans": [
    {
      "id": 1,
      "type": "main",
      "purpose": "提升 CTR",
      "coreSellingPoint": "核心卖点（如果有）",
      "headline": "图片标题文案（8-15 字符）",
      "subheadline": "副标题（15-30 字符）",
      "composition": "构图方式描述",
      "scene": "场景描述",
      "colorScheme": "色彩方案",
      "elements": ["图标 1", "箭头", "标注"],
      "prompt": "完整的英文 AI 生成 prompt (2048x2048)",
      "reason": "为什么这样设计"
    }
  ],
  "sellingPointsAnalysis": [
    {
      "point": "原始卖点文字",
      "priority": "high|medium|low",
      "mappedImages": [2, 3],
      "visualSuggestion": "如何视觉化展示"
    }
  ]
}

## prompt 质量标准
- 英文，专业摄影风格
- 包含分辨率：2048x2048
- 包含质量词：high quality, ultra-detailed, professional photography, studio lighting
- 具体到：产品位置、角度、光线方向、背景元素、构图比例
- 如果是信息图/卖点图：包含文字布局、图标样式、颜色代码
- 如果是场景图：包含环境描述、氛围、人物动作

**再次强调：只输出 JSON，不要任何其他内容**`

    // User Prompt - 注入框架约束
    const userPrompt = `请为以下产品生成《Listing 视觉营销策划案》：

## 📋 使用策略：${strategy.name} (${strategy.icon})
- 定位：${strategy.description}
- 视觉风格：${JSON.stringify(strategy.visualStyle)}

## 🖼️ 7 图框架（必须严格遵循）

${frameworkDescription}

---

## 📦 产品信息

**产品名称**: ${productName}
**所属类目**: ${category || '未指定'}
**目标市场**: ${marketplace || 'US'}
**尺寸规格**: ${dimensions || '未指定'}
**材质/工艺**: ${material || '未指定'}
**目标受众**: ${targetAudience || '未指定'}
**补充信息**: ${additionalInfo || '无'}

## 🎯 核心卖点（每行一个，按重要性排序）

${sellingPoints}

## ️ 复杂度级别：${complexity || 'L2'}（默认标准版）

${complexity === 'L1' ? `
[L1 极速版] 要求:
- 图 2-3: 简洁卖点 + 尺寸即可
- 图 4-7: 白底 + 简短文字，不需要复杂场景
- 无信息图/对比图
- prompt 要简洁高效
` : complexity === 'L3' ? `
[L3 精品版] 要求:
- 每张图都要极致详细
- 加入信息图、对比图、情绪化场景
- prompt 要非常丰富和专业
- 可以加入品牌级视觉元素
` : `
[L2 标准版] 要求:
- 平衡质量和成本
- 按框架正常输出每张图的详细策略
- 场景图和信息图适度使用
`}

---

请严格遵循上述 7 图框架，为这个产品的每张图生成详细的视觉方案。
确保：
1. 每张图的 type 和 purpose 与框架一致
2. 根据【核心卖点】合理分配到各张图
3. prompt 必须是完整可用的英文 prompt
4. 考虑产品特点和目标市场偏好

请输出完整的 JSON 策略。`

    // 调用 GPT
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 5000  // 增加上限支持更详细的输出
    })

    // 解析结果
    let rawContent = completion.choices[0].message.content

    console.log('GPT 原始响应长度:', rawContent.length)
    console.log('GPT 原始响应前 500 字符:', rawContent.substring(0, 500))

    // 1. 移除 Markdown 代码块标记
    rawContent = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    
    // 2. 提取 JSON
    const firstBrace = rawContent.indexOf('{')
    const lastBrace = rawContent.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      rawContent = rawContent.substring(firstBrace, lastBrace + 1)
    }

    let result
    try {
      result = JSON.parse(rawContent)
    } catch (parseError) {
      console.error('JSON 解析失败:', parseError)
      console.error('清理后的内容前 500 字符:', rawContent.substring(0, 500))
      throw new Error(`GPT 返回的数据格式不正确：${parseError.message}`)
    }

    // 验证输出格式
    if (!result.imagePlans || result.imagePlans.length !== 7) {
      console.error('imagePlans 格式不正确:', result)
      throw new Error('Agent 返回的图片策略格式不正确（需要 7 张图片）')
    }

    // 补充策略元数据
    result._meta = {
      strategyUsed: strategyKey,
      strategyName: strategy.name,
      recommendedStrategy: recommendedStrategy !== strategyKey ? recommendedStrategy : null,
      complexity: complexity || 'L2',
      generatedAt: new Date().toISOString()
    }

    res.json({
      success: true,
      data: result,
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
