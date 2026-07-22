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
    description: '突出核心卖点、功能和利益点',
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

const TASK_BLUEPRINTS = {
  main: '适合亚马逊主图位，重点是白底、全貌、主体清晰和合规展示。',
  feature: '围绕当前图片最重要的购买理由做转化表达，可承载多个强相关卖点，但不要杂乱。',
  scenario: '把产品放进真实使用环境，用场景证明卖点和使用价值，而不是只做氛围图。',
  detail: '放大展示材质、结构、纹理、做工或关键细节，强化真实质感。',
  dimensions: '清晰表达尺寸、容量、比例关系、适配空间或参照物。',
  steps: '适合讲解安装步骤、使用动作或操作流程，强调顺序清晰。',
  comparison: '用真实对比突出产品优势，适合前后对比、普通款与升级款对比。',
  package: '用于说明包装内容、套装数量、随货配件和到手清单。',
  summary: '用于补充礼品属性、信任感、多场景总结或综合购买理由。'
}

export const MAIN_IMAGE_FIXED_RULE = `【目的】提升点击率（CTR）
【构图】产品完整展示，主体占画面约 85%，居中摆放。
【背景】纯白背景（RGB 255,255,255）。
【文字】无文字。
【Logo】无 Logo（除产品本身自带品牌）。
【元素】除产品及产品标配配件外，不添加任何装饰元素。
【要求】突出产品主体，边缘清晰，光线自然，阴影真实，符合 Amazon 主图规范。`

const TASK_PLACEHOLDERS = {
  main: [
    MAIN_IMAGE_FIXED_RULE,
    '【补充示例】希望略带真实落地阴影；标配配件与产品一起整齐展示；不要裁切产品任何边缘。'
  ],
  feature: [
    '【购买理由】填写这张图最想证明的购买理由，可包含多个强相关卖点',
    '【画面方式】局部特写 / 放大结构 / 图标标注 / 功能演示 / 真实使用证明',
    '【避免】信息不要杂乱，避免背景和文案抢主体'
  ],
  scenario: [
    '【使用场景】填写真实使用环境，例如花园、厨房、卧室、车内、露台',
    '【画面重点】产品自然融入场景，并且要证明真实使用方式或卖点价值',
    '【避免】场景过假、人物抢主体、产品比例失真'
  ],
  detail: [
    '【细节重点】填写材质 / 做工 / 纹理 / 接缝 / 结构亮点',
    '【画面方式】近景特写，突出真实质感和工艺细节',
    '【避免】不要把细节做得像换了材质或改了产品本体'
  ],
  dimensions: [
    '【展示内容】填写长宽高 / 容量 / 适配空间 / 参照物',
    '【画面方式】清晰标注尺寸和比例关系，方便买家快速判断大小',
    '【避免】不要把尺寸信息堆得太乱，参照物必须真实合理'
  ],
  steps: [
    '【步骤顺序】填写第 1 步 / 第 2 步 / 第 3 步的关键动作',
    '【画面方式】分步展示安装或使用流程，动作清晰、顺序明确',
    '【避免】不要跳步骤，不要一张图塞满大段说明'
  ],
  comparison: [
    '【对比对象】填写竞品对比 / 使用前后 / 普通款 vs 升级款',
    '【画面重点】突出真实差异点和结果，差别要一眼看懂',
    '【避免】不要虚构竞品缺陷，不要夸大不存在的能力'
  ],
  package: [
    '【到手内容】填写主产品、配件、数量、包装形式',
    '【画面方式】平铺展示或整齐陈列，清楚告诉买家会收到什么',
    '【避免】不要加入未确认配件，不要把包装图做成卖点图'
  ],
  summary: [
    '【收尾重点】填写礼品属性 / 信任补充 / 多场景总结 / 综合购买理由',
    '【画面方式】用更轻的信息做总结，帮助买家收束决策',
    '【避免】不要重复前面已经讲清的主卖点和尺寸信息'
  ]
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
        blueprint: TASK_BLUEPRINTS[option.type] || '',
        placeholder: TASK_PLACEHOLDERS[option.type]?.join('\n') || ''
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
    const hasPromptValue = existing && Object.prototype.hasOwnProperty.call(existing, 'prompt')
    const hasPlaceholderValue = existing && Object.prototype.hasOwnProperty.call(existing, 'placeholder')

    return {
      id: index + 1,
      name: task.name,
      taskType: task.taskType,
      taskKey: task.taskKey,
      type: task.taskType,
      imageRole: existing?.imageRole || '',
      sellingFocus: existing?.sellingFocus || existing?.primarySellingPoint || '',
      blueprint: task.blueprint,
      purpose: task.description,
      executionRules: existing?.executionRules || existing?.constraints || [],
      copy: existing?.copy || [],
      strategyContent:
        existing?.strategyContent ||
        existing?.strategyBody ||
        (hasPromptValue ? existing.prompt : task.taskType === 'main' ? MAIN_IMAGE_FIXED_RULE : ''),
      placeholder: hasPlaceholderValue ? existing.placeholder : task.placeholder,
      promptEn: existing?.promptEn || '',
      promptDirty: existing?.promptDirty || false
    }
  })
}

export function getTaskLabel(taskType) {
  return IMAGE_TASK_OPTIONS.find((option) => option.type === taskType)?.label || '图片任务'
}
