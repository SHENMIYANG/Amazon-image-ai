import './ResolutionSelector.css'

export default function ResolutionSelector({ selected, onChange }) {
  const options = [
    {
      key: '2k',
      label: '2K 高清',
      size: '2048x2048',
      description: '2048x2048，适合亚马逊主图',
      price: '~$0.08/张'
    },
    {
      key: '4k',
      label: '4K 超清',
      size: '4096x4096',
      description: '4096x4096，超精细细节',
      price: '~$0.16/张'
    }
  ]

  return (
    <div className="resolution-selector">
      <div className="selector-header">
        <h3>📐 输出分辨率</h3>
      </div>

      <div className="resolution-options">
        {options.map(option => (
          <div
            key={option.key}
            className={`resolution-option ${selected === option.key ? 'selected' : ''}`}
            onClick={() => onChange(option.key)}
          >
            <div className="option-header">
              <span className="option-label">{option.label}</span>
              {selected === option.key && (
                <span className="check-mark">✅</span>
              )}
            </div>
            
            <div className="option-size">{option.size}</div>
            <div className="option-desc">{option.description}</div>
            <div className="option-price">{option.price}</div>
          </div>
        ))}
      </div>

      <div className="cost-estimate">
        💰 成本估算：生成 7 张图约需 
        <strong>
          {selected === '4k' ? '$1.12' : '$0.56'}
        </strong>
        （主图 1 张 + 辅图 6 张）
      </div>
    </div>
  )
}
