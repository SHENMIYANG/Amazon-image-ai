/**
 * Amazon Listing 图片营销策略库 V2.0
 * 
 * 核心理念：
 * - 不是按"行业"分类，而是按"营销策略"分类
 * - AI 先判断最适合哪种策略，再生成对应的 7 张图
 * - 支持主策略 + 辅策略组合
 * - 支持 L1/L2/L3 复杂度控制出图成本
 */

const STRATEGY_LIBRARY = {
  // ============================================================
  // 🟢 Strategy A｜Basic（通用基础型）
  // 定位：最通用、适用于绝大多数产品
  // 视觉风格：白底 + 浅灰背景、简洁干净、高产品占比、蓝色点缀、信息适中
  // ============================================================
  basic: {
    id: 'basic',
    name: '通用基础型',
    icon: '🎯',
    color: '#4CAF50',
    description: '最通用的策略，适合大多数产品',
    suitableFor: ['收纳用品', '厨房用品', '五金工具', '汽车用品', '宠物用品', '园艺用品', '小家电'],
    visualStyle: {
      background: '白底 + 浅灰背景',
      mood: '简洁干净',
      productRatio: '高产品占比 (80%+)',
      accentColor: '蓝色点缀',
      infoDensity: '信息适中',
      colorScheme: 'white, light gray, blue accent'
    },
    framework: [
      {
        id: 1,
        type: 'main',
        name: '白底主图',
        purpose: '提升 CTR',
        content: '产品完整展示，符合亚马逊规范',
        requirements: ['PURE WHITE BACKGROUND', '无文字', '无水印', '无 props', '专业打光']
      },
      {
        id: 2,
        type: 'hero-feature',
        name: '核心卖点第一印象',
        purpose: '最大卖点 + 使用场景',
        content: '1 个核心卖点与场景融合展示',
        requirements: ['场景化', '1 个卖点标题', '简洁排版']
      },
      {
        id: 3,
        type: 'features',
        name: '功能介绍',
        purpose: '建立认知',
        content: '3-5 个核心功能图标/列表',
        requirements: ['图标化', '简短文字', '清晰布局']
      },
      {
        id: 4,
        type: 'specs',
        name: '尺寸参数',
        purpose: '降低退货率',
        content: '尺寸、重量、规格标注',
        requirements: ['三面尺寸', '对比参照物', '清晰数字']
      },
      {
        id: 5,
        type: 'material',
        name: '材质细节',
        purpose: '建立品质感',
        content: '材质、工艺特写',
        requirements: ['微距拍摄', '纹理可见', '光影突出']
      },
      {
        id: 6,
        type: 'scenes',
        name: '多场景应用',
        purpose: '激发购买欲',
        content: '不同使用环境展示',
        requirements: ['3-4 场景', '真实使用', '温暖光线']
      },
      {
        id: 7,
        type: 'summary',
        name: '综合总结',
        purpose: '提升转化率',
        content: '配件、包装、生活方式或卖点总结',
        requirements: ['情感连接', '完整感', '行动召唤']
      }
    ]
  },

  // ============================================================
  // 🔵 Strategy B｜Feature Focus（卖点强化型）
  // 定位：功能卖点驱动，突出产品优势
  // 视觉风格：大标题、大图标、强对比、箭头标注、产品主体突出
  // ============================================================
  featureFocus: {
    id: 'featureFocus',
    name: '卖点强化型',
    icon: '🔥',
    color: '#FF5722',
    description: '功能卖点驱动，突出产品优势',
    suitableFor: ['工具', '健身器材', '汽车用品', '宠物用品', '户外用品', '厨房工具'],
    visualStyle: {
      background: '浅色渐变背景',
      mood: '强力冲击',
      productRatio: '中等产品占比 (60-70%)',
      accentColor: '橙色/红色强对比',
      infoDensity: '信息密集',
      colorScheme: 'orange, red, high contrast'
    },
    framework: [
      {
        id: 1, type: 'main', name: '白底主图',
        purpose: '符合亚马逊规范', content: '产品完整展示',
        requirements: ['PURE WHITE BACKGROUND', '无文字', '无水印', '无 props']
      },
      {
        id: 2, type: 'hero-feature', name: '最大卖点（Hero Feature）',
        purpose: '第一眼抓住注意力', content: '最大卖点大标题 + 产品主体 + 强调效果',
        requirements: ['超大标题', '粗体字', '箭头指向']
      },
      {
        id: 3, type: 'features', name: '4-6 个核心卖点图标展示',
        purpose: '全面了解优势', content: '编号圆圈 + 彩色图标 + 加粗名称 + 简短描述',
        requirements: ['垂直排列', '左侧图标右侧文字', '彩色区分']
      },
      {
        id: 4, type: 'comparison', name: '使用前后对比 / Our vs Others',
        purpose: '证明优势', content: 'Before/After 或 对比表格',
        requirements: ['左右分割', '绿勾红叉', '数据支撑']
      },
      {
        id: 5, type: 'steps', name: '使用步骤或安装流程',
        purpose: '降低使用门槛', content: 'Step 1-2-3-4 编号流程',
        requirements: ['编号圆圈', '箭头连接', '每步配图']
      },
      {
        id: 6, type: 'scenes', name: '多场景应用',
        purpose: '激发想象', content: '不同环境下的使用',
        requirements: ['真实场景', '人物互动', '多样性']
      },
      {
        id: 7, type: 'trust', name: '品牌优势 / 套装内容 / 售后保障',
        purpose: '建立信任促成下单', content: '认证标志、配件清单、保修信息',
        requirements: ['信任徽章', '清单式', '保障承诺']
      }
    ]
  },

  // ============================================================
  // 🟣 Strategy C｜Infographic（信息图型）
  // 定位：参数丰富、数据导向
  // 视觉风格：信息密度高、图标化设计、表格、数据可视化、蓝灰科技配色
  // ============================================================
  infographic: {
    id: 'infographic',
    name: '信息图型',
    icon: '📊',
    color: '#2196F3',
    description: '参数丰富、数据导向，最像 Linkfox 风格',
    suitableFor: ['数码产品', '工具', '小家电', '运动器材', '汽车用品'],
    visualStyle: {
      background: '白色/浅灰网格',
      mood: '专业严谨',
      productRatio: '中等产品占比 (50-60%)',
      accentColor: '蓝灰科技配色',
      infoDensity: '信息密度极高',
      colorScheme: 'blue, gray, tech tones'
    },
    framework: [
      {
        id: 1, type: 'main', name: '白底主图',
        purpose: '符合亚马逊规范', content: '产品完整展示',
        requirements: ['PURE WHITE BACKGROUND', '无文字', '无水印', '无 props']
      },
      {
        id: 2, type: 'feature-overview', name: '卖点总览（4-6 个卖点）',
        purpose: '一目了然所有优势', content: 'LARGE BOLD TITLE + 垂直排列的卖点列表',
        requirements: ['大标题', '编号圆圈', '彩色图标', '短文案']
      },
      {
        id: 3, type: 'specs-table', name: '参数规格表',
        purpose: '详细技术参数', content: '尺寸、重量、材质、颜色、配件等规格表格',
        requirements: ['表格/网格', '图标+标签+数值', '清晰对齐']
      },
      {
        id: 4, type: 'comparison', name: 'Our Product vs Others',
        purpose: '差异化竞争', content: '左边我们的优势(绿勾) vs 别人的劣势(红叉)',
        requirements: ['左右对比', '视觉符号', '加粗差异点']
      },
      {
        id: 5, type: 'steps', name: '使用步骤（Step 1-4）',
        purpose: '教育用户', content: '编号面板 + 图片 + 说明文字 + 流程箭头',
        requirements: ['水平/垂直流程', '每步独立框', '箭头连接']
      },
      {
        id: 6, type: 'scene-grid', name: '场景拼贴（2×2）',
        purpose: '展示多功能性', content: '4 个场景等分网格，每个有小标签',
        requirements: ['2x2 网格', '白色边框', '底部标签']
      },
      {
        id: 7, type: 'trust', name: '认证、保修、售后、品质保证',
        purpose: '建立信任', content: '认证标志 + 保修期 + 客服信息 + "100% Satisfaction"',
        requirements: ['图标矩阵', '保障文案', '专业可信']
      }
    ]
  },

  // ============================================================
  // 🟠 Strategy D｜Lifestyle（生活方式型）
  // 定位：场景和情绪价值驱动
  // 视觉风格：暖色调、自然光、真人出镜、家庭氛围、留白较多
  // ============================================================
  lifestyle: {
    id: 'lifestyle',
    name: '生活方式型',
    icon: '🏡',
    color: '#FF9800',
    description: '场景和情绪价值驱动',
    suitableFor: ['家居用品', '宠物用品', '美妆', '香薰', '母婴', '户外用品'],
    visualStyle: {
      background: '真实家居/户外环境',
      mood: '温馨舒适',
      productRatio: '中等产品占比 (40-50%)',
      accentColor: '暖色调（橙/黄/米）',
      infoDensity: '信息较少，重氛围',
      colorScheme: 'warm tones, orange, yellow, beige'
    },
    framework: [
      {
        id: 1, type: 'main', name: '白底主图',
        purpose: '符合亚马逊规范', content: '产品完整展示',
        requirements: ['PURE WHITE BACKGROUND', '无文字', '无水印', '无 props']
      },
      {
        id: 2, type: 'lifestyle-hero', name: '真人使用场景',
        purpose: '情感代入', content: '真人自然使用产品的瞬间 + 温暖光线',
        requirements: ['真人出镜', '自然表情', '生活化场景']
      },
      {
        id: 3, type: 'scene-collage', name: '多生活场景拼贴',
        purpose: '展示多功能性', content: '家/办公室/户外/旅行 4 格拼贴',
        requirements: ['4 格拼接', '统一色调', '"Perfect for Every Moment"']
      },
      {
        id: 4, type: 'detail-shot', name: '材质细节特写',
        purpose: '品质感知', content: '面料/材质微距 + "Premium Quality Craftsmanship"',
        requirements: ['微距镜头', '柔光', '纹理清晰']
      },
      {
        id: 5, type: 'size-compare', name: '尺寸与日常物品对比',
        purpose: '空间感知', content: '手/手机/硬币/饮料罐对比 + 尺寸标签',
        requirements: ['常见参照物', '测量线', '清晰数值']
      },
      {
        id: 6, type: 'unboxing', name: '开箱展示 + 配件',
        purpose: '价值感知', content: '精美包装 + 全部配件整齐排列',
        requirements: ['俯拍角度', '整齐排列', '"Complete Package"']
      },
      {
        id: 7, type: 'emotional', name: '情感化生活方式画面',
        purpose: '最终转化', content: '梦想生活场景 + 产品自然融入',
        requirements: ['电影级构图', '自然光', '"Elevate Your Lifestyle"']
      }
    ]
  },

  // ============================================================
  // ⚙️ Strategy E｜Technical（科技数码型）
  // 定位：科技感、性能展示
  // 视觉风格：深色背景、蓝色科技光效、HUD/UI 元素、金属质感、爆炸图
  // ============================================================
  technical: {
    id: 'technical',
    name: '科技数码型',
    icon: '💻',
    color: '#9C27B0',
    description: '科技感、性能展示',
    suitableFor: ['电子产品', '手机配件', '耳机', '键盘', '鼠标', '充电器', '智能设备'],
    visualStyle: {
      background: '深色/黑色背景 + 蓝色光效',
      mood: '未来科技',
      productRatio: '中等产品占比 (60%)',
      accentColor: '蓝色/紫色霓虹',
      infoDensity: '技术参数丰富',
      colorScheme: 'dark blue, purple, neon glow'
    },
    framework: [
      {
        id: 1, type: 'main', name: '白底主图',
        purpose: '符合亚马逊规范', content: '产品完整展示',
        requirements: ['PURE WHITE BACKGROUND', '无文字', '无水印', '无 props']
      },
      {
        id: 2, type: 'tech-features', name: 'Advanced Features',
        purpose: '技术亮点', content: '"Advanced Features" 大标题 + 4 功能箭头标注',
        requirements: ['科技蓝配色', '现代图标', 'Roboto 字体', 'HUD 元素']
      },
      {
        id: 3, type: 'tech-specs', name: '技术规格表',
        purpose: '性能参数', content: '性能/连接/电池/兼容性网格',
        requirements: ['数据可视化', '蓝灰配色', '精确数值']
      },
      {
        id: 4, type: 'exploded-view', name: '内部结构 / 爆炸图',
        purpose: '工程品质', content: '剖面图/分解图 + 关键部件标注',
        requirements: ['工程绘图风', '线条标注', '"Engineering Excellence"']
      },
      {
        id: 5, type: 'ui-demo', name: '使用界面展示',
        purpose: '功能演示', content: '产品 UI/屏幕界面 + 功能说明叠加',
        requirements: ['界面截图', '功能标注', '蓝色光晕']
      },
      {
        id: 6, type: 'accessories', name: '配件展示',
        purpose: '完整套装', content: '所有线缆/配件整齐排列 + 清单',
        requirements: ['平铺拍摄', '白底', '"Complete Kit"']
      },
      {
        id: 7, type: 'tech-scene', name: '科技办公 / 游戏场景',
        purpose: '使用场景', content: '现代工作空间/游戏环境中使用',
        requirements: ['RGB 光效', '多屏桌面', '"Perfect for Work & Play"']
      }
    ]
  },

  // ============================================================
  // 🟤 Strategy F｜Premium（高端品牌型）
  // 定位：高客单价产品、品牌质感
  // 视觉风格：极简、高级光影、大留白、少文字、品牌广告大片风格
  // ============================================================
  premium: {
    id: 'premium',
    name: '高端品牌型',
    icon: '✨',
    color: '#212121',
    description: '高客单价产品、品牌质感',
    suitableFor: ['家具', '床垫', '咖啡机', '高端厨具', '美容仪', '智能家居', '高端宠物用品'],
    visualStyle: {
      background: '纯色/渐变高级背景',
      mood: '奢华宁静',
      productRatio: '低产品占比 (30-40%，重氛围)',
      accentColor: '黑金/深蓝/香槟金',
      infoDensity: '极少文字，重意境',
      colorScheme: 'black, gold, champagne, deep blue'
    },
    framework: [
      {
        id: 1, type: 'main', name: '白底主图',
        purpose: '符合亚马逊规范', content: '产品完整展示（极简风格）',
        requirements: ['PURE WHITE BACKGROUND', '无文字', '无水印', '无 props']
      },
      {
        id: 2, type: 'brand-hero', name: '品牌级 Hero Image',
        purpose: '品牌印象', content: '大片级单张，产品 + 高级光影 + 极简构图',
        requirements: ['电影级布光', '大留白', '极简美学']
      },
      {
        id: 3, type: 'craftsmanship', name: '材质与工艺',
        purpose: '价值感知', content: '材质拼接/表面处理/手工细节',
        requirements: ['微距特写', '光影层次', '触感传达']
      },
      {
        id: 4, type: 'lifestyle-premium', name: '生活方式大片',
        purpose: '向往感', content: '高端生活环境中的产品融入',
        requirements: ['杂志大片风', '自然光', '情绪氛围']
      },
      {
        id: 5, type: 'macro-detail', name: '产品细节微距',
        purpose: '精致感', content: '关键细节的极致特写',
        requirements: ['极端微距', '景深虚化', '质感呈现']
      },
      {
        id: 6, type: 'space-context', name: '尺寸与空间搭配',
        purpose: '空间感知', content: '在真实房间中的比例参考',
        requirements: ['广角透视', '家具参照', '空间感']
      },
      {
        id: 7, type: 'aspirational', name: '高端生活场景收尾',
        purpose: '终极向往', content: '梦想生活方式 + 产品作为主角',
        requirements: ['黄金时刻光线', '电影构图', '情感共鸣']
      }
    ]
  },

  // ============================================================
  // 👗 Strategy G｜Fashion（时尚服饰型）
  // 定位：穿搭、美感、版型展示
  // 视觉风格：杂志大片、自然光、高级灰、模特展示、时尚排版
  // ============================================================
  fashion: {
    id: 'fashion',
    name: '时尚服饰型',
    icon: '👗',
    color: '#E91E63',
    description: '穿搭、美感、版型展示',
    suitableFor: ['服装', '鞋子', '帽子', '包包', '配饰', '珠宝'],
    visualStyle: {
      background: '纯色/简约室内/街拍场景',
      mood: '时尚潮流',
      productRatio: '中高产品占比 (70%)',
      accentColor: '高级灰/莫兰迪色',
      infoDensity: '适中，重美感',
      colorScheme: 'gray, morandi tones, neutral'
    },
    framework: [
      {
        id: 1, type: 'main', name: '白底主图 / 平铺图',
        purpose: '符合亚马逊规范', content: '产品完整展示（平铺或挂拍）',
        requirements: ['PURE WHITE BACKGROUND', '无文字', '无水印', '无 props']
      },
      {
        id: 2, type: 'model-wear', name: '模特穿搭图',
        purpose: '上身效果', content: '模特穿着展示整体造型',
        requirements: ['全身/半身', '自然姿态', '时尚背景']
      },
      {
        id: 3, type: 'fabric-detail', name: '面料特写',
        purpose: '材质感知', content: '面料纹理/编织/印花细节',
        requirements: ['微距拍摄', '纹理清晰', '"Premium Fabric Detail"']
      },
      {
        id: 4, type: 'size-guide', name: '尺码指南',
        purpose: '降低退货', content: '尺码表 + 身高体重推荐 + 试穿对比',
        requirements: ['清晰表格', '身材参考', '合身度说明']
      },
      {
        id: 5, type: 'craftsmanship', name: '工艺细节',
        purpose: '品质感知', content: '缝线/拉链/纽扣/印花等工艺特写',
        requirements: ['细节放大', '工艺标注', '"Craftsmanship Details"']
      },
      {
        id: 6, type: 'multi-angle', name: '多角度展示',
        purpose: '全面了解', content: '前/侧/背/细节多角度 OR 动态效果',
        requirements: ['多视角', '一致性光线', '完整轮廓']
      },
      {
        id: 7, type: 'lookbook', name: 'Lookbook 风格收尾',
        purpose: '搭配灵感', content: '完整穿搭 Lookbook + 配饰建议',
        requirements: ['杂志排版', '搭配建议', '"Styling Tips"']
      }
    ]
  }
}

// ============================================================
// 复杂度级别定义（控制出图成本）
// ============================================================

const COMPLEXITY_LEVELS = {
  L1: {
    id: 'L1',
    name: '极速版',
    icon: '⚡',
    description: '简单白底 + 基础信息，适合低价铺货',
    cost: '低',
    imageCount: 7,
    features: [
      '首图：标准白底主图',
      '副图 2-3：基础卖点 + 尺寸',
      '副图 4-7：简化版（白底 + 简短文字）',
      '无场景图',
      '无信息图',
      '生成速度快'
    ]
  },
  L2: {
    id: 'L2',
    name: '标准版',
    icon: '📋',
    description: '场景 + 卖点 + 尺寸，适合大多数 SKU',
    cost: '中',
    imageCount: 7,
    features: [
      '首图：标准白底主图',
      '副图 2-3：卖点展示 + 功能介绍',
      '副图 4：尺寸参数',
      '副图 5-6：场景图',
      '副图 7：综合总结',
      '平衡质量和成本'
    ]
  },
  L3: {
    id: 'L3',
    name: '精品版',
    icon: '🏆',
    description: '加入信息图、对比图、情绪化场景，适合重点推广产品',
    cost: '高',
    imageCount: 7,
    features: [
      '首图：高质量白底主图',
      '副图 2-3：详细卖点 + 参数表格',
      '副图 4：对比图/爆炸图',
      '副图 5-6：高品质场景图',
      '副图 7：情感化/品牌级收尾',
      '最高质量输出'
    ]
  }
}

// ============================================================
// AI 策略选择规则
// ============================================================

const STRATEGY_SELECTION_RULES = [
  // 单策略匹配
  { condition: '通用商品', strategy: 'basic' },
  { condition: '功能型商品', strategy: 'featureFocus' },
  { condition: '参数较多', strategy: 'infographic' },
  { condition: '家居/宠物/母婴', strategy: 'lifestyle' },
  { condition: '数码电子', strategy: 'technical' },
  { condition: '高客单价', strategy: 'premium' },
  { condition: '服饰鞋包', strategy: 'fashion' },
  
  // 组合策略示例
  { condition: '智能空气炸锅', strategy: 'technical + lifestyle' },
  { condition: '记忆棉床垫', strategy: 'premium + lifestyle' },
  { condition: '电动螺丝刀', strategy: 'technical + featureFocus' },
  { condition: '宠物饮水机', strategy: 'lifestyle + infographic' },
  { condition: '收纳箱', strategy: 'basic + lifestyle' }
]

export {
  STRATEGY_LIBRARY,
  COMPLEXITY_LEVELS,
  STRATEGY_SELECTION_RULES
}
