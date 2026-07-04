import './TemplateSelector.css'

// 策略库 V2.0 - 基于营销策略而非行业分类
const strategies = [
  {
    key: 'basic',
    name: '通用基础型',
    icon: '🎯',
    shortName: 'Basic',
    description: '最通用，适合大多数产品',
    suitableFor: '收纳、厨具、工具、小家电、宠物用品',
    visualStyle: '白底+浅灰、简洁干净、高产品占比、蓝色点缀',
    features: ['白底主图', '核心卖点', '功能介绍', '尺寸参数', '材质细节', '多场景', '综合总结'],
    image: '/templates/basic/example.jpg',
    color: '#4CAF50',
    recommended: true,
    complexitySupport: ['L1', 'L2', 'L3']
  },
  {
    key: 'featureFocus',
    name: '卖点强化型',
    icon: '🔥',
    shortName: 'Feature',
    description: '功能卖点驱动，突出产品优势',
    suitableFor: '工具、健身器材、汽车用品、户外用品、厨房工具',
    visualStyle: '大标题、大图标、强对比、箭头标注、橙色/红色强对比',
    features: ['白底主图', 'Hero 卖点', '卖点图标展示', '使用前后对比', '使用步骤', '多场景', '品牌保障'],
    color: '#FF5722',
    recommended: true,
    complexitySupport: ['L2', 'L3']
  },
  {
    key: 'infographic',
    name: '信息图型',
    icon: '📊',
    shortName: 'Infographic',
    description: '参数丰富、数据导向（最像 Linkfox）',
    suitableFor: '数码产品、工具、小家电、运动器材、汽车用品',
    visualStyle: '信息密度高、图标化设计、表格数据可视化、蓝灰科技配色',
    features: ['白底主图', '卖点总览', '参数规格表', 'Our vs Others', '使用步骤', '场景拼贴', '品质保证'],
    color: '#2196F3',
    recommended: true,
    complexitySupport: ['L2', 'L3']
  },
  {
    key: 'lifestyle',
    name: '生活方式型',
    icon: '🏡',
    shortName: 'Lifestyle',
    description: '场景和情绪价值驱动',
    suitableFor: '家居用品、宠物用品、美妆、香薰、母婴、户外用品',
    visualStyle: '暖色调、自然光、真人出镜、家庭氛围、留白较多',
    features: ['白底主图', '真人使用场景', '生活场景拼贴', '材质细节特写', '尺寸对比', '开箱展示', '情感化画面'],
    color: '#FF9800',
    recommended: false,
    complexitySupport: ['L2', 'L3']
  },
  {
    key: 'technical',
    name: '科技数码型',
    icon: '💻',
    shortName: 'Technical',
    description: '科技感、性能展示',
    suitableFor: '电子产品、手机配件、耳机、键盘、鼠标、充电器、智能设备',
    visualStyle: '深色背景、蓝色科技光效、HUD/UI 元素、金属质感、爆炸图',
    features: ['白底主图', 'Advanced Features', '技术规格表', '内部结构图', '界面展示', '配件展示', '科技场景'],
    color: '#9C27B0',
    recommended: false,
    complexitySupport: ['L2', 'L3']
  },
  {
    key: 'premium',
    name: '高端品牌型',
    icon: '✨',
    shortName: 'Premium',
    description: '高客单价产品、品牌质感',
    suitableFor: '家具、床垫、咖啡机、高端厨具、美容仪、智能家居',
    visualStyle: '极简、高级光影、大留白、少文字、品牌广告大片风格',
    features: ['白底主图', '品牌级 Hero', '材质与工艺', '生活方式大片', '细节微距', '空间搭配', '高端收尾'],
    color: '#212121',
    recommended: false,
    complexitySupport: ['L3']
  },
  {
    key: 'fashion',
    name: '时尚服饰型',
    icon: '👗',
    shortName: 'Fashion',
    description: '穿搭、美感、版型展示',
    suitableFor: '服装、鞋子、帽子、包包、配饰、珠宝',
    visualStyle: '杂志大片、自然光、高级灰、模特展示、时尚排版',
    features: ['白底/平铺图', '模特穿搭', '面料特写', '尺码指南', '工艺细节', '多角度展示', 'Lookbook 收尾'],
    color: '#E91E63',
    recommended: false,
    complexitySupport: ['L2', 'L3']
  }
]

// 复杂度级别
const COMPLEXITY_LEVELS = [
  { id: 'L1', name: '极速版 ⚡', icon: '⚡', desc: '简单白底 + 基础信息，适合低价铺货', cost: '低' },
  { id: 'L2', name: '标准版 📋', icon: '📋', desc: '场景 + 卖点 + 尺寸，适合大多数 SKU', cost: '中', default: true },
  { id: 'L3', name: '精品版 🏆', icon: '🏆', desc: '信息图 + 对比图 + 情绪化场景，适合重点推广', cost: '高' }
]

export default function TemplateSelector({ selectedType, onSelect, hasGeneratedPlans, selectedComplexity, onComplexityChange, aiRecommendedStrategy, onDismissRecommendation }) {
  const handleSelect = (strategyKey) => {
    if (hasGeneratedPlans && selectedType !== strategyKey) {
      const confirmed = window.confirm('切换策略将覆盖当前已生成的图片策略，确定要切换吗？\n\n点击"确定"切换策略\n点击"取消"保留当前策略')
      if (!confirmed) return
    }
    onSelect(strategyKey)
  }

  return (
    <div className="template-selector">
      <div className="template-selector-header">
        <label>🎯 选择图片营销策略</label>
        <span className="help-text">
          基于「营销策略库」而非行业分类，AI 会根据策略框架生成对应的 7 张图
        </span>
      </div>

      {/* 策略卡片网格 */}
      <div className="template-grid strategy-grid">
        {strategies.map(strategy => {
          // 使用当前渲染的 strategy 的 complexitySupport，而不是 selectedType 的
          const isSupported = !selectedComplexity || (strategy.complexitySupport || ['L1', 'L2', 'L3']).includes(selectedComplexity)
          const isAiRecommended = aiRecommendedStrategy === strategy.key
          return (
            <div
              key={strategy.key}
              className={`template-card ${selectedType === strategy.key ? 'active' : ''} ${isAiRecommended ? 'ai-recommended' : ''} ${!isSupported ? 'disabled' : ''}`}
              onClick={() => isSupported && handleSelect(strategy.key)}
              title={!isSupported ? `该策略不支持 ${selectedComplexity} 复杂度` : ''}
            >
              {isAiRecommended && (
                <div className="ai-recommended-badge">🤖 AI 推荐</div>
              )}
              
              <div className="template-preview">
                <div className="template-preview-placeholder" style={{ background: `${strategy.color}15` }}>
                  <span className="placeholder-icon">{strategy.icon}</span>
                  <span className="placeholder-text" style={{ color: strategy.color }}>{strategy.shortName}</span>
                </div>
              </div>

              <div className="template-card-content">
                <div className="template-card-header">
                  <span className="template-icon">{strategy.icon}</span>
                  <h4>{strategy.name}</h4>
                </div>
                <p className="template-description">{strategy.description}</p>
                
                {/* 适合产品 */}
                <div className="suitable-for">
                  <small>📦 适合: {strategy.suitableFor}</small>
                </div>

                {/* 视觉风格 */}
                <div className="visual-style-tag">
                  <small>🎨 {strategy.visualStyle}</small>
                </div>

                {strategy.features && (
                  <div className="template-features">
                    {strategy.features.slice(0, 5).map((feature, idx) => (
                      <span key={idx} className="feature-tag">{feature}</span>
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

      {/* 复杂度选择器 */}
      <div className="complexity-selector">
        <label>⚙️ 出图复杂度</label>
        <p className="help-text">控制出图成本和质量，铺货用 L1，精品用 L3</p>
        
        <div className="complexity-options">
          {COMPLEXITY_LEVELS.map(level => {
            const isDisabled = currentStrategy && !currentStrategy.complexitySupport.includes(level.id)
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

      {/* AI 推荐提示 */}
      <div className="ai-recommendation-hint">
        <span>💡 提示：</span> 
        不知道选哪个？先填产品信息，再点「AI 分析」，AI 会根据产品特点推荐最适合的策略。
        <br/>
        <small>例如：智能空气炸锅 → Technical + Lifestyle | 记忆棉床垫 → Premium + Lifestyle</small>
      </div>

      {/* AI 推荐策略弹窗 */}
      {aiRecommendedStrategy && (
        <div className="ai-recommendation-modal-overlay">
          <div className="ai-recommendation-modal">
            <div className="modal-header">
              <h3>🤖 AI 策略推荐</h3>
            </div>
            <div className="modal-content">
              <p className="recommendation-title">根据你的产品特点，AI 更推荐：</p>
              <div className="recommended-strategy-highlight">
                {(() => {
                  const rec = strategies.find(s => s.key === aiRecommendedStrategy)
                  return rec ? (
                    <>
                      <span className="strategy-icon">{rec.icon}</span>
                      <span className="strategy-name">{rec.name}</span>
                    </>
                  ) : null
                })()}
              </div>
              <p className="recommendation-reason">
                💡 该策略更适合你的产品特性和目标市场
              </p>
            </div>
            <div className="modal-actions">
              <button 
                className="btn-cancel" 
                onClick={() => {
                  onSelect(aiRecommendedStrategy)
                  // 关闭弹窗由父组件的 useEffect 处理（用户选择后清除推荐）
                }}
              >
                ✅ 采纳 AI 推荐
              </button>
              <button 
                className="btn-secondary" 
                onClick={() => {
                  // 用户点击"我知道了"，通知父组件关闭弹窗
                  onDismissRecommendation?.()
                }}
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
