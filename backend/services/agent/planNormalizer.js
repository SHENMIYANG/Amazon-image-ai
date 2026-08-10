import { normalizeStringArray } from '../../utils/productModel.js'
import { splitProductItems } from './productBlueprint.js'
import {
  inferImageProductUsage,
  normalizeExecutionRules,
  normalizeImageProductUsage
} from './executionRules.js'

export const MAIN_IMAGE_STRATEGY_ZH = [
  '【目的】提升点击率（CTR）。',
  '【构图】产品完整展示，主体占画面约 85%，居中摆放。',
  '【背景】纯白背景（RGB 255,255,255）。',
  '【文字】无文字。',
  '【Logo】无 Logo（除产品本身自带品牌）。',
  '【元素】除产品及产品标配配件外，不添加任何装饰元素。',
  '【要求】突出产品主体，边缘清晰，光线自然，阴影真实，符合 Amazon 主图规范。'
].join('\n')

export const MAIN_IMAGE_STRATEGY_EN = [
  'Goal: Increase click-through rate (CTR).',
  'Composition: Show the complete product centered, with the product occupying about 85% of the frame.',
  'Background: Pure white background (RGB 255,255,255).',
  'Text: No text.',
  'Logo: No logo except any real logo already printed on the product itself.',
  'Elements: Do not add any decorative elements beyond the product and its confirmed included accessories.',
  'Requirements: Keep the product dominant, edges clear, lighting natural, shadows realistic, and the result compliant with Amazon main-image rules.'
].join('\n')

export function createFixedMainPlan(requestedTask, id) {
  return {
    id,
    name: requestedTask.name,
    type: 'main',
    taskType: 'main',
    taskKey: requestedTask.taskKey,
    imageRole: 'Amazon 主图',
    sellingFocus: '完整且真实地展示产品主体与已确认标配配件',
    executionRules: [
      '完整产品不可裁切',
      '主体最长边约占画面 85% 并居中',
      '纯白背景 RGB 255,255,255',
      '无文字、无装饰、无额外 Logo',
      '不得新增或删除产品结构与配件'
    ],
    copy: [],
    strategyContent: MAIN_IMAGE_STRATEGY_ZH,
    promptEn: MAIN_IMAGE_STRATEGY_EN,
    promptDirty: false
  }
}

export function extractImageCopy(strategyContent = '', maxItems = 8) {
  const text = String(strategyContent || '')
  const candidates = []
  const copyLinePattern = /(文案|标题|副文案|副标题|小标签|标签)[^。\n；;:：]*[:：]?([^。\n；;]+)/g
  let lineMatch

  while ((lineMatch = copyLinePattern.exec(text)) !== null) {
    const fragment = lineMatch[2] || ''
    const quoted = [...fragment.matchAll(/[“"「『]([^”"」』]{2,80})[”"」』]/g)].map((match) => match[1])
    if (quoted.length > 0) {
      candidates.push(...quoted)
    } else {
      splitProductItems(fragment, 10).forEach((item) => candidates.push(item))
    }
  }

  return candidates
    .map((item) => item.replace(/^允许[:：]?\s*/, '').trim())
    .filter((item) => item.length >= 2 && item.length <= 80)
    .filter((item) => !/[。；;]$/.test(item))
    .filter((item, index, source) => source.findIndex((candidate) => candidate === item) === index)
    .slice(0, maxItems)
}

export function ensureCopyVisibleInStrategy(strategyContent = '', copyLines = []) {
  const content = String(strategyContent || '').trim()
  const copy = normalizeStringArray(copyLines, 8, 80)
  if (copy.length === 0) return content

  const missingCopy = copy.filter((line) => !content.includes(line))
  if (missingCopy.length === 0 && !isVagueCopyPlaceholder(content)) return content

  const quotedCopy = copy.map((line) => `“${line}”`).join('、')
  const copySentence = `图片文字使用：${quotedCopy}。`

  if (!content) return copySentence
  if (/图片文字使用[:：]/.test(content)) return content
  return `${content}\n${copySentence}`
}

function isVagueCopyPlaceholder(value = '') {
  return /(文案用|用短句|短句说明|标题强调|副标题说明|文字说明|可写|可以写|建议写|copy should|add concise copy|use short copy|title should|subtitle should)/i.test(String(value || ''))
}

export function normalizeStrategyPlans({
  requestedTasks = [],
  strategyPlans = [],
  productBlueprint = {}
} = {}) {
  let nonMainPlanIndex = 0

  return requestedTasks.map((requestedTask, index) => {
    if (requestedTask.taskType === 'main') {
      return createFixedMainPlan(requestedTask, index + 1)
    }

    const plan = strategyPlans[nonMainPlanIndex] || {}
    nonMainPlanIndex += 1

    const rawStrategyContent = String(plan.strategyContent || '').trim()
    const normalizedCopy = normalizeStringArray(plan.copy, 8, 80)
    const extractedCopy = normalizedCopy.length > 0 ? normalizedCopy : extractImageCopy(rawStrategyContent, 8)
    const strategyContent = ensureCopyVisibleInStrategy(rawStrategyContent, extractedCopy)
    const normalizedImageProductUsage = normalizeImageProductUsage(
      plan.currentImageProductUsage || plan.imageProductUsage,
      inferImageProductUsage({
        plan,
        strategyContent,
        productBlueprint,
        taskType: requestedTask.taskType
      })
    )
    const bundleItemsForPlan = normalizeStringArray(productBlueprint.bundleRules?.includedItems, 16, 100)
    const currentImageProductUsage =
      normalizedImageProductUsage.displayMode === 'full_set' && bundleItemsForPlan.length > 0
        ? {
            ...normalizedImageProductUsage,
            requiredItems: bundleItemsForPlan
          }
        : normalizedImageProductUsage
    const sellingFocus = String(
      plan.sellingFocus ||
        plan.primarySellingPoint ||
        plan.focus ||
        ''
    ).trim()

    return {
      id: index + 1,
      name: String(plan.name || requestedTask.name).trim(),
      type: String(plan.type || requestedTask.taskType).trim(),
      taskType: requestedTask.taskType,
      taskKey: requestedTask.taskKey,
      imageRole: String(plan.imageRole || '').trim(),
      sellingFocus,
      currentImageProductUsage,
      executionRules: normalizeExecutionRules(
        plan,
        strategyContent,
        productBlueprint,
        requestedTask.taskType,
        currentImageProductUsage
      ),
      copy: requestedTask.taskType !== 'main' ? extractedCopy : [],
      strategyContent,
      promptEn: String(plan.promptEn || '').trim(),
      promptDirty: false
    }
  })
}
