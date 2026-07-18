import { useState, useEffect, useRef } from 'react'
import AmazonListingForm from './components/AmazonListingForm'
import ComplexitySelector from './components/ComplexitySelector'
import ProductImageUploader from './components/ProductImageUploader'
import TaskGrid from './components/TaskGrid'
import GenerateButton from './components/GenerateButton'
import ResolutionSelector from './components/ResolutionSelector'
import SettingsModal from './components/SettingsModal'
import SettingsButton from './components/SettingsButton'
import AgentAnalyzer from './components/AgentAnalyzer'
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
  MAIN_IMAGE_FIXED_RULE
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

function buildImageVersionSnapshot(image = {}) {
  if (!image?.imageUrl) return null

  return {
    imageUrl: image.imageUrl,
    strategyContent: image.strategyContent || image.prompt || '',
    promptEn: image.promptEn || '',
    actualResolution: image.actualResolution || null,
    requestedResolution: image.requestedResolution || null,
    sizeMatchesRequest: image.sizeMatchesRequest,
    savedAt: new Date().toISOString()
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
  'selectedImageTasks'
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
    complexity: 'L1',
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
    const normalizedPlans = (imagePlans || []).map((plan) => ({
      ...plan,
      strategyContent:
        (plan.taskType || plan.type) === 'main'
          ? MAIN_IMAGE_FIXED_RULE
          : plan.strategyContent || plan.strategyBody || plan.prompt || '',
      imageRole: plan.imageRole || '',
      buyerQuestion: plan.buyerQuestion || '',
      primarySellingPoint: plan.primarySellingPoint || '',
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

  const syncStrategyTranslations = async (plansOverride = null, targetPlanIds = null) => {
    const plans = Array.isArray(plansOverride)
      ? plansOverride
      : buildDefaultPlansFromTasks(listing.selectedImageTasks, listing.imagePlans || [])
    const targetIdSet = Array.isArray(targetPlanIds) && targetPlanIds.length > 0
      ? new Set(targetPlanIds)
      : null
    const dirtyPlans = plans.filter(
      (plan) =>
        (!targetIdSet || targetIdSet.has(plan.id)) &&
        plan.taskType !== 'main' &&
        String(plan.strategyContent || '').trim() &&
        (plan.promptDirty || !String(plan.promptEn || '').trim())
    )

    if (dirtyPlans.length === 0) {
      return plans
    }

    const savingMap = dirtyPlans.reduce((acc, plan) => {
      acc[plan.id] = true
      return acc
    }, {})
    setSavingStrategyTranslations((prev) => ({ ...prev, ...savingMap }))

    try {
      const listingSnapshot = buildListingPayload(listing, { includeGenerationSettings: true })
      const translatedById = new Map()

      for (const plan of dirtyPlans) {
        const response = await fetch('/api/prompt-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listing: listingSnapshot,
            plan,
            resolution: selectedResolution === '4k' ? '4096x4096' : '2048x2048'
          })
        })

        const data = await parseApiJson(response, `策略英文执行稿接口（图${plan.id}）`)
        translatedById.set(plan.id, data.data?.promptEn || '')
      }

      const nextPlans = plans.map((plan) =>
        translatedById.has(plan.id)
          ? {
              ...plan,
              promptEn: translatedById.get(plan.id),
              promptDirty: false
            }
          : plan
      )

      setListing((prev) => ({
        ...prev,
        imagePlans: nextPlans
      }))

      return nextPlans
    } catch (error) {
      alert('策略英文执行稿生成失败：' + error.message)
      return null
    } finally {
      setSavingStrategyTranslations((prev) => {
        const next = { ...prev }
        dirtyPlans.forEach((plan) => {
          delete next[plan.id]
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

    const syncedPlans = await syncStrategyTranslations(allPlans)
    if (!syncedPlans) {
      setGenerating(false)
      return
    }
    allPlans = syncedPlans

    const taskId = Date.now()
    setCurrentTaskId(taskId)
    setStopping(false)
    const listingSnapshot = buildListingPayload(listing, { includeGenerationSettings: true })
    const newTask = {
      id: taskId,
      status: 'generating',
      images: allPlans.map(plan => ({
        imageId: plan.id,
        name: plan.name,
        taskType: plan.taskType,
        status: 'pending',
        imageUrl: null,
        imageRole: plan.imageRole || '',
        buyerQuestion: plan.buyerQuestion || '',
        primarySellingPoint: plan.primarySellingPoint || '',
        goal: plan.goal || '',
        layout: plan.layout || '',
        focus: plan.focus || '',
        textDensity: plan.textDensity || '',
        style: plan.style || '',
        visualKeywords: plan.visualKeywords || [],
        constraints: plan.constraints || [],
        hardConstraints: plan.hardConstraints || [],
        copy: plan.copy || [],
        allowTextOverlay: Boolean(plan.allowTextOverlay),
        visualBlueprint: plan.visualBlueprint || null,
        strategyContent: plan.strategyContent || plan.strategyBody || plan.prompt || '',
        promptEn: plan.promptEn || '',
        promptDirty: plan.promptDirty || false,
        versions: [],
        regenerationError: null,
        error: null,
        actualResolution: null,
        requestedResolution: selectedResolution === '4k' ? '4096x4096' : '2048x2048'
      })),
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
          const generateResponse = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              buildGenerateRequest(
                listingSnapshot,
                plan,
                selectedResolution,
                referenceImages,
                primaryReferenceImageUrl
              )
            )
          })
          const data = await parseApiJson(generateResponse, `图片生成接口（图${plan.id}）`)
          
          const generatedImage = data.images && data.images[0]
          const realSuccess = data.success && generatedImage && generatedImage.status === 'completed' && generatedImage.imageUrl

          if (realSuccess) {
            setTasks(prev => prev.map(task => {
              if (task.id === taskId) {
                return {
                  ...task,
                  images: task.images.map(img => 
                    img.imageId === plan.id 
                      ? { 
                          ...img, 
                          status: 'completed', 
                          imageUrl: generatedImage.imageUrl,
                          name: generatedImage.name || img.name,
                          taskType: generatedImage.taskType || img.taskType,
                          imageRole: generatedImage.imageRole || img.imageRole || '',
                          buyerQuestion: generatedImage.buyerQuestion || img.buyerQuestion || '',
                          primarySellingPoint: generatedImage.primarySellingPoint || img.primarySellingPoint || '',
                          error: null,
                          strategyContent: generatedImage.promptZh || img.strategyContent || img.prompt,
                          promptEn: generatedImage.promptEn || generatedImage.prompt || img.promptEn || null,
                          promptDirty: false,
                          versions: img.versions || [],
                          regenerationError: null,
                          actualResolution: generatedImage.actualResolution || null,
                          requestedResolution: generatedImage.resolution || img.requestedResolution,
                          sizeMatchesRequest: generatedImage.sizeMatchesRequest
                        } 
                      : img
                  )
                }
              }
              return task
            }))
          } else {
            throw new Error(generatedImage?.error || data.message || '生成失败')
          }
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

    const requestedPrompt = String(options.prompt ?? image.strategyContent ?? image.prompt ?? '').trim()
    const referenceFiles = Array.isArray(options.referenceFiles) ? options.referenceFiles.slice(0, 1) : []
    const strategyChanged = requestedPrompt !== String(image.strategyContent || image.prompt || '').trim()
    
    const planToUse = {
      id: image.imageId,
      name: image.name,
      type: image.taskType,
      taskType: image.taskType,
      imageRole: image.imageRole || '',
      buyerQuestion: image.buyerQuestion || '',
      primarySellingPoint: image.primarySellingPoint || '',
      goal: image.goal || '',
      layout: image.layout || '',
      focus: image.focus || '',
      textDensity: image.textDensity || '',
      style: image.style || '',
      visualKeywords: image.visualKeywords || [],
      constraints: image.constraints || [],
      hardConstraints: image.hardConstraints || [],
      copy: image.copy || [],
      allowTextOverlay: Boolean(image.allowTextOverlay),
      visualBlueprint: image.visualBlueprint || null,
      strategyContent: requestedPrompt,
      promptEn: strategyChanged ? '' : image.promptEn,
      promptDirty: strategyChanged,
      regenerationMode: true
    }
    
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
      const taskListing = task.listing || buildListingPayload(listing, { includeGenerationSettings: true })
      const primaryReferenceImageUrl =
        task.primaryReferenceImageUrl || getPrimaryReferenceImageUrl(task.referenceImages || [])
      const additionalReferenceImages = await uploadReferenceFiles(
        referenceFiles,
        `图${image.imageId}追加参考图上传接口`
      )
      const regenerationReferenceImages = [
        ...(task.referenceImages || []),
        ...additionalReferenceImages
      ].filter((url, index, source) => url && source.indexOf(url) === index)
      const generateResponse = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildGenerateRequest(
            taskListing,
            planToUse,
            task.resolution || selectedResolution,
            regenerationReferenceImages,
            primaryReferenceImageUrl,
            additionalReferenceImages
          )
        )
      })
      const data = await parseApiJson(generateResponse, `图片生成接口（图${image.imageId}）`)
      
      const generatedImage = data.images && data.images[0]
      const realSuccess = data.success && generatedImage && generatedImage.status === 'completed' && generatedImage.imageUrl

      if (realSuccess) {
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
                    ...img, 
                      status: 'completed', 
                      imageUrl: generatedImage.imageUrl,
                    name: generatedImage.name || img.name,
                    taskType: generatedImage.taskType || img.taskType,
                    imageRole: generatedImage.imageRole || img.imageRole || '',
                    buyerQuestion: generatedImage.buyerQuestion || img.buyerQuestion || '',
                    primarySellingPoint: generatedImage.primarySellingPoint || img.primarySellingPoint || '',
                    error: null,
                    strategyContent: generatedImage.promptZh || requestedPrompt,
                    promptEn: generatedImage.promptEn || generatedImage.prompt || img.promptEn || null,
                    promptDirty: false,
                    versions: nextVersions,
                    regenerationError: null,
                    lastRegeneration: {
                      strategy: requestedPrompt,
                      baseReferenceCount: (task.referenceImages || []).length,
                      addedReferenceCount: additionalReferenceImages.length,
                      usedReferenceCount: regenerationReferenceImages.length,
                      generatedAt: new Date().toISOString()
                    },
                    actualResolution: generatedImage.actualResolution || null,
                    requestedResolution: generatedImage.resolution || img.requestedResolution,
                    sizeMatchesRequest: generatedImage.sizeMatchesRequest
                  }
                }
                return img
              })
            }
          }
          return t
        }))
      } else {
        throw new Error(generatedImage?.error || data.message || '生成失败')
      }
    } catch (error) {
      console.error('重新生成失败:', error)
      alert(`图${image.imageId} 重新生成失败：${error.message}`)
      
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
      .map(img => ({
        id: img.imageId,
        name: img.name,
        type: img.taskType,
        taskType: img.taskType,
        imageRole: img.imageRole || '',
        buyerQuestion: img.buyerQuestion || '',
        primarySellingPoint: img.primarySellingPoint || '',
        goal: img.goal || '',
        layout: img.layout || '',
        focus: img.focus || '',
        textDensity: img.textDensity || '',
        style: img.style || '',
        visualKeywords: img.visualKeywords || [],
        constraints: img.constraints || [],
        hardConstraints: img.hardConstraints || [],
        copy: img.copy || [],
        allowTextOverlay: Boolean(img.allowTextOverlay),
        visualBlueprint: img.visualBlueprint || null,
        strategyContent: img.strategyContent || img.strategyBody || img.prompt || '',
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
        const generateResponse = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            buildGenerateRequest(
              task.listing,
              plan,
              task.resolution,
              referenceImages,
              primaryReferenceImageUrl
            )
          )
        })
        const data = await parseApiJson(generateResponse, `图片生成接口（图${plan.id}）`)
        
        const generatedImage = data.images && data.images[0]
        const realSuccess = data.success && generatedImage && generatedImage.status === 'completed' && generatedImage.imageUrl

        if (realSuccess) {
          setTasks(prev => prev.map(t => {
            if (t.id === task.id) {
              return {
                ...t,
                images: t.images.map(img => 
                  img.imageId === plan.id ? { 
                    ...img, 
                    status: 'completed', 
                    imageUrl: generatedImage.imageUrl,
                    name: generatedImage.name || img.name,
                    taskType: generatedImage.taskType || img.taskType,
                    imageRole: generatedImage.imageRole || img.imageRole || '',
                    buyerQuestion: generatedImage.buyerQuestion || img.buyerQuestion || '',
                    primarySellingPoint: generatedImage.primarySellingPoint || img.primarySellingPoint || '',
                    error: null,
                    strategyContent: generatedImage.promptZh || img.strategyContent || img.strategyBody || img.prompt,
                    promptEn: generatedImage.promptEn || generatedImage.prompt || img.promptEn || null,
                    promptDirty: false,
                    versions: img.versions || [],
                    regenerationError: null,
                    actualResolution: generatedImage.actualResolution || null,
                    requestedResolution: generatedImage.resolution || img.requestedResolution,
                    sizeMatchesRequest: generatedImage.sizeMatchesRequest
                  } : img
                )
              }
            }
            return t
          }))
        } else {
          throw new Error(generatedImage?.error || data.message || '生成失败')
        }
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

  const handleSaveStrategyTranslationForPlan = async (planId) => {
    const plans = buildDefaultPlansFromTasks(listing.selectedImageTasks, listing.imagePlans || [])
    await syncStrategyTranslations(plans, [planId])
  }

  const handleDownload = async (imageUrl, filename, requestedResolution) => {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
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
      alert('下载失败：' + error.message)
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

      <SettingsButton onClick={() => setIsSettingsOpen(true)} />

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
                  <ComplexitySelector
                    selected={listing.complexity}
                    onChange={(value) => handleListingChange('complexity', value)}
                  />
                </div>

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
    </div>
  )
}

export default App



