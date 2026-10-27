import { useEffect, useRef, useState } from 'react'
import { formatApiError, parseApiJson } from '../utils/apiResponse'
import { buildAnalyzeRequest } from '../utils/requestPayload'
import { getSelectedImageTaskCount } from '../utils/imageTasks'
import './AgentAnalyzer.css'

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

function clearStoredRecovery(key) {
  try { window.localStorage.removeItem(key) } catch (error) { console.warn('无法清理策略恢复记录:', error) }
}

async function waitForUploadedReference(url, maxAttempts = 8, delayMs = 500) {
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

async function requestAnalysis(listing, referenceImages, primaryReferenceImageUrl, requestId) {
  const response = await fetch('/api/agent-analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Analysis-Request-Id': requestId
    },
    body: JSON.stringify(buildAnalyzeRequest(listing, referenceImages, primaryReferenceImageUrl))
  })

  return await parseApiJson(response, '策略分析接口')
}

async function settleUploadedFiles() {
  await wait(1000)
}

async function settleUploadedReferences(referenceImages = []) {
  const targets = Array.isArray(referenceImages) ? referenceImages.filter(Boolean).slice(0, 8) : []
  if (targets.length === 0) {
    await settleUploadedFiles()
    return
  }

  await settleUploadedFiles()
  await Promise.all(targets.map((url) => waitForUploadedReference(url)))
}

export default function AgentAnalyzer({
  listing,
  productImages = [],
  referenceImages = [],
  primaryReferenceImageUrl = '',
  onReferenceImagesChange,
  onAnalyzeComplete,
  onAnalyzingChange,
  onRecoverComplete,
  recoveryKey = 'local',
  isSessionActive = () => true
}) {
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [successMessage, setSuccessMessage] = useState(null)
  const [recovery, setRecovery] = useState(null)
  const [uncertain, setUncertain] = useState(false)
  const callbacks = useRef({ onRecoverComplete, onAnalyzingChange })
  callbacks.current = { onRecoverComplete, onAnalyzingChange }
  const storageKey = `amazon-image-analysis:v1:${recoveryKey}`
  const timerRef = useRef(null)
  const latestAnalysisRevisionRef = useRef(Number(listing._meta?.analysisRevision || 0))
  latestAnalysisRevisionRef.current = Number(listing._meta?.analysisRevision || 0)
  const selectedImageCount = getSelectedImageTaskCount(listing.selectedImageTasks)

  useEffect(() => {
    try {
      const pending = JSON.parse(window.localStorage.getItem(storageKey) || 'null')
      if (pending?.requestId) setRecovery({ ...pending, restore: true })
    } catch {
      setError('无法读取上次策略请求记录。')
    }
  }, [storageKey])

  useEffect(() => {
    if (!recovery || uncertain) return undefined
    let active = true
    const controller = new AbortController()
    setAnalyzing(true)
    callbacks.current.onAnalyzingChange?.(true)
    const poll = async () => {
      for (let attempt = 0; active && attempt < 360; attempt += 1) {
        try {
          const response = await fetch(`/api/agent-analyze/status/${recovery.requestId}`, { signal: controller.signal })
          const data = await parseApiJson(response, '策略结果查询')
          if (!active) return
          if (data.result?.success) {
            const applied = callbacks.current.onRecoverComplete?.(data.result.data, recovery)
            setSuccessMessage(applied === false ? '原策略已找回，当前资料已变化，未替换页面内容。' : data.pendingPersistence ? '策略已找回，等待数据库补存，请勿重复生成。' : '策略已找回并保存，可以继续编辑和生图。')
            if (!data.pendingPersistence) {
              clearStoredRecovery(storageKey)
              setRecovery(null)
              setAnalyzing(false)
              callbacks.current.onAnalyzingChange?.(false)
              return
            }
          } else if (data.status === 'FAILED') {
            clearStoredRecovery(storageKey)
            setError(data.message || '上次策略请求失败，请检查后再生成。')
            setRecovery(null)
            setAnalyzing(false)
            callbacks.current.onAnalyzingChange?.(false)
            return
          } else if (data.status === 'UNKNOWN') {
            setError(data.message)
            break
          }
        } catch (error) {
          if (!active) return
          if ([401, 403, 404].includes(error.status)) {
            setError('无法确认上次策略结果，请核对使用记录和当前登录账号，勿重复生成。')
            break
          }
        }
        await wait(3000)
      }
      if (active) {
        setUncertain(true)
        setError((message) => message || '策略结果暂未确认，请先核对使用记录，勿重复生成。')
        setAnalyzing(false)
        callbacks.current.onAnalyzingChange?.(false)
      }
    }
    void poll()
    return () => { active = false; controller.abort() }
  }, [recovery, storageKey, uncertain])

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

    if ((!productImages || productImages.length === 0) && referenceImages.length === 0) {
      alert('请先上传产品图片，AI 需要结合图片和产品信息一起分析。')
      return
    }

    if (selectedImageCount === 0) {
      alert('请先选择至少 1 张要生成的图片任务。')
      return
    }

    if (Math.max(productImages.length, referenceImages.length) + (listing.layoutTemplates?.length ? 1 : 0) > 8) {
      setError('选择模板后最多使用 7 张产品图。请减少产品图后再生成策略，避免策略完成后无法生图。')
      return
    }

    setAnalyzing(true)
    onAnalyzingChange?.(true)
    setError(null)
    setSuccessMessage(null)
    const requestedAnalysisRevision = Number(listing._meta?.analysisRevision || 0)
    let pending = null
    let recovering = false

    try {
      let uploadedReferenceImages = referenceImages

      if (!uploadedReferenceImages.length) {
        const formData = new FormData()
        productImages.forEach((img) => formData.append('images', img))

        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        })
        const uploadData = await parseApiJson(uploadResponse, '产品图片上传接口')

        if (!uploadData.success) {
          throw new Error(uploadData.message || '产品图片上传失败')
        }

        uploadedReferenceImages = uploadData.images.map((img) => img.url)
        onReferenceImagesChange?.(uploadedReferenceImages)
        await settleUploadedReferences(uploadedReferenceImages)
      }

      if (!isSessionActive()) return
      const explicitPrimaryReferenceImageUrl = primaryReferenceImageUrl || uploadedReferenceImages[0] || ''
      const { imagePlans, productBlueprint, globalRules, globalConstraints, _meta, ...draft } = listing
      pending = {
        requestId: `analysis-${Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
        listing: { ...draft, _meta: { analysisRevision: requestedAnalysisRevision } }, referenceImages: uploadedReferenceImages,
        primaryReferenceImageUrl: explicitPrimaryReferenceImageUrl,
        requestedAnalysisRevision
      }
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(pending))
      } catch {
        pending = null
        throw new Error('浏览器无法保存任务恢复记录，本次未调用策略模型。请检查浏览器存储空间和隐私设置。')
      }
      const result = await requestAnalysis(listing, uploadedReferenceImages, explicitPrimaryReferenceImageUrl, pending.requestId)
      if (!isSessionActive()) return
      if (!result.success || result.persistenceWarning) {
        recovering = true
        setRecovery(pending)
      } else {
        clearStoredRecovery(storageKey)
      }
      if (!result.success) return
      if (latestAnalysisRevisionRef.current !== requestedAnalysisRevision) {
        setSuccessMessage('分析期间产品资料发生了变化，本次旧策略未写入页面。请重新生成策略。')
        return
      }
      onAnalyzeComplete(result.data)

      setSuccessMessage(result.persistenceWarning || `策略生成成功，AI 已为 ${result.data?.imagePlans?.length || selectedImageCount} 张图补全详细方案。`)
    } catch (err) {
      if (!isSessionActive()) return
      console.error('Agent 分析失败:', err)
      if (pending && !err.responseData?.requestId && ![400, 401, 403, 409, 413, 429].includes(err.status)) {
        recovering = true
        setRecovery(pending)
        setSuccessMessage('连接中断，正在查询原策略请求，不会重复调用模型。')
        return
      }
      if (pending) clearStoredRecovery(storageKey)
      const message = formatApiError(err, '策略分析')
      setError(message)
      alert(message)
    } finally {
      if (!recovering) {
        setAnalyzing(false)
        onAnalyzingChange?.(false)
      }
    }
  }

  return (
    <div className="agent-analyzer">
      <div className="analyzer-header">
        <h3>AI 智能分析</h3>
      </div>

      <button
        type="button"
        className={`analyze-btn ${analyzing ? 'analyzing' : ''}`}
        onClick={handleAnalyze}
        disabled={analyzing || Boolean(recovery)}
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
      {uncertain && recovery && <button type="button" onClick={() => {
        if (!window.confirm('结束等待不会取消服务器任务。请确认已核对使用记录，重新生成可能再次计费。')) return
        clearStoredRecovery(storageKey)
        setRecovery(null)
        setUncertain(false)
      }}>已核对记录，结束等待</button>}
    </div>
  )
}
