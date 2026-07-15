import { useEffect, useRef, useState } from 'react'
import { buildAnalyzeRequest } from '../utils/requestPayload'
import { getSelectedImageTaskCount } from '../utils/imageTasks'
import './AgentAnalyzer.css'

export default function AgentAnalyzer({ listing, productImages = [], onAnalyzeComplete }) {
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [successMessage, setSuccessMessage] = useState(null)
  const timerRef = useRef(null)
  const selectedImageCount = getSelectedImageTaskCount(listing.selectedImageTasks)

  useEffect(() => {
    if (!analyzing) {
      clearInterval(timerRef.current)
      return undefined
    }

    setElapsedSeconds(0)
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [analyzing])

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current)
    }
  }, [])

  const handleAnalyze = async () => {
    if (!listing.productName && !listing.listingInfo && !listing.sellingPoints) {
      alert('请先填写产品 Listing 信息和核心卖点。')
      return
    }

    if (!productImages || productImages.length === 0) {
      alert('请先上传产品图片，AI 需要结合图片和产品信息一起分析。')
      return
    }

    if (selectedImageCount === 0) {
      alert('请先选择至少 1 张要生成的图片任务。')
      return
    }

    setAnalyzing(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const formData = new FormData()
      productImages.forEach((img) => formData.append('images', img))

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })
      const uploadData = await uploadResponse.json()

      if (!uploadData.success) {
        throw new Error(uploadData.message || '产品图片上传失败')
      }

      const referenceImages = uploadData.images.map((img) => img.url)

      const response = await fetch('/api/agent-analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(buildAnalyzeRequest(listing, referenceImages))
      })

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
      onAnalyzeComplete(result.data)

      setSuccessMessage(`策略生成成功，AI 已为 ${result.data?.imagePlans?.length || selectedImageCount} 张图回填详细方案。`)
    } catch (err) {
      console.error('Agent 分析失败:', err)
      setError(err.message)

      if (err.message.includes('500') || err.message.includes('Internal Server Error')) {
        alert(`服务端内部错误\n\n${err.message}`)
      } else {
        alert(`分析失败：${err.message}`)
      }
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="agent-analyzer">
      <div className="analyzer-header">
        <h3>AI 智能分析</h3>
        <span className="help-text">
          AI 会结合产品图片、Listing 信息、补充信息、语言、品牌主色和字体偏好，为当前选中的 {selectedImageCount} 张图生成更完整的策略方案。
        </span>
      </div>

      <button
        className={`analyze-btn ${analyzing ? 'analyzing' : ''}`}
        onClick={handleAnalyze}
        disabled={analyzing}
      >
        {analyzing ? (
          <>
            <span className="loading-spinner">...</span>
            AI 正在结合产品图片和 Listing 分析，已等待 {elapsedSeconds} 秒
          </>
        ) : (
          <>
            <span className="btn-icon">+</span>
            一键生成出图方案
          </>
        )}
      </button>

      {analyzing && elapsedSeconds >= 30 && (
        <div className="waiting-hint">
          AI 正在读取产品图并规划当前图片任务，请耐心等待，不需要重复点击。
        </div>
      )}

      {successMessage && <div className="success-message">{successMessage}</div>}

      {error && <div className="error-message">{error}</div>}

      <div className="analyzer-features">
        <div className="feature-item">
          <span className="feature-icon">1</span>
          <span>结合产品图和 Listing 信息一起分析</span>
        </div>
        <div className="feature-item">
          <span className="feature-icon">2</span>
          <span>把卖点映射到你当前勾选的图片任务</span>
        </div>
        <div className="feature-item">
          <span className="feature-icon">3</span>
          <span>补全中文策略说明，英文执行稿改为按需查看</span>
        </div>
      </div>
    </div>
  )
}
