import { normalizeStringArray } from '../../utils/productModel.js'
import { compactObject } from './productBlueprint.js'

function isFullSetTask(taskType = '', strategyContent = '', imageProductUsage = {}) {
  const strategy = String(strategyContent || '')
  if (imageProductUsage.displayMode === 'full_set') return true
  if (['package', 'summary', 'dimensions', 'comparison'].includes(taskType)) return true
  return /(全套|套装|全部|所有|完整展示|清单|盒内|包装|件套|\d+\s*个|\d+\s*件|full set|complete set|all pieces|all items|show all|6-piece|6 piece)/i.test(strategy)
}

function shouldUseQuantityRuleForTask(rule = '', strategyContent = '', taskType = '', imageProductUsage = {}) {
  const text = String(rule || '')
  const hasQuantityLanguage =
    /(数量|全套|套装|全部|所有|独立.*组成|组成的套装|不能多也不能少|不可减少或增加|\d+\s*个|\d+\s*件|\d+\s*只|\d+\s*片)/.test(text) ||
    /(show exactly|full set|complete set|all pieces|all items|six hourglasses|6 hourglasses|6-piece|6 piece)/i.test(text)

  if (!hasQuantityLanguage) return true
  return isFullSetTask(taskType, strategyContent, imageProductUsage)
}

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
    doNotShowAsIncluded:
      normalizeStringArray(candidate.doNotShowAsIncluded, 12, 120).length > 0
        ? normalizeStringArray(candidate.doNotShowAsIncluded, 12, 120)
        : normalizeStringArray(fallback.doNotShowAsIncluded, 12, 120),
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
      doNotShowAsIncluded: [],
      reason: '这张图的职责是证明完整套装或到手内容。'
    }
  }

  if (taskType === 'detail' || /(细节|局部|特写|材质|纹理|close-up|detail)/i.test(strategy)) {
    return {
      displayMode: 'detail_part',
      requiredItems: [],
      optionalItems: [],
      doNotShowAsIncluded: bundleItems,
      reason: '这张图的职责是展示真实局部细节，不需要展示全套。'
    }
  }

  if (taskType === 'scenario' || /(场景|使用|厨房|书桌|办公|儿童|亲子|use|scene|lifestyle)/i.test(strategy)) {
    return {
      displayMode: 'single_item',
      requiredItems: [],
      optionalItems: [],
      doNotShowAsIncluded: [],
      reason: '这张图的职责是证明真实使用场景，可只展示当前场景正在使用的产品或必要配件。'
    }
  }

  if (taskType === 'feature') {
    return {
      displayMode: 'selected_items',
      requiredItems: [],
      optionalItems: [],
      doNotShowAsIncluded: [],
      reason: '这张图按购买理由选择需要出现的产品或配件，不强制每次展示全套。'
    }
  }

  return {
    displayMode: 'selected_items',
    requiredItems: [],
    optionalItems: [],
    doNotShowAsIncluded: [],
    reason: '按本图策略选择需要出现的产品或配件。'
  }
}

function deriveExecutionRulesFromStrategy(strategyContent = '', productBlueprint = {}, taskType = '', imageProductUsage = {}) {
  const ruleKeywords = [
    '必须',
    '不得',
    '不能',
    '禁止',
    '保持',
    '完整',
    '清楚',
    '可见',
    '真实',
    '一致',
    '不要',
    '避免',
    '严禁',
    '接触',
    '对准',
    '数量',
    '配件',
    '尺寸'
  ]
  const strategyRules = String(strategyContent || '')
    .replace(/\r\n/g, '\n')
    .split(/[。\n；;]/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 6 && line.length <= 90)
    .filter((line) => /^(必须|不得|不能|禁止|保持|不要|避免|严禁|产品|配件|数量|尺寸|文案|主视觉|画面|场景)/.test(line))
    .filter((line) => ruleKeywords.some((keyword) => line.includes(keyword)))
    .slice(0, 6)

  const blueprintRules = normalizeStringArray(
    [
      ...(productBlueprint.productRules?.mustKeep || []),
      ...(productBlueprint.productRules?.forbidden || []),
      ...(productBlueprint.structure?.importantRelationships || []),
      ...(productBlueprint.installationRules?.relationship || [])
    ],
    6,
    120
  ).filter((rule) => {
    if (['single_item', 'detail_part', 'selected_items'].includes(imageProductUsage.displayMode)) {
      return shouldUseQuantityRuleForTask(rule, strategyContent, taskType, imageProductUsage) && !/(show exactly|full set|complete set|all pieces|all items|six hourglasses|6 hourglasses)/i.test(rule)
    }

    return shouldUseQuantityRuleForTask(rule, strategyContent, taskType, imageProductUsage)
  })

  const taskFallback = {
    feature: ['必须保持产品外观、颜色、结构、数量和配件与参考图一致', '不得只写文案而不展示对应产品证据'],
    scenario: ['必须保持产品使用方式符合产品资料和参考图', '不得出现错误接触、错误位置、比例失真或悬空关系'],
    detail: ['不得改变产品结构、材质纹理和真实比例', '必须让关键细节清楚可见'],
    dimensions: ['必须使用已确认尺寸或清晰参考图尺寸，不得编造', '不得在同一张图重复标注同一尺寸信息'],
    steps: ['必须按真实使用顺序展示步骤关系', '不得出现错误安装、错误接触或悬空关系'],
    summary: ['必须使用已确认卖点和产品资料', '不得新增未确认配件、认证或夸大承诺']
  }[taskType] || ['必须保持产品外观、颜色、结构、数量和配件与参考图一致']

  return [...new Set([...strategyRules, ...blueprintRules, ...taskFallback])].slice(0, 8)
}

function hasChineseText(value = '') {
  return /[\u4e00-\u9fff]/.test(String(value || ''))
}

function isEnglishExecutionRule(value = '') {
  return /^(show|keep|do not|avoid|must|use|render|create|place|make|ensure|only|never|no)\b/i.test(String(value || '').trim())
}

function isVagueCopyPlaceholder(value = '') {
  return /(文案用|用短句|短句说明|标题强调|副标题说明|文字说明|可写|可以写|建议写|copy should|add concise copy|use short copy|title should|subtitle should)/i.test(String(value || ''))
}

function isExecutionGuardRule(value = '') {
  const rule = String(value || '').trim()
  if (!rule) return false
  if (isVagueCopyPlaceholder(rule)) return false

  return /^(必须|不得|不能|禁止|保持|不要|避免|严禁|只能|不可)/.test(rule)
}

function normalizeRuleKey(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。；;、,.:"“”'‘’()（）[\]【】]/g, '')
}

function dedupeExecutionRules(rules = [], strategyContent = '') {
  const strategyKey = normalizeRuleKey(strategyContent)
  const seen = new Set()

  return rules
    .map((rule) => String(rule || '').trim())
    .filter(Boolean)
    .filter((rule) => hasChineseText(rule))
    .filter((rule) => !isEnglishExecutionRule(rule))
    .filter((rule) => isExecutionGuardRule(rule))
    .filter((rule) => rule.length >= 6 && rule.length <= 90)
    .filter((rule) => {
      const key = normalizeRuleKey(rule)
      if (!key || seen.has(key)) return false
      seen.add(key)

      if (rule.length > 42 && strategyKey.includes(key)) return false
      return true
    })
}

function getExecutionRuleLimit(taskType = '', imageProductUsage = {}, strategyContent = '') {
  const text = [
    taskType,
    strategyContent,
    imageProductUsage?.displayMode || '',
    imageProductUsage?.reason || ''
  ].join(' ')

  if (taskType === 'main') return 0
  if (/full_set/.test(text)) return 6
  if (/(数量|尺寸|接触|安装|位置|比例|分钟|时长|对准|穿模|颜色)/.test(text)) return 5
  if (/(single_item|detail_part)/.test(String(imageProductUsage?.displayMode || ''))) return 3
  if (taskType === 'scenario') return 4
  if (taskType === 'feature') return 4
  return 4
}

export function normalizeExecutionRules(plan = {}, strategyContent = '', productBlueprint = {}, taskType = '', imageProductUsage = {}) {
  const ruleLimit = getExecutionRuleLimit(taskType, imageProductUsage, strategyContent)
  const modelRules = normalizeStringArray(plan.executionRules || plan.constraints, 12, 120)
    .filter((rule) => !(/^这张图回答/.test(rule)))
    .filter((rule) => rule.length <= 120)
    .filter((rule) => hasChineseText(rule))
    .filter((rule) => !isEnglishExecutionRule(rule))
    .filter((rule) => isExecutionGuardRule(rule))
    .filter((rule) => {
      if (['single_item', 'detail_part', 'selected_items'].includes(imageProductUsage.displayMode)) {
        return shouldUseQuantityRuleForTask(rule, strategyContent, taskType, imageProductUsage) && !/(show exactly|full set|complete set|all pieces|all items|six hourglasses|6 hourglasses)/i.test(rule)
      }

      return shouldUseQuantityRuleForTask(rule, strategyContent, taskType, imageProductUsage)
    })
  const fallbackRules = deriveExecutionRulesFromStrategy(strategyContent, productBlueprint, taskType, imageProductUsage)
  return dedupeExecutionRules([...modelRules, ...fallbackRules], strategyContent).slice(0, ruleLimit)
}
