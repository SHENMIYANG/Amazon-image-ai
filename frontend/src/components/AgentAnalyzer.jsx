import { useState, useEffect, useRef } from 'react'
import './AgentAnalyzer.css'

export default function AgentAnalyzer({ listing, onAnalyzeComplete }) {
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [successMessage, setSuccessMessage] = useState(null)
  const [recommendedStrategy, setRecommendedStrategy] = useState(null)
  const timerRef = useRef(null)

  // 分析过程中每秒更新计时
  useEffect(() => {
    if (analyzing) {
      setElapsedSeconds(0)
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1)
      }, 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [analyzing])

  const handleAnalyze = async () => {
    if (!listing.productName || !listing.sellingPoints) {
      alert('请先填写产品名称和核心卖点')
      return
    }

    setAnalyzing(true)
    setError(null)

    try {
      const response = await fetch('/api/agent-analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productName: listing.productName,
          category: listing.category,
          marketplace: listing.marketplace,
          dimensions: listing.dimensions,
          material: listing.material,
          targetAudience: listing.targetAudience,
          additionalInfo: listing.additionalInfo,
          complexity: listing.complexity || 'L2',
          sellingPoints: listing.sellingPoints,
          imageType: listing.imageType,
          imagePlans: listing.imagePlans
        })
      })

      // 先检查响应状态
      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = '分析失败'
        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.message || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }
        throw new Error(errorMessage)
      }

      const result = await response.json()

      // 调用父组件的回调，传入分析结果
      onAnalyzeComplete(result.data)

      // 显示成功提示
      setSuccessMessage(`✅ 策略生成成功！共生成 7 张图的详细策略`)
      
      // 如果 AI 推荐了不同的策略，显示推荐提示
      if (result.data._meta?.recommendedStrategy && result.data._meta.recommendedStrategy !== listing.imageType) {
        const strategyNames = {
          basic: ' 通用基础型',
          featureFocus: '🔥 卖点聚焦型',
          infographic: '📊 信息图表型',
          lifestyle: '🏡 生活方式型',
          technical: '⚡ 科技感型',
          premium: '💎 高端奢华型',
          fashion: '👗 时尚潮流型'
        }
        setRecommendedStrategy(strategyNames[result.data._meta.recommendedStrategy] || result.data._meta.recommendedStrategy)
      }

      // 5 秒后自动清除成功提示
      setTimeout(() => {
        setSuccessMessage(null)
        setRecommendedStrategy(null)
      }, 5000)

    } catch (err) {
      console.error('Agent 分析失败:', err)
      setError(err.message)
      setSuccessMessage(null)
      setRecommendedStrategy(null)
      
      // 根据错误类型给出不同提示
      if (err.message.includes('500') || err.message.includes('Internal Server Error')) {
        alert(`❌ 服务器内部错误\n\n${err.message}\n\n请查看后端控制台日志获取详细错误信息。`)
      } else {
        alert(`❌ 分析失败：${err.message}`)
      }
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="agent-analyzer">
      <div className="analyzer-header">
        <h3>🤖 AI 智能分析</h3>
        <span className="help-text">
          AI 会自动分析产品卖点，并为 7 张图片生成详细策略
        </span>
      </div>

      <button
        className={`analyze-btn ${analyzing ? 'analyzing' : ''}`}
        onClick={handleAnalyze}
        disabled={analyzing}
      >
        {analyzing ? (
          <>
            <span className="loading-spinner">⏳</span>
            AI 正在分析产品...（已等待 {elapsedSeconds} 秒）
          </>
        ) : (
          <>
            <span className="btn-icon">✨</span>
            一键生成套图策略
          </>
        )}
      </button>

      {analyzing && elapsedSeconds >= 30 && (
        <div className="waiting-hint">
          🤖 AI 正在生成 7 张图的详细策略，任务较复杂，请耐心等待，无需重复点击
        </div>
      )}

      {successMessage && (
        <div className="success-message">
          {successMessage}
          {recommendedStrategy && (
            <div className="recommendation-hint">
              💡 AI 根据你的产品推荐：<strong>{recommendedStrategy}</strong> 策略
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      <div className="analyzer-features">
        <div className="feature-item">
          <span className="feature-icon">🎯</span>
          <span>智能推荐最佳策略</span>
        </div>
        <div className="feature-item">
          <span className="feature-icon">📊</span>
          <span>卖点 - 图片智能映射</span>
        </div>
        <div className="feature-item">
          <span className="feature-icon">🌍</span>
          <span>考虑目标市场偏好</span>
        </div>
      </div>
    </div>
  )
}
