const STRATEGY_LIBRARY = {
  basic: {
    id: 'basic',
    name: '通用基础型',
    icon: '\u{1F3AF}',
    color: '#4CAF50',
    description: '最通用的策略，适合大多数普通商品。',
    suitableFor: ['收纳用品', '厨房用品', '五金工具', '汽车用品', '宠物用品', '园艺用品', '小家电'],
    visualStyle: {
      background: 'clean e-commerce background adapted to the real product color, material, and usage scene',
      mood: 'clean, practical, conversion-focused',
      productRatio: 'high product coverage',
      infoDensity: 'balanced information density',
      paletteRule: 'adapt to the real product instead of forcing a fixed template color'
    },
    framework: [
      { id: 1, type: 'main', name: '白底主图', purpose: '提升点击率', content: '完整展示产品全貌，符合亚马逊主图规范', requirements: ['纯白背景', '无文案', '无水印', '无无关道具', '产品完整'] },
      { id: 2, type: 'hero-feature', name: '核心卖点图', purpose: '快速建立购买理由', content: '用一个核心卖点带动画面理解', requirements: ['场景化', '卖点标题清楚', '产品仍是主体'] },
      { id: 3, type: 'features', name: '功能说明图', purpose: '帮助理解功能', content: '展示主要功能或使用步骤', requirements: ['图标清楚', '信息简洁', '层级清晰'] },
      { id: 4, type: 'specs', name: '尺寸参数图', purpose: '减少尺寸误判', content: '展示尺寸、重量、容量、结构或参照物', requirements: ['数字清楚', '比例明确', '可快速阅读'] },
      { id: 5, type: 'material', name: '材质细节图', purpose: '建立品质感', content: '展示材质纹理、结构做工和耐用细节', requirements: ['细节特写', '真实纹理', '光线自然'] },
      { id: 6, type: 'scenes', name: '多场景应用图', purpose: '扩大使用想象', content: '展示不同场景或不同用途', requirements: ['真实场景', '用途明确', '不喧宾夺主'] },
      { id: 7, type: 'summary', name: '补充总结图', purpose: '补齐转化信息', content: '包装内容、礼品属性、补充卖点或生活方式总结', requirements: ['信息补完', '画面收尾', '增强信任感'] }
    ]
  },
  featureFocus: {
    id: 'featureFocus',
    name: '卖点强化型',
    icon: '\u{1F525}',
    color: '#FF5722',
    description: '适合功能卖点明确，需要强表达的产品。',
    suitableFor: ['工具', '健身器材', '汽车用品', '户外用品', '功能型家居', '厨房工具'],
    visualStyle: {
      background: 'high-contrast sales-oriented layout adapted to the product',
      mood: 'direct, strong, persuasive',
      productRatio: 'medium to high product coverage',
      infoDensity: 'medium-high information density',
      paletteRule: 'allow stronger contrast while keeping the product truthful and readable'
    },
    framework: [
      { id: 1, type: 'main', name: '白底主图', purpose: '符合主图规范', content: '完整展示产品', requirements: ['纯白背景', '无文案', '无无关元素'] },
      { id: 2, type: 'hero-feature', name: 'Hero 卖点图', purpose: '第一眼抓住注意力', content: '围绕最强卖点做大标题表达', requirements: ['大标题', '重点清晰', '产品主体突出'] },
      { id: 3, type: 'features', name: '卖点拆解图', purpose: '把优势讲透', content: '列出 4 到 6 个核心卖点', requirements: ['层级清晰', '图标辅助', '文字简洁'] },
      { id: 4, type: 'comparison', name: '前后对比图', purpose: '证明价值差异', content: '使用前后或我方与他方对比', requirements: ['左右分区', '差异明确', '不要虚构数据'] },
      { id: 5, type: 'steps', name: '步骤说明图', purpose: '降低使用门槛', content: '展示安装、使用或操作流程', requirements: ['流程清楚', '步骤编号', '配图说明'] },
      { id: 6, type: 'scenes', name: '场景应用图', purpose: '延展用途', content: '展示产品在不同环境中的使用', requirements: ['真实环境', '用途明确', '产品可见'] },
      { id: 7, type: 'trust', name: '信任补强图', purpose: '增强下单信心', content: '展示套装、售后、保障或补充卖点', requirements: ['补全信息', '提高信任感', '不堆砌假认证'] }
    ]
  },
  infographic: {
    id: 'infographic',
    name: '信息图型',
    icon: '\u{1F4CA}',
    color: '#2196F3',
    description: '适合参数较多、说明复杂、需要可视化的产品。',
    suitableFor: ['数码产品', '工具', '小家电', '运动器材', '汽车用品'],
    visualStyle: {
      background: 'professional infographic layout adapted to the product',
      mood: 'clear, informative, professional',
      productRatio: 'medium product coverage',
      infoDensity: 'high information density',
      paletteRule: 'use structured information blocks without forcing a fixed color template'
    },
    framework: [
      { id: 1, type: 'main', name: '白底主图', purpose: '符合主图规范', content: '完整展示产品', requirements: ['纯白背景', '无文案', '无无关元素'] },
      { id: 2, type: 'feature-overview', name: '卖点总览图', purpose: '快速扫读全局', content: '集中展示多条核心卖点', requirements: ['标题清晰', '模块分明', '信息不混乱'] },
      { id: 3, type: 'specs-table', name: '参数表格图', purpose: '说明关键规格', content: '尺寸、材质、容量、重量、配件等', requirements: ['表格式布局', '字段清楚', '便于阅读'] },
      { id: 4, type: 'comparison', name: '对比图', purpose: '建立差异认知', content: '展示我方和其他方案的差异', requirements: ['结构清楚', '差异点明确', '不虚构认证'] },
      { id: 5, type: 'steps', name: '步骤图', purpose: '教学说明', content: '分步骤说明安装或使用方法', requirements: ['编号顺序', '说明简洁', '视觉流畅'] },
      { id: 6, type: 'scene-grid', name: '场景拼图', purpose: '补充多用途信息', content: '用拼图展示多个使用场景', requirements: ['画面统一', '标签清楚', '不抢产品主体'] },
      { id: 7, type: 'trust', name: '信任保障图', purpose: '补强信任与售后认知', content: '展示保障、服务或品质承诺', requirements: ['可信表达', '避免假背书', '适合转化收尾'] }
    ]
  },
  lifestyle: {
    id: 'lifestyle',
    name: '生活场景型',
    icon: '\u{1F3E1}',
    color: '#FF9800',
    description: '适合强调真实使用环境和生活体验的产品。',
    suitableFor: ['家具', '收纳用品', '厨房用品', '卫浴用品', '灯具', '装饰品', '宠物家居', '园艺用品', '户外装饰'],
    visualStyle: {
      background: 'real home, garden, patio, bathroom, kitchen, porch, or room context based on the product',
      mood: 'warm, natural, immersive',
      productRatio: 'medium product coverage',
      infoDensity: 'low to medium information density',
      paletteRule: 'keep the palette natural and rooted in the actual scene and product'
    },
    framework: [
      { id: 1, type: 'main', name: '白底主图', purpose: '符合主图规范', content: '完整展示产品', requirements: ['纯白背景', '无文案', '无无关元素'] },
      { id: 2, type: 'lifestyle-hero', name: '生活场景主图', purpose: '建立代入感', content: '展示产品自然融入真实环境', requirements: ['真实空间', '自然光', '产品可见'] },
      { id: 3, type: 'before-after', name: '使用效果图', purpose: '展示生活改善结果', content: '展示使用前后或使用效果变化', requirements: ['效果直观', '场景真实', '少量说明即可'] },
      { id: 4, type: 'detail-shot', name: '真实细节图', purpose: '说明材质和品质', content: '展示真实使用中的材质、结构、防水、防锈等细节', requirements: ['细节清楚', '真实环境', '避免假特效'] },
      { id: 5, type: 'space-fit', name: '空间比例图', purpose: '帮助判断尺寸适配', content: '展示产品在真实空间中的比例和搭配效果', requirements: ['空间参照', '尺寸可读', '风格自然'] },
      { id: 6, type: 'scene-collage', name: '多场景拼图', purpose: '说明适配范围', content: '拼图展示不同使用环境', requirements: ['多场景统一', '生活感强', '产品不失真'] },
      { id: 7, type: 'emotional', name: '生活方式收尾图', purpose: '强化最终向往感', content: '用舒适、整洁、氛围感画面做收尾', requirements: ['自然氛围', '产品仍清楚', '不过度营销'] }
    ]
  },
  technical: {
    id: 'technical',
    name: '科技性能型',
    icon: '\u{1F4BB}',
    color: '#9C27B0',
    description: '适合电子、智能设备和强调性能的产品。',
    suitableFor: ['电子产品', '手机配件', '耳机', '键鼠', '充电器', '智能设备'],
    visualStyle: {
      background: 'technology-oriented visual language adapted to the product',
      mood: 'modern, precise, performance-driven',
      productRatio: 'medium product coverage',
      infoDensity: 'medium to high information density',
      paletteRule: 'create technical feeling through composition and UI structure rather than a fixed neon palette'
    },
    framework: [
      { id: 1, type: 'main', name: '白底主图', purpose: '符合主图规范', content: '完整展示产品', requirements: ['纯白背景', '无文案', '无无关元素'] },
      { id: 2, type: 'tech-features', name: '技术亮点图', purpose: '展示核心性能优势', content: '拆解关键性能或技术能力', requirements: ['结构清晰', '术语准确', '不要乱写参数'] },
      { id: 3, type: 'tech-specs', name: '规格参数图', purpose: '补全性能说明', content: '展示性能、兼容性、续航、连接等信息', requirements: ['字段清晰', '可视化强', '适合快速阅读'] },
      { id: 4, type: 'exploded-view', name: '结构图', purpose: '强化专业感', content: '展示内部结构、模块或关键部件', requirements: ['逻辑准确', '不虚构部件', '工程感强'] },
      { id: 5, type: 'ui-demo', name: '界面演示图', purpose: '让功能更直观', content: '展示实际使用界面或功能演示', requirements: ['界面清楚', '功能说明明确', '不过度装饰'] },
      { id: 6, type: 'accessories', name: '配件图', purpose: '补充套装价值', content: '展示全部配件和包装内容', requirements: ['平铺整齐', '清单清楚', '适合电商展示'] },
      { id: 7, type: 'tech-scene', name: '使用场景图', purpose: '说明真实使用环境', content: '展示办公、居家或设备环境中的使用方式', requirements: ['环境真实', '产品功能明确', '不喧宾夺主'] }
    ]
  },
  premium: {
    id: 'premium',
    name: '高端质感型',
    icon: '\u2728',
    color: '#212121',
    description: '适合高客单价产品，强调高级感和品牌质感。',
    suitableFor: ['家具', '床垫', '高端厨具', '美容仪', '智能家居', '高端宠物用品'],
    visualStyle: {
      background: 'premium editorial environment adapted to the product category and material',
      mood: 'refined, calm, high-end',
      productRatio: 'lower product coverage with more atmosphere and space',
      infoDensity: 'low text density',
      paletteRule: 'premium feeling should come from lighting, composition, and material expression, not a forced luxury palette'
    },
    framework: [
      { id: 1, type: 'main', name: '白底主图', purpose: '符合主图规范', content: '极简方式展示产品全貌', requirements: ['纯白背景', '无文案', '无无关元素'] },
      { id: 2, type: 'brand-hero', name: '品牌级 Hero 图', purpose: '建立高级印象', content: '用更有广告感的方式拍出产品气质', requirements: ['留白', '高级光影', '构图克制'] },
      { id: 3, type: 'craftsmanship', name: '材质工艺图', purpose: '体现价值感', content: '强调材质、表面处理和做工精度', requirements: ['微距细节', '光影讲究', '触感明确'] },
      { id: 4, type: 'lifestyle-premium', name: '高级生活方式图', purpose: '建立向往感', content: '让产品出现在更高品质的生活环境中', requirements: ['空间高级', '自然真实', '不过度浮夸'] },
      { id: 5, type: 'macro-detail', name: '微距细节图', purpose: '放大精致度', content: '聚焦关键细节、纹理和结构', requirements: ['细节锐利', '质感强', '景深控制好'] },
      { id: 6, type: 'space-context', name: '空间搭配图', purpose: '展示真实搭配效果', content: '展示产品在真实空间中的比例和搭配', requirements: ['空间参照', '气质统一', '产品仍是核心'] },
      { id: 7, type: 'aspirational', name: '高端收尾图', purpose: '强化最后的向往感', content: '用更情绪化、更有品牌感的画面收尾', requirements: ['氛围准确', '不堆文案', '广告感强'] }
    ]
  },
  fashion: {
    id: 'fashion',
    name: '时尚展示型',
    icon: '\u{1F457}',
    color: '#E91E63',
    description: '适合服饰、鞋包、配件等强调穿搭与版型的产品。',
    suitableFor: ['服装', '鞋子', '包袋', '配饰', '珠宝'],
    visualStyle: {
      background: 'fashion editorial setting adapted to the product and target audience',
      mood: 'stylish, clean, aspirational',
      productRatio: 'medium to high product coverage',
      infoDensity: 'medium information density',
      paletteRule: 'keep styling aligned with the actual product color and outfit logic'
    },
    framework: [
      { id: 1, type: 'main', name: '白底主图', purpose: '符合主图规范', content: '完整展示产品或平铺主图', requirements: ['纯白背景', '无文案', '产品完整'] },
      { id: 2, type: 'model-wear', name: '穿搭展示图', purpose: '展示上身或搭配效果', content: '让买家快速理解版型和风格', requirements: ['模特自然', '穿搭合理', '产品重点清楚'] },
      { id: 3, type: 'fabric-detail', name: '面料细节图', purpose: '说明材质质感', content: '展示面料、纹理、缝线和做工', requirements: ['细节清楚', '光线柔和', '不失真'] },
      { id: 4, type: 'style-guide', name: '搭配建议图', purpose: '给出穿搭想象', content: '展示搭配方向、场景或配件灵感', requirements: ['审美统一', '不过度杂乱', '产品仍突出'] },
      { id: 5, type: 'size-guide', name: '尺码指南图', purpose: '减少尺码误判', content: '展示尺码、版型或试穿参考', requirements: ['表格清楚', '信息准确', '易于阅读'] },
      { id: 6, type: 'craftsmanship', name: '工艺细节图', purpose: '说明品质做工', content: '展示拉链、纽扣、接缝、配件等细节', requirements: ['局部放大', '做工清楚', '真实可信'] },
      { id: 7, type: 'lookbook', name: 'Lookbook 收尾图', purpose: '强化整体时尚感', content: '用更完整的穿搭或生活方式画面收尾', requirements: ['风格统一', '有搭配感', '适合提升吸引力'] }
    ]
  }
}

const COMPLEXITY_LEVELS = {
  L1: {
    id: 'L1',
    name: '极速版',
    icon: '\u26A1',
    description: '以白底图和基础信息图为主，适合低价铺货快速出图。',
    cost: '低',
    imageCount: 7,
    features: ['白底主图', '基础卖点图', '简化尺寸说明', '无重场景特效']
  },
  L2: {
    id: 'L2',
    name: '标准版',
    icon: '\u{1F4CB}',
    description: '兼顾卖点、场景、尺寸和细节，适合大多数 SKU。',
    cost: '中',
    imageCount: 7,
    features: ['白底主图', '卖点图', '尺寸图', '场景图', '综合总结图']
  },
  L3: {
    id: 'L3',
    name: '精品版',
    icon: '\u{1F3C6}',
    description: '加入更完整的信息图、对比图和氛围感场景，适合重点款。',
    cost: '高',
    imageCount: 7,
    features: ['高质量主图', '完整卖点信息', '对比或结构图', '高质量场景图', '收尾强化图']
  }
}

const STRATEGY_SELECTION_RULES = [
  { condition: '普通铺货商品', strategy: 'basic' },
  { condition: '功能卖点强的商品', strategy: 'featureFocus' },
  { condition: '参数较多的商品', strategy: 'infographic' },
  { condition: '家居与生活方式商品', strategy: 'lifestyle' },
  { condition: '数码电子商品', strategy: 'technical' },
  { condition: '高客单价商品', strategy: 'premium' },
  { condition: '服饰鞋包商品', strategy: 'fashion' },
  { condition: '智能空气炸锅', strategy: 'technical + lifestyle' },
  { condition: '高端床垫', strategy: 'premium + lifestyle' },
  { condition: '电动工具', strategy: 'technical + featureFocus' },
  { condition: '收纳箱', strategy: 'basic + lifestyle' }
]

export { STRATEGY_LIBRARY, COMPLEXITY_LEVELS, STRATEGY_SELECTION_RULES }
