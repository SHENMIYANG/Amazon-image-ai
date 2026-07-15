export const IMAGE_TASK_OPTIONS = [
  {
    type: 'main',
    label: '主图',
    description: '白底标准主图，适合 Amazon 主图位',
    defaultCount: 1,
    defaultName: '白底主图'
  },
  {
    type: 'feature',
    label: '卖点图',
    description: '突出核心卖点、功能利益点',
    defaultCount: 2,
    defaultName: '核心卖点图'
  },
  {
    type: 'scenario',
    label: '场景图',
    description: '真实使用场景和氛围展示',
    defaultCount: 1,
    defaultName: '场景应用图'
  },
  {
    type: 'detail',
    label: '细节图',
    description: '材质、结构、做工、纹理特写',
    defaultCount: 1,
    defaultName: '细节特写图'
  },
  {
    type: 'dimensions',
    label: '尺寸图',
    description: '尺寸、容量、比例、结构说明',
    defaultCount: 1,
    defaultName: '尺寸参数图'
  },
  {
    type: 'steps',
    label: '步骤图',
    description: '安装、使用方式、操作流程',
    defaultCount: 0,
    defaultName: '使用步骤图'
  },
  {
    type: 'comparison',
    label: '对比图',
    description: '竞品对比、前后对比、效果对比',
    defaultCount: 0,
    defaultName: '对比说明图'
  },
  {
    type: 'package',
    label: '包装图',
    description: '包装清单、套装内容、配件说明',
    defaultCount: 0,
    defaultName: '包装清单图'
  },
  {
    type: 'summary',
    label: '总结图',
    description: '礼品属性、信任补充、收尾强化',
    defaultCount: 1,
    defaultName: '补充总结图'
  }
]

const TYPE_BLUEPRINTS = {
  main:
    '按亚马逊主图规范展示产品：纯白背景、完整展示产品全貌、不裁切主体、不加文案、不加 Logo、不加水印、不加无关道具。',
  feature:
    '围绕核心卖点做转化型表达，可结合标题、图标、局部特写或轻场景，但产品主体必须清晰，卖点表达要直接。',
  scenario:
    '展示产品在真实环境中的使用效果，让买家一眼理解使用场景、氛围感和实际用途，产品要自然融入场景。',
  detail:
    '放大展示材质、纹理、结构、工艺、耐用性或关键细节，强调真实质感和可信度，不做夸张变形。',
  dimensions:
    '清晰展示尺寸、容量、比例、结构或参照物，帮助买家快速理解产品大小和适配空间。',
  steps:
    '用清晰易懂的画面说明使用步骤、安装方式或操作流程，可使用分步布局，但信息不要过满。',
  comparison:
    '通过前后对比、竞品对比或效果对比，突出产品优势，画面对比逻辑要清晰，不要虚构不存在的能力。',
  package:
    '展示包装、套装、配件或清单信息，让买家知道会收到什么内容，避免添加未确认的配件。',
  summary:
    '用于补充整体卖点、礼品属性、信任感、收尾氛围或综合价值表达，起到强化购买理由的作用。'
}

export function getDefaultImageTaskConfig() {
  return IMAGE_TASK_OPTIONS.reduce((acc, option) => {
    acc[option.type] = option.defaultCount
    return acc
  }, {})
}

export function normalizeImageTaskConfig(config = {}) {
  const base = getDefaultImageTaskConfig()
  return IMAGE_TASK_OPTIONS.reduce((acc, option) => {
    const rawValue = config[option.type]
    const count = Number.isFinite(Number(rawValue)) ? Number(rawValue) : base[option.type]
    acc[option.type] = Math.max(0, Math.min(6, Math.round(count)))
    return acc
  }, {})
}

export function getSelectedImageTasks(config = {}) {
  const normalized = normalizeImageTaskConfig(config)
  return IMAGE_TASK_OPTIONS.filter((option) => normalized[option.type] > 0).map((option) => ({
    type: option.type,
    label: option.label,
    description: option.description,
    count: normalized[option.type]
  }))
}

export function getSelectedImageTaskCount(config = {}) {
  return getSelectedImageTasks(config).reduce((sum, item) => sum + item.count, 0)
}

export function expandImageTasks(config = {}) {
  const normalized = normalizeImageTaskConfig(config)
  const expanded = []

  IMAGE_TASK_OPTIONS.forEach((option) => {
    const count = normalized[option.type]
    for (let index = 1; index <= count; index += 1) {
      expanded.push({
        taskType: option.type,
        taskKey: `${option.type}-${index}`,
        label: option.label,
        name: count > 1 ? `${option.defaultName} ${index}` : option.defaultName,
        description: option.description,
        blueprint: TYPE_BLUEPRINTS[option.type] || ''
      })
    }
  })

  return expanded
}

export function buildDefaultPlansFromTasks(config = {}, existingPlans = []) {
  const existingByTaskKey = new Map(
    (existingPlans || [])
      .filter((plan) => plan?.taskKey)
      .map((plan) => [plan.taskKey, plan])
  )

  return expandImageTasks(config).map((task, index) => {
    const existing = existingByTaskKey.get(task.taskKey)
    const basePrompt = [
      `【${task.name}】`,
      task.blueprint,
      '配色要求：根据产品图片、产品颜色、材质和使用场景自适应，不套固定模板色。',
      '语言要求：图片中的标题、标签、卖点和说明文字统一使用当前选择的生成图片语言。',
      '画面要求：产品主体清晰、构图适合电商转化，避免夸张特效、侵权元素、品牌 Logo 和无关文案。'
    ].join('\n')

    return {
      id: index + 1,
      name: task.name,
      taskType: task.taskType,
      taskKey: task.taskKey,
      type: task.taskType,
      purpose: task.description,
      prompt: existing?.prompt || basePrompt,
      promptEn: existing?.promptEn || '',
      executionPromptEn: existing?.executionPromptEn || '',
      promptDirty: existing?.promptDirty || false
    }
  })
}

export function getTaskLabel(taskType) {
  return IMAGE_TASK_OPTIONS.find((option) => option.type === taskType)?.label || '图片任务'
}
