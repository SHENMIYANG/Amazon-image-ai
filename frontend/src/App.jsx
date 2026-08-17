import { useState, useEffect, useRef } from 'react'
import AmazonListingForm from './components/AmazonListingForm'
import ProductImageUploader from './components/ProductImageUploader'
import TaskGrid from './components/TaskGrid'
import GenerateButton from './components/GenerateButton'
import ResolutionSelector from './components/ResolutionSelector'
import SettingsModal from './components/SettingsModal'
import AgentAnalyzer from './components/AgentAnalyzer'
import WorkspaceChatButton from './components/WorkspaceChatButton'
import WorkspaceChatModal from './components/WorkspaceChatModal'
import { getMarketplaceDefaultLanguage } from './components/GenerationPreferences'
import { parseApiJson } from './utils/apiResponse'
import {
  buildGenerateRequest,
  buildListingPayload,
  extractProductName,
  parseListingInfoSections
} from './utils/requestPayload'
import {
  buildDefaultPlansFromTasks,
  getDefaultImageTaskConfig,
  getSelectedImageTaskCount,
  MAIN_IMAGE_FIXED_RULE,
  normalizeImagePlan
} from './utils/imageTasks'
import './App.css'

function parseImageResolution(resolution) {
  if (resolution === '2k') return { width: 2048, height: 2048 }
  if (resolution === '4k') return { width: 4096, height: 4096 }

  const match = String(resolution || '').match(/^(\d+)x(\d+)$/i)
  if (!match) return null

  return {
    width: Number(match[1]),
    height: Number(match[2])
  }
}

async function resizeImageBlobForDownload(blob, requestedResolution) {
  const target = parseImageResolution(requestedResolution)
  if (!target || !blob.type.startsWith('image/')) return blob
  if (typeof createImageBitmap !== 'function') return blob

  const bitmap = await createImageBitmap(blob)
  if (bitmap.width === target.width && bitmap.height === target.height) {
    bitmap.close?.()
    return blob
  }

  if (bitmap.width < target.width || bitmap.height < target.height) {
    bitmap.close?.()
    return blob
  }

  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height

  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, target.width, target.height)

  const scale = Math.min(target.width / bitmap.width, target.height / bitmap.height)
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const x = Math.round((target.width - width) / 2)
  const y = Math.round((target.height - height) / 2)

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, x, y, width, height)
  bitmap.close?.()

  return new Promise((resolve) => {
    canvas.toBlob((resizedBlob) => resolve(resizedBlob || blob), 'image/png', 1)
  })
}

function orderImagesByPrimary(images = [], primaryIndex = 0) {
  if (!Array.isArray(images) || images.length === 0) return []
  if (primaryIndex < 0 || primaryIndex >= images.length) return [...images]

  const primaryImage = images[primaryIndex]
  const secondaryImages = images.filter((_, index) => index !== primaryIndex)
  return [primaryImage, ...secondaryImages]
}

function getPrimaryReferenceImageUrl(images = []) {
  return Array.isArray(images) && images.length > 0 ? images[0] : ''
}

async function uploadReferenceFiles(files = [], label = '参考图上传接口') {
  if (!Array.isArray(files) || files.length === 0) return []

  const formData = new FormData()
  files.forEach((file) => formData.append('images', file))
  const response = await fetch('/api/upload', { method: 'POST', body: formData })
  const data = await parseApiJson(response, label)

  if (!data.success) {
    throw new Error(data.message || '参考图上传失败')
  }

  return data.images.map((image) => image.url)
}

async function requestGeneratedImage({
  listing,
  plan,
  resolution,
  referenceImages,
  primaryReferenceImageUrl,
  regenerationReferenceImages = [],
  label
}) {
  const generateResponse = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      buildGenerateRequest(
        listing,
        plan,
        resolution,
        referenceImages,
        primaryReferenceImageUrl,
        regenerationReferenceImages
      )
    )
  })
  const data = await parseApiJson(generateResponse, label)
  const generatedImage = data.images && data.images[0]
  const realSuccess = data.success && generatedImage && generatedImage.status === 'completed' && generatedImage.imageUrl

  if (!realSuccess) {
    throw new Error(generatedImage?.error || data.message || '生成失败')
  }

  return generatedImage
}

function buildImageVersionSnapshot(image = {}) {
  if (!image?.imageUrl) return null

  return {
    imageUrl: image.imageUrl,
    strategyContent: image.strategyContent || '',
    promptEn: image.promptEn || '',
    promptUsed: image.promptUsed || image.executionPromptEn || image.prompt || '',
    executionPromptEn: image.executionPromptEn || image.promptUsed || image.prompt || '',
    executionRules: image.executionRules || [],
    currentImageProductUsage: image.currentImageProductUsage || {},
    copy: image.copy || [],
    actualResolution: image.actualResolution || null,
    requestedResolution: image.requestedResolution || null,
    sizeMatchesRequest: image.sizeMatchesRequest,
    savedAt: new Date().toISOString()
  }
}

function buildCompletedImageState(image = {}, generatedImage = {}, fallbackPlan = {}) {
  const executionPlan = normalizeImagePlan({
    ...image,
    ...fallbackPlan,
    strategyContent: generatedImage.promptZh || fallbackPlan.strategyContent || image.strategyContent,
    promptEn: generatedImage.promptEn || generatedImage.prompt || fallbackPlan.promptEn || image.promptEn,
    executionRules: generatedImage.executionRules || fallbackPlan.executionRules || image.executionRules,
    currentImageProductUsage:
      generatedImage.currentImageProductUsage || fallbackPlan.currentImageProductUsage || image.currentImageProductUsage,
    copy: generatedImage.copy || fallbackPlan.copy || image.copy
  })

  return {
    ...image,
    status: 'completed',
    imageUrl: generatedImage.imageUrl,
    name: generatedImage.name || image.name,
    taskType: generatedImage.taskType || image.taskType,
    imageRole: generatedImage.imageRole || executionPlan.imageRole,
    sellingFocus: generatedImage.sellingFocus || executionPlan.sellingFocus,
    currentImageProductUsage: executionPlan.currentImageProductUsage,
    executionRules: executionPlan.executionRules,
    copy: executionPlan.copy,
    error: null,
    strategyContent: executionPlan.strategyContent,
    promptEn: executionPlan.promptEn || null,
    promptUsed: generatedImage.executionPromptEn || generatedImage.prompt || image.promptUsed || '',
    executionPromptEn: generatedImage.executionPromptEn || generatedImage.prompt || image.executionPromptEn || '',
    prompt: generatedImage.prompt || generatedImage.executionPromptEn || image.prompt || '',
    promptDirty: false,
    regenerationError: null,
    actualResolution: generatedImage.actualResolution || null,
    requestedResolution: generatedImage.resolution || image.requestedResolution,
    sizeMatchesRequest: generatedImage.sizeMatchesRequest
  }
}

function markPlansAsStale(plans = []) {
  return (plans || []).map((plan) => ({
    ...plan,
    promptEn: '',
    promptDirty: true
  }))
}

function buildInvalidatedAnalysisState(prev, { preservePlans = true } = {}) {
  return {
    globalRules: null,
    globalConstraints: null,
    productBlueprint: null,
    _meta: undefined,
    imagePlans: preservePlans ? markPlansAsStale(prev.imagePlans || []) : []
  }
}

function normalizeTaskConfigForComparison(config = {}) {
  const base = getDefaultImageTaskConfig()
  return Object.keys(base).reduce((acc, key) => {
    const rawValue = config?.[key]
    const count = Number.isFinite(Number(rawValue)) ? Number(rawValue) : base[key]
    acc[key] = Math.max(0, Math.min(6, Math.round(count)))
    return acc
  }, {})
}

function isTaskConfigReductionOnly(previousConfig = {}, nextConfig = {}) {
  const prev = normalizeTaskConfigForComparison(previousConfig)
  const next = normalizeTaskConfigForComparison(nextConfig)

  return Object.keys(prev).every((key) => next[key] <= prev[key])
}

function validateAnalyzedPlans(imagePlans = [], selectedImageTasks = {}) {
  const expectedTaskKeys = buildDefaultPlansFromTasks(selectedImageTasks, [])
    .map((plan) => plan.taskKey)
  const actualTaskKeys = (Array.isArray(imagePlans) ? imagePlans : [])
    .map((plan) => String(plan?.taskKey || '').trim())

  const duplicateTaskKeys = actualTaskKeys.filter(
    (taskKey, index) => taskKey && actualTaskKeys.indexOf(taskKey) !== index
  )
  const missingTaskKeys = expectedTaskKeys.filter((taskKey) => !actualTaskKeys.includes(taskKey))
  const unexpectedTaskKeys = actualTaskKeys.filter((taskKey) => !expectedTaskKeys.includes(taskKey))

  if (duplicateTaskKeys.length || missingTaskKeys.length || unexpectedTaskKeys.length) {
    const details = [
      duplicateTaskKeys.length ? `重复：${[...new Set(duplicateTaskKeys)].join('、')}` : '',
      missingTaskKeys.length ? `缺少：${missingTaskKeys.join('、')}` : '',
      unexpectedTaskKeys.length ? `多余：${[...new Set(unexpectedTaskKeys)].join('、')}` : ''
    ].filter(Boolean).join('；')
    throw new Error(`策略任务数据异常（${details}）。本次结果未写入页面，请重新生成策略。`)
  }
}

const ANALYSIS_INVALIDATING_FIELDS = new Set([
  'productName',
  'category',
  'dimensions',
  'material',
  'targetAudience',
  'sellingPoints',
  'additionalInfo',
  'marketplace',
  'imageLanguage',
  'fontPreference',
  'brandColorMode',
  'brandColor',
  'designNotes',
  'complexity'
])

function App() {
  const [listing, setListing] = useState({
    listingInfo: '',
    productName: '',
    category: '',
    dimensions: '',
    material: '',
    targetAudience: '',
    sellingPoints: '',
    marketplace: 'UK',
    imageLanguage: getMarketplaceDefaultLanguage('UK'),
    imageLanguageTouched: false,
    fontPreference: 'auto',
    brandColorMode: 'auto',
    brandColor: '',
    designNotes: '',
    additionalInfo: '',
    complexity: 'L2',
    globalRules: null,
    globalConstraints: null,
    productBlueprint: null,
    selectedImageTasks: getDefaultImageTaskConfig(),
    imagePlans: []
  })
  
  const [productImages, setProductImages] = useState([])
  const [primaryProductImageIndex, setPrimaryProductImageIndex] = useState(0)
  const [uploadedReferenceImages, setUploadedReferenceImages] = useState([])
  
  const [selectedResolution, setSelectedResolution] = useState('2k')
  const [tasks, setTasks] = useState([])
  const [generating, setGenerating] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [currentTaskId, setCurrentTaskId] = useState(null)
  const stoppingRef = useRef(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isWorkspaceChatOpen, setIsWorkspaceChatOpen] = useState(false)
  const [savingStrategyTranslations, setSavingStrategyTranslations] = useState({})

  useEffect(() => {
    if (!productImages.length) {
      setPrimaryProductImageIndex(0)
      return
    }

    if (primaryProductImageIndex >= productImages.length) {
      setPrimaryProductImageIndex(0)
    }
  }, [productImages, primaryProductImageIndex])

  const handleListingChange = (field, value) => {
    if (typeof value === 'function') {
      setListing((prev) => ({
        ...prev,
        [field]: value(prev[field], prev)
      }))
      return
    }

    if (field === 'listingInfo') {
      const parsedSections = parseListingInfoSections(value)
      setListing(prev => ({
        ...prev,
        ...buildInvalidatedAnalysisState(prev),
        listingInfo: value,
        productName: parsedSections.productName || extractProductName(value),
        sellingPoints: parsedSections.sellingPoints || value,
        category: parsedSections.category || prev.category || '',
        dimensions: parsedSections.dimensions || prev.dimensions || '',
        material: parsedSections.material || prev.material || '',
        targetAudience: parsedSections.targetAudience || prev.targetAudience || ''
      }))
      return
    }

    if (field === 'marketplace') {
      setListing((prev) => {
        const previousDefaultLanguage = getMarketplaceDefaultLanguage(prev.marketplace || 'UK')
        const nextDefaultLanguage = getMarketplaceDefaultLanguage(value)
        const shouldSyncLanguage =
          !prev.imageLanguageTouched ||
          !prev.imageLanguage ||
          prev.imageLanguage === previousDefaultLanguage

        return {
          ...prev,
          ...buildInvalidatedAnalysisState(prev),
          marketplace: value,
          imageLanguage: shouldSyncLanguage ? nextDefaultLanguage : prev.imageLanguage,
          imageLanguageTouched: shouldSyncLanguage ? false : prev.imageLanguageTouched
        }
      })
      return
    }

    if (field === 'imageLanguage') {
      setListing((prev) => ({
        ...prev,
        ...buildInvalidatedAnalysisState(prev),
        imageLanguage: value,
        imageLanguageTouched: true
      }))
      return
    }

    if (field === 'selectedImageTasks') {
      setListing((prev) => {
        const reductionOnly = isTaskConfigReductionOnly(prev.selectedImageTasks, value)

        if (reductionOnly) {
          return {
            ...prev,
            selectedImageTasks: value
          }
        }

        return {
          ...prev,
          ...buildInvalidatedAnalysisState(prev),
          selectedImageTasks: value
        }
      })
      return
    }

    if (ANALYSIS_INVALIDATING_FIELDS.has(field)) {
      setListing((prev) => ({
        ...prev,
        ...buildInvalidatedAnalysisState(prev),
        [field]: value
      }))
      return
    }

    setListing(prev => ({ ...prev, [field]: value }))
  }

  const handleAgentAnalyzeComplete = (analysisResult) => {
    const { imagePlans, _meta, globalRules, globalConstraints, productBlueprint } = analysisResult
    validateAnalyzedPlans(imagePlans, listing.selectedImageTasks)
    const normalizedPlans = (imagePlans || []).map((plan) => normalizeImagePlan({
      ...plan,
      strategyContent:
        (plan.taskType || plan.type) === 'main'
          ? MAIN_IMAGE_FIXED_RULE
          : plan.strategyContent || '',
      imageRole: plan.imageRole || '',
      sellingFocus: plan.sellingFocus || '',
      executionRules: plan.executionRules || [],
      promptEn: plan.promptEn || '',
      promptDirty: false
    }))

    setListing(prev => ({
      ...prev,
      imagePlans: normalizedPlans,
      globalRules: globalRules || globalConstraints || prev.globalRules || prev.globalConstraints || null,
      globalConstraints: globalConstraints || prev.globalConstraints || null,
      productBlueprint: productBlueprint || prev.productBlueprint || null,
      _meta: _meta
    }))
    
  }

  const syncStrategyTranslations = async (plansOverride = null, targetPlanTaskKeys = null) => {
    const plans = Array.isArray(plansOverride)
      ? plansOverride
      : buildDefaultPlansFromTasks(listing.selectedImageTasks, listing.imagePlans || [])
    const targetTaskKeySet = Array.isArray(targetPlanTaskKeys) && targetPlanTaskKeys.length > 0
      ? new Set(targetPlanTaskKeys)
      : null
    const dirtyPlans = plans.filter(
      (plan) =>
        (!targetTaskKeySet || targetTaskKeySet.has(plan.taskKey)) &&
        plan.taskType !== 'main' &&
        String(plan.strategyContent || '').trim() &&
        (plan.promptDirty || !String(plan.promptEn || '').trim())
    )

    if (dirtyPlans.length === 0) {
      return plans
    }

    const savingMap = dirtyPlans.reduce((acc, plan) => {
      acc[plan.taskKey] = true
      return acc
    }, {})
    setSavingStrategyTranslations((prev) => ({ ...prev, ...savingMap }))

    try {
      const listingSnapshot = buildListingPayload(listing, { includeGenerationSettings: true })
      const translatedByTaskKey = new Map()

      for (const plan of dirtyPlans) {
        const response = await fetch('/api/prompt-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listing: listingSnapshot,
            plan,
            resolution: selectedResolution === '4k' ? '4096x4096' : '2048x2048',
            persistence: {
              workspaceId: listing._meta?.persistence?.workspaceId,
              imagePlanId: plan.databasePlanId
            }
          })
        })

        const data = await parseApiJson(response, `策略英文执行稿接口（图${plan.id}）`)
        translatedByTaskKey.set(plan.taskKey, {
          promptEn: data.data?.promptEn || '',
          databasePlanVersionId: data.data?.persistence?.imagePlanVersionId || plan.databasePlanVersionId
        })
      }

      const nextPlans = plans.map((plan) =>
        translatedByTaskKey.has(plan.taskKey)
          ? {
              ...plan,
              promptEn: translatedByTaskKey.get(plan.taskKey).promptEn,
              databasePlanVersionId: translatedByTaskKey.get(plan.taskKey).databasePlanVersionId,
              promptDirty: false
            }
          : plan
      )

      setListing((prev) => ({
        ...prev,
        imagePlans: (prev.imagePlans || []).map((currentPlan) => {
          const translatedPlan = nextPlans.find((plan) => plan.taskKey === currentPlan.taskKey)
          if (!translatedPlan || !translatedByTaskKey.has(currentPlan.taskKey)) return currentPlan

          const contentChangedDuringSave =
            String(currentPlan.strategyContent || '').trim() !==
            String(translatedPlan.strategyContent || '').trim()

          return {
            ...currentPlan,
            promptEn: contentChangedDuringSave ? '' : translatedPlan.promptEn,
            databasePlanVersionId: contentChangedDuringSave
              ? currentPlan.databasePlanVersionId
              : translatedPlan.databasePlanVersionId,
            promptDirty: contentChangedDuringSave
          }
        })
      }))

      return nextPlans
    } catch (error) {
      alert('策略英文执行稿生成失败：' + error.message)
      return null
    } finally {
      setSavingStrategyTranslations((prev) => {
        const next = { ...prev }
        dirtyPlans.forEach((plan) => {
          delete next[plan.taskKey]
        })
        return next
      })
    }
  }

  const handleGenerate = async () => {
    if (generating) return
    setGenerating(true)
    setStopping(false)
    stoppingRef.current = false
    
    let allPlans = buildDefaultPlansFromTasks(listing.selectedImageTasks, listing.imagePlans || [])
    const selectedImageCount = getSelectedImageTaskCount(listing.selectedImageTasks)

    if (selectedImageCount === 0 || allPlans.length === 0) {
      alert('请先选择至少 1 张要生成的图片任务。')
      setGenerating(false)
      return
    }
    
    const missingPlans = allPlans.filter(p => !p.strategyContent || p.strategyContent.trim() === '')
    if (missingPlans.length > 0) {
      alert(`以下图片缺少策略：${missingPlans.map(p => `图${p.id}`).join(', ')}`)
      setGenerating(false)
      return
    }

    const plansNeedingSavedPrompt = allPlans.filter(
      (plan) =>
        plan.taskType !== 'main' &&
        (plan.promptDirty || !String(plan.promptEn || '').trim())
    )
    if (plansNeedingSavedPrompt.length > 0) {
      alert(`以下图片的英文执行稿未保存：${plansNeedingSavedPrompt.map(p => `图${p.id}`).join(', ')}。请先保存英文执行稿后再生成。`)
      setGenerating(false)
      return
    }

    const taskId = Date.now()
    setCurrentTaskId(taskId)
    setStopping(false)
    const listingSnapshot = buildListingPayload(listing, { includeGenerationSettings: true })
    const newTask = {
      id: taskId,
      status: 'generating',
      images: allPlans.map(plan => {
        const normalizedPlan = normalizeImagePlan(plan)
        return {
        imageId: normalizedPlan.id,
        name: normalizedPlan.name,
        taskType: normalizedPlan.taskType,
        status: 'pending',
        imageUrl: null,
        imageRole: normalizedPlan.imageRole,
        sellingFocus: normalizedPlan.sellingFocus,
        currentImageProductUsage: normalizedPlan.currentImageProductUsage,
        executionRules: normalizedPlan.executionRules,
        copy: normalizedPlan.copy,
        strategyContent: normalizedPlan.strategyContent,
        promptEn: normalizedPlan.promptEn,
        promptDirty: normalizedPlan.promptDirty,
        versions: [],
        regenerationError: null,
        error: null,
        actualResolution: null,
        requestedResolution: selectedResolution === '4k' ? '4096x4096' : '2048x2048'
      }
      }),
      listing: listingSnapshot,
      resolution: selectedResolution,
      createdAt: new Date().toISOString()
    }
    
    setTasks(prev => [newTask, ...prev])
    
    try {
      let referenceImages = uploadedReferenceImages

      if (!referenceImages.length) {
        const formData = new FormData()
        const orderedProductImages = orderImagesByPrimary(productImages, primaryProductImageIndex)
        orderedProductImages.forEach(img => formData.append('images', img))

        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        })
        const uploadData = await parseApiJson(uploadResponse, '图片上传接口')

        if (!uploadData.success) {
          throw new Error('图片上传失败')
        }

        referenceImages = uploadData.images.map(img => img.url)
        setUploadedReferenceImages(referenceImages)
      }

      const primaryReferenceImageUrl = getPrimaryReferenceImageUrl(referenceImages)

      setTasks(prev => prev.map(task => {
        if (task.id === taskId) {
          return { ...task, referenceImages, primaryReferenceImageUrl }
        }
        return task
      }))

      for (let i = 0; i < allPlans.length; i++) {
        const plan = allPlans[i]
        
        if (stoppingRef.current) {
          console.log('用户取消生成')
          setTasks(prev => prev.map(task => {
            if (task.id === taskId) {
              return { ...task, status: 'stopped' }
            }
            return task
          }))
          break
        }
        
        setTasks(prev => prev.map(task => {
          if (task.id === taskId) {
            return {
              ...task,
              images: task.images.map(img => 
                img.imageId === plan.id ? { ...img, status: 'generating' } : img
              )
            }
          }
          return task
        }))
        
        try {
          const generatedImage = await requestGeneratedImage({
            listing: listingSnapshot,
            plan,
            resolution: selectedResolution,
            referenceImages,
            primaryReferenceImageUrl,
            label: `图片生成接口（图${plan.id}）`
          })

          setTasks(prev => prev.map(task => {
              if (task.id === taskId) {
                return {
                  ...task,
                  images: task.images.map(img => 
                    img.imageId === plan.id
                      ? { ...buildCompletedImageState(img, generatedImage, plan), versions: img.versions || [] }
                      : img
                  )
                }
              }
              return task
          }))
        } catch (error) {
        console.error(`图${plan.id} 生成失败:`, error)
          
          setTasks(prev => prev.map(task => {
            if (task.id === taskId) {
              return {
                ...task,
                images: task.images.map(img => 
                  img.imageId === plan.id ? { 
                    ...img, 
                    status: 'failed', 
                    name: img.name,
                    taskType: img.taskType,
                    error: error.message 
                  } : img
                )
              }
            }
            return task
          }))
        }
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      
      setTasks(prev => prev.map(task => {
        if (task.id === taskId) {
          if (task.status === 'stopped') {
            return task
          }
          const allCompleted = task.images.every(img => img.status === 'completed')
          return {
            ...task,
            status: allCompleted ? 'completed' : 'partial'
          }
        }
        return task
      }))
      
    } catch (error) {
      console.error('生成失败:', error)
      setTasks(prev => prev.map(task => {
        if (task.id !== taskId) return task

        return {
          ...task,
          status: 'failed',
          images: task.images.map(img =>
            img.status === 'completed'
              ? img
              : { ...img, status: 'failed', error: error.message }
          )
        }
      }))
      alert('生成失败：' + error.message)
    } finally {
      setGenerating(false)
      setStopping(false)
      setCurrentTaskId(null)
    }
  }
  const handleRegenerate = async (task, imageIndex, options = {}) => {
    if (generating) return
    const image = task.images[imageIndex]
    if (!image || image.status === 'generating') return

    const requestedPrompt = String(options.prompt ?? image.strategyContent ?? '').trim()
    const requestedComplexity = String(options.complexity || task?.listing?.complexity || listing.complexity || 'L2').trim()
    const referenceFiles = Array.isArray(options.referenceFiles) ? options.referenceFiles.slice(0, 1) : []
    const providedReferenceImageUrls = Array.isArray(options.referenceImageUrls)
      ? options.referenceImageUrls.filter(Boolean)
      : []
    const providedExecutionRules = Array.isArray(options.executionRules) ? options.executionRules : null
    const providedPromptEn = String(options.promptEn || '').trim()
    const strategyChanged = requestedPrompt !== String(image.strategyContent || '').trim()
    
    const planToUse = normalizeImagePlan({
      id: image.imageId,
      name: image.name,
      type: image.taskType,
      taskType: image.taskType,
      imageRole: image.imageRole || '',
      sellingFocus: image.sellingFocus || '',
      executionRules: providedExecutionRules || image.executionRules || [],
      copy: image.copy || [],
      strategyContent: requestedPrompt,
      promptEn: providedPromptEn || (strategyChanged ? '' : image.promptEn),
      promptDirty: providedPromptEn ? false : strategyChanged,
      regenerationMode: true
    })
    
    if (!planToUse.strategyContent || planToUse.strategyContent.trim() === '') {
      alert('这张图片没有可用的策略内容')
      return
    }

    const previousVersion = buildImageVersionSnapshot(image)
    const hadCurrentImage = Boolean(image.imageUrl)
    
    const taskId = Date.now()
    setCurrentTaskId(taskId)
    setGenerating(true)
    
    setTasks(prev => prev.map(t => {
      if (t.id === task.id) {
        return {
          ...t,
          images: t.images.map((img, idx) => {
            if (idx === imageIndex) {
              return {
                ...img,
                status: 'regenerating',
                error: null,
                regenerationError: null
              }
            }
            return img
          })
        }
      }
      return t
    }))
    
    try {
      const taskListing = {
        ...(task.listing || buildListingPayload(listing, { includeGenerationSettings: true })),
        complexity: requestedComplexity
      }
      const primaryReferenceImageUrl =
        task.primaryReferenceImageUrl || getPrimaryReferenceImageUrl(task.referenceImages || [])
      const additionalReferenceImages = await uploadReferenceFiles(
        referenceFiles,
        `图${image.imageId}追加参考图上传接口`
      )
      const regenerationReferenceImages = [
        ...(task.referenceImages || []),
        ...providedReferenceImageUrls,
        ...additionalReferenceImages
      ].filter((url, index, source) => url && source.indexOf(url) === index)
      const generatedImage = await requestGeneratedImage({
        listing: taskListing,
        plan: planToUse,
        resolution: task.resolution || selectedResolution,
        referenceImages: regenerationReferenceImages,
        primaryReferenceImageUrl,
        regenerationReferenceImages: [
          ...providedReferenceImageUrls,
          ...additionalReferenceImages
        ],
        label: `图片生成接口（图${image.imageId}）`
      })

      setTasks(prev => prev.map(t => {
          if (t.id === task.id) {
            return {
              ...t,
              images: t.images.map((img, idx) => {
                if (idx === imageIndex) {
                  const nextVersions = previousVersion
                    ? [previousVersion, ...(Array.isArray(img.versions) ? img.versions : [])].slice(0, 8)
                    : (img.versions || [])

                  return {
                    ...buildCompletedImageState(img, generatedImage, planToUse),
                    versions: nextVersions,
                    lastRegeneration: {
                      strategy: requestedPrompt,
                      complexity: requestedComplexity,
                      baseReferenceCount: (task.referenceImages || []).length,
                      addedReferenceCount: additionalReferenceImages.length + providedReferenceImageUrls.length,
                      usedReferenceCount: regenerationReferenceImages.length,
                      generatedAt: new Date().toISOString()
                    }
                  }
                }
                return img
              })
            }
          }
          return t
      }))
      return generatedImage
    } catch (error) {
      console.error('重新生成失败:', error)
      if (!options.suppressAlert) {
        alert(`图${image.imageId} 重新生成失败：${error.message}`)
      }
      
      setTasks(prev => prev.map(t => {
        if (t.id === task.id) {
          return {
            ...t,
            images: t.images.map((img, idx) => {
              if (idx === imageIndex) {
                return { 
                  ...img, 
                  status: hadCurrentImage ? 'completed' : 'failed',
                  error: hadCurrentImage ? null : error.message,
                  regenerationError: error.message
                }
              }
              return img
            })
          }
          }
          return t
      }))
      return null
    } finally {
      setGenerating(false)
      setCurrentTaskId(null)
    }
  }
  
  const handleStop = () => {
    if (currentTaskId) {
      setStopping(true)
      stoppingRef.current = true
      setTasks(prev => prev.map(task => {
        if (task.id === currentTaskId) {
          return { ...task, status: 'stopping' }
        }
        return task
      }))
    }
  }

  const handleContinue = async (task) => {
    if (!task || task.status !== 'stopped') return
    const taskId = task.id
    setCurrentTaskId(taskId)
    setStopping(false)
    stoppingRef.current = false
    
    const pendingPlans = task.images
      .filter(img => img.status !== 'completed')
      .map(img => normalizeImagePlan({
        id: img.imageId,
        name: img.name,
        type: img.taskType,
        taskType: img.taskType,
        imageRole: img.imageRole || '',
        sellingFocus: img.sellingFocus || '',
        executionRules: img.executionRules || [],
        copy: img.copy || [],
        strategyContent: img.strategyContent || '',
        promptEn: img.promptEn,
        promptDirty: img.promptDirty
      }))
    
    if (pendingPlans.length === 0) {
      setCurrentTaskId(null)
      return
    }

    setGenerating(true)
    
    setTasks(prev => prev.map(t => {
      if (t.id === task.id) {
        return { ...t, status: 'generating' }
      }
      return t
    }))
    
    const referenceImages = task.referenceImages || []
    const primaryReferenceImageUrl =
      task.primaryReferenceImageUrl || getPrimaryReferenceImageUrl(referenceImages)
    
    let aborted = false
    for (let i = 0; i < pendingPlans.length; i++) {
      const plan = pendingPlans[i]
      
      if (stoppingRef.current) {
        console.log('用户取消生成')
        aborted = true
        setTasks(prev => prev.map(t => {
          if (t.id === task.id) {
            return { ...t, status: 'stopped' }
          }
          return t
        }))
        break
      }
      
      setTasks(prev => prev.map(t => {
        if (t.id === task.id) {
          return {
            ...t,
            images: t.images.map(img => 
              img.imageId === plan.id ? { ...img, status: 'generating' } : img
            )
          }
        }
        return t
      }))
      
      try {
        const generatedImage = await requestGeneratedImage({
          listing: task.listing,
          plan,
          resolution: task.resolution,
          referenceImages,
          primaryReferenceImageUrl,
          label: `图片生成接口（图${plan.id}）`
        })

        setTasks(prev => prev.map(t => {
            if (t.id === task.id) {
              return {
                ...t,
                images: t.images.map(img => 
                  img.imageId === plan.id
                    ? { ...buildCompletedImageState(img, generatedImage, plan), versions: img.versions || [] }
                    : img
                )
              }
            }
            return t
        }))
      } catch (error) {
        console.error(`图${plan.id} 生成失败:`, error)
        setTasks(prev => prev.map(t => {
          if (t.id === task.id) {
            return {
              ...t,
              images: t.images.map(img => 
                img.imageId === plan.id ? { 
                  ...img, 
                  status: 'failed', 
                  error: error.message 
                } : img
              )
            }
          }
          return t
        }))
      }
      
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    if (!aborted) {
      setTasks(prev => prev.map(t => {
        if (t.id === task.id) {
          const allCompleted = t.images.every(img => img.status === 'completed')
          return {
            ...t,
            status: allCompleted ? 'completed' : 'partial'
          }
        }
        return t
      }))
    }

    setGenerating(false)
    setStopping(false)
    setCurrentTaskId(null)
  }

  const handleSaveStrategyTranslationForPlan = async (taskKey, planSnapshot) => {
    const currentPlans = buildDefaultPlansFromTasks(listing.selectedImageTasks, listing.imagePlans || [])
    const snapshot = planSnapshot || currentPlans.find((plan) => plan.taskKey === taskKey)
    if (!snapshot) return

    const plans = currentPlans.map((plan) => (plan.taskKey === taskKey ? { ...plan, ...snapshot } : plan))
    await syncStrategyTranslations(plans, [taskKey])
  }

  const handleDownload = async (imageUrl, filename, requestedResolution) => {
    const resolveDownloadUrl = (url) => {
      const parsedUrl = new URL(url, window.location.origin)

      if (
        ['localhost', '127.0.0.1'].includes(parsedUrl.hostname) &&
        !['localhost', '127.0.0.1'].includes(window.location.hostname)
      ) {
        return parsedUrl.pathname + parsedUrl.search
      }

      return parsedUrl.href
    }

    try {
      const downloadUrl = resolveDownloadUrl(imageUrl)
      const response = await fetch(downloadUrl, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`图片文件不可访问（HTTP ${response.status}）`)
      }

      const blob = await response.blob()
      if (!blob || blob.size === 0) {
        throw new Error('图片文件为空，可能已被服务器清理')
      }

      let downloadBlob = blob

      try {
        downloadBlob = await resizeImageBlobForDownload(blob, requestedResolution)
      } catch (resizeError) {
        console.warn('下载尺寸整理失败，改为下载原图', resizeError)
      }

      const url = window.URL.createObjectURL(downloadBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('下载失败:', error)
      alert('下载失败：' + (error.message === 'Failed to fetch' ? '图片地址无法访问，请刷新页面或确认服务器 /uploads 代理正常。' : error.message))
    }
  }
  const handleDownloadAll = async (images) => {
    try {
      for (const img of images) {
        if (img.imageUrl) {
          await handleDownload(img.imageUrl, `image-${img.imageId}.png`, img.requestedResolution)
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      }
    } catch (error) {
      console.error('批量下载失败:', error)
      alert('批量下载失败：' + error.message)
    }
  }
  const canGenerate = (listing.productName || listing.listingInfo) && productImages.length > 0
  const selectedImageCount = getSelectedImageTaskCount(listing.selectedImageTasks)
  return (
    <div className="app">
      <header className="header">
        <h1>Amazon Image Studio</h1>
        <span className="subtitle">Amazon Image Generator - Powered by GPT-Image-2</span>
      </header>

      <WorkspaceChatButton onClick={() => setIsWorkspaceChatOpen(true)} />

      <main className="main">
        <div className="workspace-layout">
          <div className="workspace-column workspace-column-left">
            <section className="section workspace-panel">
              <div className="panel-heading">
                <h2>产品素材</h2>
              </div>
              <ProductImageUploader
                images={productImages}
                onChange={(images) => {
                  setProductImages(images)
                  setUploadedReferenceImages([])
                  setListing((prev) => ({
                    ...prev,
                    ...buildInvalidatedAnalysisState(prev)
                  }))
                }}
                primaryIndex={primaryProductImageIndex}
                onPrimaryChange={(index) => {
                  setPrimaryProductImageIndex(index)
                  setUploadedReferenceImages([])
                  setListing((prev) => ({
                    ...prev,
                    ...buildInvalidatedAnalysisState(prev)
                  }))
                }}
              />
            </section>

            <section className="section workspace-panel">
              <div className="panel-heading">
                <h2>商品输入与偏好</h2>
              </div>
              <AmazonListingForm
                listing={listing}
                onChange={handleListingChange}
                mode="product"
              />
            </section>
          </div>

          <div className="workspace-column workspace-column-center">
            <section className="section workspace-panel">
              <div className="panel-heading">
                <h2>出图规划</h2>
              </div>
              <AmazonListingForm
                listing={listing}
                onChange={handleListingChange}
                mode="strategy"
                onSaveStrategyTranslation={handleSaveStrategyTranslationForPlan}
                savingStrategyTranslations={savingStrategyTranslations}
                analyzer={
                  <AgentAnalyzer
                    listing={listing}
                    productImages={orderImagesByPrimary(productImages, primaryProductImageIndex)}
                    referenceImages={uploadedReferenceImages}
                    primaryReferenceImageUrl={getPrimaryReferenceImageUrl(uploadedReferenceImages)}
                    onReferenceImagesChange={setUploadedReferenceImages}
                    onAnalyzeComplete={handleAgentAnalyzeComplete}
                  />
                }
              />
            </section>
          </div>

          <div className="workspace-column workspace-column-right">
            <section className="section workspace-panel action-panel">
              <div className="panel-heading">
                <h2>开始生成</h2>
              </div>
              <div className="stack-panel-group action-panel-group">
                <div className="sub-panel compact-sub-panel">
                  <ResolutionSelector
                    selected={selectedResolution}
                    onChange={setSelectedResolution}
                  />
                </div>

                <div className="sub-panel generate-panel compact-sub-panel">
                  <GenerateButton
                    onClick={handleGenerate}
                    onStop={handleStop}
                    disabled={!canGenerate || selectedImageCount === 0 || generating}
                    generating={generating}
                    stopping={stopping}
                    imageCount={selectedImageCount}
                  />
                  {!canGenerate && (
                    <div className="generate-hint">
                      请先上传产品图片，并填写产品信息后再开始生成。
                    </div>
                  )}
                  {canGenerate && selectedImageCount === 0 && (
                    <div className="generate-hint">
                      请先在中间区域选择要生成的图片类型和张数。
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="section workspace-panel results-panel">
              <div className="panel-heading">
                <h2>生成结果</h2>
              </div>
              <TaskGrid
                tasks={tasks}
                onRegenerate={handleRegenerate}
                onDownload={handleDownload}
                onDownloadAll={handleDownloadAll}
                onContinue={handleContinue}
              />
            </section>
          </div>
        </div>

      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
      <WorkspaceChatModal
        isOpen={isWorkspaceChatOpen}
        onClose={() => setIsWorkspaceChatOpen(false)}
      />
    </div>
  )
}

export default App



