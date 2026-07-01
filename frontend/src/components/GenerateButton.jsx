import './GenerateButton.css'

export default function GenerateButton({ onClick, onStop, disabled, generating, stopping, imageCount = 7 }) {
  return (
    <div className="generate-button-container">
      {!generating ? (
        <button 
          className="generate-button" 
          onClick={onClick}
          disabled={disabled}
        >
          🚀 开始生成 ({imageCount}张图片)
        </button>
      ) : (
        <>
          <button 
            className="generate-button generating"
            disabled={true}
          >
            🔄 生成中...
          </button>
          <button 
            className="stop-button" 
            onClick={onStop}
            disabled={stopping}
          >
            ⏹️ 停止生成
          </button>
        </>
      )}
    </div>
  )
}
