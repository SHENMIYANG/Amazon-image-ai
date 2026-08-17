import { normalizeStringArray } from '../../utils/productModel.js'
import { compactObject } from './productBlueprint.js'

function getUsageReasonByMode(displayMode = '') {
  switch (displayMode) {
    case 'full_set':
      return '这张图需要展示完整套装或完整到手内容。'
    case 'single_item':
      return '这张图只需要展示当前场景正在使用的单个产品或必要配件。'
    case 'detail_part':
      return '这张图展示真实局部细节，不需要展示全套。'
    case 'selected_items':
    default:
      return '这张图按当前购买理由选择需要出现的产品或配件。'
  }
}

export function normalizeImageProductUsage(value = {}, fallback = {}) {
  const candidate = value && typeof value === 'object' ? value : {}
  const displayModes = new Set(['full_set', 'selected_items', 'single_item', 'detail_part'])
  const displayMode = displayModes.has(candidate.displayMode) ? candidate.displayMode : fallback.displayMode

  return compactObject({
    displayMode,
    requiredItems:
      normalizeStringArray(candidate.requiredItems, 12, 100).length > 0
        ? normalizeStringArray(candidate.requiredItems, 12, 100)
        : normalizeStringArray(fallback.requiredItems, 12, 100),
    optionalItems:
      normalizeStringArray(candidate.optionalItems, 12, 100).length > 0
        ? normalizeStringArray(candidate.optionalItems, 12, 100)
        : normalizeStringArray(fallback.optionalItems, 12, 100),
    reason: getUsageReasonByMode(displayMode)
  })
}

export function inferImageProductUsage({ plan = {}, strategyContent = '', productBlueprint = {}, taskType = '' } = {}) {
  const strategy = String(strategyContent || '')
  const mainParts = normalizeStringArray(productBlueprint.structure?.mainParts, 12, 100)
  const bundleItems = normalizeStringArray(productBlueprint.bundleRules?.includedItems, 12, 100)
  const setItems = bundleItems.length > 0 ? bundleItems : mainParts

  if (taskType === 'package' || /(全套|完整套装|到手内容|清单|全部|所有|full set|complete set|all items|all pieces|6-piece|6 piece)/i.test(strategy)) {
    return {
      displayMode: 'full_set',
      requiredItems: setItems,
      optionalItems: [],
      reason: '这张图的职责是证明完整套装或到手内容。'
    }
  }

  if (taskType === 'detail' || /(细节|局部|特写|材质|纹理|close-up|detail)/i.test(strategy)) {
    return {
      displayMode: 'detail_part',
      requiredItems: [],
      optionalItems: [],
      reason: '这张图的职责是展示真实局部细节，不需要展示全套。'
    }
  }

  if (taskType === 'scenario' || /(场景|使用|厨房|书桌|办公|儿童|亲子|use|scene|lifestyle)/i.test(strategy)) {
    return {
      displayMode: 'single_item',
      requiredItems: [],
      optionalItems: [],
      reason: '这张图的职责是证明真实使用场景，可只展示当前场景正在使用的产品或必要配件。'
    }
  }

  if (taskType === 'feature') {
    return {
      displayMode: 'selected_items',
      requiredItems: [],
      optionalItems: [],
      reason: '这张图按购买理由选择需要出现的产品或配件，不强制每次展示全套。'
    }
  }

  return {
    displayMode: 'selected_items',
    requiredItems: [],
    optionalItems: [],
    reason: '按本图策略选择需要出现的产品或配件。'
  }
}

function isVagueCopyPlaceholder(value = '') {
  return /(文案用|用短句|短句说明|标题强调|副标题说明|文字说明|可写|可以写|建议写|copy should|add concise copy|use short copy|title should|subtitle should)/i.test(String(value || ''))
}

function containsChinese(value = '') {
  return /[\u4e00-\u9fff]/.test(String(value || ''))
}

function extractStrategyGuards(strategyContent = '') {
  return String(strategyContent || '')
    .replace(/\r\n/g, '\n')
    .split(/[\n。；;]/)
    .map((line) => line.replace(/^[\s\-•\d.、]+/, '').trim())
    .filter((line) => line.length >= 6 && line.length <= 160)
    .filter((line) => containsChinese(line))
    .filter((line) => /(必须|不得|禁止|避免|不能|不可|严禁|只可|仅可|不应)/.test(line))
}

function normalizeRuleKey(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。；;、,.:"“”'‘’()（）[\]【】]/g, '')
}

function dedupeExecutionRules(rules = []) {
  const seen = new Set()

  return rules
    .map((rule) => String(rule || '').trim())
    .filter(Boolean)
    .filter((rule) => !isVagueCopyPlaceholder(rule))
    .filter((rule) => rule.length >= 2 && rule.length <= 160)
    .filter((rule) => {
      const key = normalizeRuleKey(rule)
      if (!key || seen.has(key)) return false
      seen.add(key)

      return true
    })
}

export function normalizeExecutionRules(plan = {}, strategyContent = '') {
  const modelRules = normalizeStringArray(plan.executionRules || plan.constraints, 12, 160)
    .filter((rule) => !(/^这张图回答/.test(rule)))
    .filter((rule) => !isVagueCopyPlaceholder(rule))
    .filter((rule) => containsChinese(rule))
  const strategyGuards = extractStrategyGuards(strategyContent)
  const rules = dedupeExecutionRules([...modelRules, ...strategyGuards]).slice(0, 8)

  return rules.length > 0
    ? rules
    : ['不得改变参考图中确认的产品结构、颜色、比例、数量和标配配件。']
}
