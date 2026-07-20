import { useEffect, useRef, useState } from 'react'
import { parseApiJson } from '../utils/apiResponse'
import { buildAnalyzeRequest } from '../utils/requestPayload'
import { getSelectedImageTaskCount } from '../utils/imageTasks'
import './AgentAnalyzer.css'

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

async function waitForUploadedReference(url, maxAttempts = 8, delayMs = 350) {
  let lastError = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${url}?probe=${Date.now()}-${attempt}`, {
        method: 'HEAD',
        cache: 'no-store'
      })

      if (response.ok) {
        return true
      }

      lastError = new Error(`HEAD ${response.status}`)
    } catch (error) {
      lastError = error
    }

    await wait(delayMs)
  }

  throw lastError || new Error('上传图片文件尚未就绪')
}

async function requestAnalysis(listing, referenceImages, primaryReferenceImageUrl) {
  const response = await fetch('/api/agent-analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(buildAnalyzeRequest(listing, referenceImages, primaryReferenceImageUrl))
  })

  return await parseApiJson(response, '分析失败')
}

async function settleUploadedFiles() {
  await wait(250)
}

async function settleUploadedReferences(referenceImages = []) {
  const targets = Array.isArray(referenceImages) ? referenceImages.filter(Boolean).slice(0, 3) : []
  if (targets.length === 0) {
    await settleUploadedFiles()
    return
  }

  await Promise.all(targets.map((url) => waitForUploadedReference(url)))
}

export default function AgentAnalyzer({
  listing,
  productImages = [],
  referenceImages = [],
  primaryReferenceImageUrl = '',
  onReferenceImagesChange,
  onAnalyzeComplete
}) {
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
      let uploadedReferenceImages = referenceImages

      if (!uploadedReferenceImages.length) {
        const formData = new FormData()
        productImages.forEach((img) => formData.append('images', img))

        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        })
        const uploadData = await parseApiJson(uploadResponse, '产品图片上传失败')

        if (!uploadData.success) {
          throw new Error(uploadData.message || '产品图片上传失败')
        }

        uploadedReferenceImages = uploadData.images.map((img) => img.url)
        onReferenceImagesChange?.(uploadedReferenceImages)
        await settleUploadedReferences(uploadedReferenceImages)
      }

      const explicitPrimaryReferenceImageUrl = primaryReferenceImageUrl || uploadedReferenceImages[0] || ''
      const result = await requestAnalysis(listing, uploadedReferenceImages, explicitPrimaryReferenceImageUrl)
      onAnalyzeComplete(result.data)

      setSuccessMessage(`策略生成成功，AI 已为 ${result.data?.imagePlans?.length || selectedImageCount} 张图补全详细方案。`)
    } catch (err) {
      console.error('Agent 分析失败:', err)
      setError(err.message)

      if (String(err.message || '').includes('500') || String(err.message || '').includes('Internal Server Error')) {
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
    </div>
  )
}
