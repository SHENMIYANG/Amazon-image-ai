import './AmazonListingForm.css'

const COMPLEXITY_LEVELS = [
  {
    value: 'L1',
    label: 'L1 极速版',
    icon: '1',
    description: '更适合铺货快出图，信息更少、产品更突出、错误率更低。'
  },
  {
    value: 'L2',
    label: 'L2 标准版',
    icon: '2',
    description: '适合大多数 SKU，兼顾卖点表达、信息完整度和可读性。'
  },
  {
    value: 'L3',
    label: 'L3 精品版',
    icon: '3',
    description: '适合更完整的图文编排与更强层级，但不能牺牲产品真实性。'
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
