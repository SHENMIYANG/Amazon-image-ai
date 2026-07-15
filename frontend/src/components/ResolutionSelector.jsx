import './ResolutionSelector.css'

export default function ResolutionSelector({ selected, onChange }) {
  return (
    <div className="resolution-selector">
      <div className="selector-header">
        <h3>分辨率选择</h3>
      </div>

      <div className="resolution-options">
        {['2k', '4k'].map((option) => (
          <button
            key={option}
            type="button"
            className={`resolution-option ${selected === option ? 'selected' : ''}`}
            onClick={() => onChange(option)}
          >
            {option.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  )
}
