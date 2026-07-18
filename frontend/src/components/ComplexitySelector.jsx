import './AmazonListingForm.css'

const COMPLEXITY_LEVELS = [
  {
    value: 'L1',
    label: 'L1 极速版',
    icon: '1',
    description: '更适合低价铺货和快速出图，一张图只讲一个重点。'
  },
  {
    value: 'L2',
    label: 'L2 标准版',
    icon: '2',
    description: '适合大多数 SKU，卖点、场景和信息完整度更均衡。'
  },
  {
    value: 'L3',
    label: 'L3 精品版',
    icon: '3',
    description: '适合重点款，层级、质感和视觉控制更强。'
  }
]

export default function ComplexitySelector({ selected, onChange }) {
  return (
    <div className="strategy-complexity-block">
      <div className="strategy-complexity-header">
        <h4>出图复杂度</h4>
      </div>

      <div className="strategy-complexity-grid">
        {COMPLEXITY_LEVELS.map((level) => (
          <button
            key={level.value}
            type="button"
            className={`strategy-complexity-card ${selected === level.value ? 'active' : ''}`}
            onClick={() => onChange(level.value)}
          >
            <span className="strategy-complexity-icon" aria-hidden="true">
              {level.icon}
            </span>
            <span className="strategy-complexity-copy">
              <strong>{level.label}</strong>
              <small>{level.description}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
