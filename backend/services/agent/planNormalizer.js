import { normalizeStringArray } from '../../utils/productModel.js'
import { splitProductItems } from './productBlueprint.js'
import {
  inferImageProductUsage,
  normalizeExecutionRules,
  normalizeImageProductUsage
} from './executionRules.js'

const MAIN_IMAGE_EXECUTION_RULES = [
  '完整产品不可裁切',
  '主体最长边约占画面 85% 并居中',
  '纯白背景 RGB 255,255,255',
  '无文字、无装饰、无额外 Logo',
  '不得新增或删除产品结构与配件'
]

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
  return requestedTasks.map((requestedTask, index) => {
    const plan = strategyPlans[index] || {}

    const rawStrategyContent = String(plan.strategyContent || '').trim()
    const normalizedCopy = requestedTask.taskType === 'main'
      ? []
      : normalizeStringArray(plan.copy, 8, 80)
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

    const executionRules = normalizeExecutionRules(
      plan,
      strategyContent,
      productBlueprint,
      requestedTask.taskType,
      currentImageProductUsage
    )

    return {
      id: index + 1,
      name: String(plan.name || requestedTask.name).trim(),
      type: String(plan.type || requestedTask.taskType).trim(),
      taskType: requestedTask.taskType,
      taskKey: requestedTask.taskKey,
      imageRole: String(plan.imageRole || '').trim(),
      sellingFocus,
      currentImageProductUsage,
      executionRules: requestedTask.taskType === 'main'
        ? [...new Set([...executionRules, ...MAIN_IMAGE_EXECUTION_RULES])]
        : executionRules,
      copy: requestedTask.taskType !== 'main' ? extractedCopy : [],
      strategyContent,
      promptEn: String(plan.promptEn || '').trim(),
      promptDirty: false
    }
  })
}
