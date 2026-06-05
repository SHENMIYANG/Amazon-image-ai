import './GenerateButton.css'

export default function GenerateButton({ onClick, disabled, generating, imageCount = 7 }) {
  return (
    <button 
      className="generate-button" 
      onClick={onClick}
      disabled={disabled || generating}
    >
      {generating 
        ? '🔄 生成中...' 
        : `🚀 开始生成 (${imageCount}张图片)`
      }
    </button>
  )
}
