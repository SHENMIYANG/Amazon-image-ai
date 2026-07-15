import './TemplateSelector.css'

const strategies = [
  {
    key: 'basic',
    name: '通用基础型',
    icon: '🎯',
    shortName: 'Basic',
    description: '最通用，适合大多数普通商品。',
    suitableFor: '收纳、厨房、五金、小家电、宠物、园艺等',
    visualStyle: '简洁干净，产品主体突出，信息均衡',
    features: ['白底主图', '核心卖点', '功能说明', '尺寸参数', '材质细节', '多场景', '补充总结'],
    color: '#4CAF50',
    complexitySupport: ['L1', 'L2', 'L3']
  },
  {
    key: 'featureFocus',
    name: '卖点强化型',
    icon: '🔥',
    shortName: 'Feature',
    description: '适合功能卖点清晰、需要快速说服用户的商品。',
    suitableFor: '工具、户外、汽配、功能型家居、健身器材等',
    visualStyle: '标题突出，图标清晰，卖点集中，视觉冲击更强',
    features: ['Hero 卖点', '卖点图标', '前后对比', '步骤说明', '多场景'],
    color: '#FF5722',
    complexitySupport: ['L2', 'L3']
  },
  {
    key: 'infographic',
    name: '信息图型',
    icon: '📊',
    shortName: 'Infographic',
    description: '适合参数较多、需要可视化说明的商品。',
    suitableFor: '数码、工具、小家电、汽配、运动器材等',
    visualStyle: '信息密度高，参数清晰，模块化布局明显',
    features: ['卖点总览', '参数表格', '对比图', '使用步骤', '场景拼图'],
    color: '#2196F3',
    complexitySupport: ['L2', 'L3']
  },
  {
    key: 'lifestyle',
    name: '生活场景型',
    icon: '🏡',
    shortName: 'Lifestyle',
    description: '适合强调真实使用环境和生活体验的商品。',
    suitableFor: '家居、灯具、装饰、园艺、宠物家居、卫浴、厨房等',
    visualStyle: '自然光，真实环境，生活代入感强',
    features: ['场景主图', '使用效果', '细节特写', '空间比例', '生活收尾图'],
    color: '#FF9800',
    complexitySupport: ['L2', 'L3']
  },
  {
    key: 'technical',
    name: '科技性能型',
    icon: '💻',
    shortName: 'Technical',
    description: '适合电子、智能设备和强调性能的产品。',
    suitableFor: '电子产品、配件、耳机、充电器、智能设备等',
    visualStyle: '科技感强，参数和结构表达更清楚',
    features: ['技术亮点', '规格信息', '结构示意', '界面演示', '配件清单'],
    color: '#9C27B0',
    complexitySupport: ['L2', 'L3']
  },
  {
    key: 'premium',
    name: '高端质感型',
    icon: '✨',
    shortName: 'Premium',
    description: '适合高客单价产品，突出高级感和品质感。',
    suitableFor: '高端家居、床垫、厨具、美容仪、智能家居等',
    visualStyle: '极简留白，光影高级，广告大片感强',
    features: ['品牌级 Hero', '材质工艺', '高级生活方式', '微距细节', '高端收尾'],
    color: '#212121',
    complexitySupport: ['L3']
  },
  {
    key: 'fashion',
    name: '时尚展示型',
    icon: '👗',
    shortName: 'Fashion',
    description: '适合服饰、鞋包、配件等强调穿搭展示的商品。',
    suitableFor: '服装、鞋子、包袋、配饰、珠宝等',
    visualStyle: '模特展示，杂志感排版，搭配氛围强',
    features: ['模特穿搭', '面料特写', '尺码指南', '工艺细节', 'Lookbook'],
    color: '#E91E63',
    complexitySupport: ['L2', 'L3']
  }
]

const COMPLEXITY_LEVELS = [
  {
    id: 'L1',
    name: 'L1 极速版',
    icon: '⚡',
    desc: '白底和基础信息为主，适合低价铺货快速出图。',
    cost: '低'
  },
  {
    id: 'L2',
    name: 'L2 标准版',
    icon: '📋',
    desc: '场景、卖点、尺寸兼顾，适合大多数 SKU。',
    cost: '中',
    default: true
  },
  {
    id: 'L3',
    name: 'L3 精品版',
    icon: '🏆',
    desc: '信息图、对比图、情绪化场景更完整，适合重点款。',
    cost: '高'
  }
]

export default function TemplateSelector({
  selectedType,
  onSelect,
  hasGeneratedPlans,
  selectedComplexity,
  onComplexityChange
}) {
  const selectedStrategy = strategies.find((strategy) => strategy.key === selectedType)

  const handleSelect = (strategyKey) => {
    if (hasGeneratedPlans && selectedType !== strategyKey) {
      const confirmed = window.confirm(
        '切换策略会覆盖当前已经生成的 7 张图规划，确定继续吗？\n\n点击“确定”切换\n点击“取消”保留当前策略'
      )
      if (!confirmed) return
    }

    onSelect(strategyKey)
  }

  return (
    <div className="template-selector">
      <div className="template-selector-header">
        <label>🎯 选择图片营销策略</label>
        <span className="help-text">
          这里选的是整套图片的表达方式，不是产品类目。AI 分析时会基于当前策略，补全 7 张图的规划内容。
        </span>
      </div>

      <div className="template-grid strategy-grid">
        {strategies.map((strategy) => {
          const isSupported =
            !selectedComplexity ||
            (strategy.complexitySupport || ['L1', 'L2', 'L3']).includes(selectedComplexity)

          return (
            <div
              key={strategy.key}
              className={`template-card ${selectedType === strategy.key ? 'active' : ''} ${!isSupported ? 'disabled' : ''}`}
              onClick={() => isSupported && handleSelect(strategy.key)}
              title={!isSupported ? `该策略不支持 ${selectedComplexity}` : ''}
            >
              <div className="template-preview">
                <div
                  className="template-preview-placeholder"
                  style={{ background: `${strategy.color}15` }}
                >
                  <span className="placeholder-icon">{strategy.icon}</span>
                  <span className="placeholder-text" style={{ color: strategy.color }}>
                    {strategy.shortName}
                  </span>
                </div>
              </div>

              <div className="template-card-content">
                <div className="template-card-header">
                  <span className="template-icon">{strategy.icon}</span>
                  <h4>{strategy.name}</h4>
                </div>
                <p className="template-description">{strategy.description}</p>

                <div className="suitable-for">
                  <small>📦 适合: {strategy.suitableFor}</small>
                </div>

                <div className="visual-style-tag">
                  <small>🎨 视觉特点: {strategy.visualStyle}</small>
                </div>

                {strategy.features && (
                  <div className="template-features">
                    {strategy.features.slice(0, 5).map((feature, idx) => (
                      <span key={idx} className="feature-tag">
                        {feature}
                      </span>
                    ))}
                    {strategy.features.length > 5 && (
                      <span className="feature-tag more">+{strategy.features.length - 5}</span>
                    )}
                  </div>
                )}
              </div>

              {selectedType === strategy.key && (
                <div className="selected-indicator">
                  <span className="checkmark">✓</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="complexity-selector">
        <label>⚙️ 出图复杂度</label>
        <p className="help-text">控制出图成本和细节强度，铺货常用 L1 / L2，重点款更适合 L3。</p>

        <div className="complexity-options">
          {COMPLEXITY_LEVELS.map((level) => {
            const isDisabled =
              selectedStrategy && !selectedStrategy.complexitySupport.includes(level.id)

            return (
              <button
                key={level.id}
                className={`complexity-btn ${selectedComplexity === level.id ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                onClick={() => !isDisabled && onComplexityChange?.(level.id)}
                disabled={isDisabled}
                title={isDisabled ? `当前策略不支持 ${level.name}` : level.desc}
              >
                <span className="complexity-icon">{level.icon}</span>
                <span className="complexity-name">{level.name}</span>
                <span className="complexity-cost">成本: {level.cost}</span>
                <span className="complexity-desc">{level.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="ai-recommendation-hint">
        <span>💡 提示:</span> 先选好你想要的策略，再点 AI 分析，系统会基于当前策略补全 7 张图的规划和文案。
      </div>
    </div>
  )
}
