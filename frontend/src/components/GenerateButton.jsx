import './GenerateButton.css'

export default function GenerateButton({
  onClick,
  onStop,
  disabled,
  generating,
  stopping,
  imageCount = 0
}) {
  return (
    <div className="generate-button-container">
      {!generating ? (
        <button className="generate-button" onClick={onClick} disabled={disabled}>
          {'\u2728'} 开始生成（{imageCount} 张图）
        </button>
      ) : (
        <>
          <button className="generate-button generating" disabled>
            {'\u23F3'} 生成中...
          </button>
          <button className="stop-button" onClick={onStop} disabled={stopping}>
            {'\u23F9\uFE0F'} 停止生成
          </button>
        </>
      )}
    </div>
  )
}
