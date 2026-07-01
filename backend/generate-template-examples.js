// 模板示例图生成脚本 - 专业亚马逊排版风格（参考 Linkfox）
// 使用方法：cd backend && node generate-template-examples.js

import 'dotenv/config'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const apiKey = process.env.IMAGE_GEN_API_KEY
const baseUrl = process.env.IMAGE_GEN_BASE_URL
const model = process.env.IMAGE_GENERATION_MODEL || 'gpt-image-2'

// 6 种模板的示例图描述 - 专业的信息图排版，带文字、图标、箭头（参考用户提供的沙漏图）
const templateExamples = {
  basic: {
    name: '基础套图',
    // 类似参考图的图 1 - 产品系列展示
    description: 'Professional Amazon product infographic for sand timer set. LARGE BOLD TITLE at top "6er Sanduhren Set". Below: 6 colorful sand timers in a row (purple 1min, blue 3min, green 5min, yellow 10min, orange 15min, red 30min). Each timer has colored label badge above showing time. Clean white background, product photography with text overlays, e-commerce infographic style, high contrast, Arial font',
    outputDir: '../public/templates/basic'
  },
  infographic: {
    name: '信息图套图',
    // 类似参考图的图 2 - 材质说明
    description: 'Professional infographic showing "Hochwertige Materialien" (High Quality Materials). LARGE TITLE at top. Right side: two sand timers (10min yellow, 30min red). Left side: 4 vertically arranged feature points, each with icon + text: shield icon "Hochborosilikatglas", leaf icon "Naturliches Holz", sparkle icon "Feiner Sand", checkmark icon "Stabil & Langlebig". Clean layout, white background, modern e-commerce design',
    outputDir: '../public/templates/infographic'
  },
  lifestyle: {
    name: '生活方式',
    // 类似参考图的图 3 - 人物使用场景
    description: 'Lifestyle scene: young girl in yellow shirt and blue overalls sitting at wooden desk, writing in notebook with sand timer beside her. LARGE TITLE "Effektives Zeitmanagement" at top left. Below title: 4 bullet points with colorful icons (brain, clock, checklist, graph) and German text. Warm natural lighting, cozy home study environment, authentic not staged',
    outputDir: '../public/templates/lifestyle'
  },
  tech: {
    name: '科技数码',
    // 类似参考图的图 4 - 多场景拼贴
    description: '4-scene collage infographic titled "Vielseitig einsetzbar". 6 rectangular panels in a row showing different people using sand timers: skincare, brushing teeth, meditation, studying, cooking, exercise. Each panel has small text label below (Hautpflege, Zahneputzen, Meditation, Lernen, Kochen, Training). Above panels: 6 colored time badges (1min, 3min, 5min, 10min, 15min, 30min). Clean grid layout, lifestyle photography',
    outputDir: '../public/templates/tech'
  },
  fashion: {
    name: '时尚服饰',
    // 类似参考图的图 5 - 包装展示
    description: 'Product packaging flat lay: open black gift box containing 6 colorful sand timers arranged neatly. Gold ribbon beside box. LARGE TITLE "Perfektes Geschenk" at top left. Below: 3 bullet points with icons (gift box, calendar, heart) and German text. Clean white background, premium presentation, gift-ready aesthetic, e-commerce photography',
    outputDir: '../public/templates/fashion'
  },
  home: {
    name: '家居用品',
    // 类似参考图的图 6 - 设计展示
    description: 'Product display: 6 colorful sand timers arranged on wooden shelf next to books (KINFOLK, THE KINFOLK HOME). LARGE TITLE "Elegantes Design" at top, subtitle "Passt in jedes Zuhause". Warm home interior background with plant and picture frame. Cozy aesthetic, natural lighting, shows product in home decor context',
    outputDir: '../public/templates/home'
  }
}

async function generateExample(templateKey, templateData) {
  console.log(`\n🎨 正在生成 [${templateData.name}] 示例图...`)
  
  try {
    const response = await axios.post(
      `${baseUrl}/images/generations`,
      {
        model: model,
        prompt: templateData.description,
        n: 1,
        size: '1024x1024',
        response_format: 'url'
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    )
    
    const imageUrl = response.data.data[0].url
    console.log(`✅ 生成成功：${imageUrl}`)
    
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' })
    const buffer = Buffer.from(imageResponse.data, 'binary')
    
    if (!fs.existsSync(templateData.outputDir)) {
      fs.mkdirSync(templateData.outputDir, { recursive: true })
    }
    
    const outputPath = path.join(templateData.outputDir, 'example.jpg')
    fs.writeFileSync(outputPath, buffer)
    console.log(`💾 已保存到：${outputPath}`)
    
    return outputPath
    
  } catch (error) {
    console.error(`❌ 生成失败：${error.message}`)
    if (error.response) {
      console.error('API Response:', error.response.data)
    }
    return null
  }
}

async function main() {
  console.log('🚀 开始生成模板示例图（专业亚马逊排版风格）...')
  console.log(`📡 API Base URL: ${baseUrl}`)
  console.log(`🤖 模型：${model}`)
  
  const results = []
  
  for (const [key, data] of Object.entries(templateExamples)) {
    const result = await generateExample(key, data)
    results.push({ template: key, path: result })
    
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  
  console.log('\n 生成结果汇总：')
  results.forEach(r => {
    console.log(`  ${r.template}: ${r.path || '失败'}`)
  })
  
  console.log('\n✨ 完成！')
}

main().catch(console.error)
