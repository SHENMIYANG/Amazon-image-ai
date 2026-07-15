import { useState, useEffect, useRef } from 'react'
import AmazonListingForm from './components/AmazonListingForm'
import ProductImageUploader from './components/ProductImageUploader'
import TaskGrid from './components/TaskGrid'
import GenerateButton from './components/GenerateButton'
import ResolutionSelector from './components/ResolutionSelector'
import SettingsModal from './components/SettingsModal'
import SettingsButton from './components/SettingsButton'
import AgentAnalyzer from './components/AgentAnalyzer'
import { getMarketplaceDefaultLanguage } from './components/GenerationPreferences'
import {
  buildGenerateRequest,
  buildListingPayload,
  extractProductName,
  parseListingInfoSections
} from './utils/requestPayload'
import {
  buildDefaultPlansFromTasks,
  getDefaultImageTaskConfig,
  getSelectedImageTaskCount
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
    imageType: 'basic',
    fontPreference: 'auto',
    brandColorMode: 'auto',
    brandColor: '',
    designNotes: '',
    additionalInfo: '',
    complexity: 'L2',
    selectedImageTasks: getDefaultImageTaskConfig(),
    imagePlans: []
  })
  
  const [productImages, setProductImages] = useState([])
  
  const [selectedResolution, setSelectedResolution] = useState('2k')
  const [tasks, setTasks] = useState([])
  const [generating, setGenerating] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [currentTaskId, setCurrentTaskId] = useState(null)
  const stoppingRef = useRef(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

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
        listingInfo: value,
        productName: parsedSections.productName || extractProductName(value),
        sellingPoints: parsedSections.sellingPoints || value,
        category: parsedSections.category || '',
        dimensions: parsedSections.dimensions || '',
        material: parsedSections.material || '',
        targetAudience: parsedSections.targetAudience || ''
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
        imageLanguage: value,
        imageLanguageTouched: true
      }))
      return
    }

    setListing(prev => ({ ...prev, [field]: value }))
  }

  const handleAgentAnalyzeComplete = (analysisResult) => {
    const { imagePlans, _meta } = analysisResult
    setListing(prev => ({
      ...prev,
      imagePlans: imagePlans,
      imageType: _meta?.strategyUsed || prev.imageType,
      _meta: _meta
    }))
    
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setStopping(false)
    stoppingRef.current = false
    
    const allPlans = buildDefaultPlansFromTasks(listing.selectedImageTasks, listing.imagePlans || [])
    const selectedImageCount = getSelectedImageTaskCount(listing.selectedImageTasks)

    if (selectedImageCount === 0 || allPlans.length === 0) {
      alert('请先选择至少 1 张要生成的图片任务。')
      setGenerating(false)
      return
    }
    
    const missingPlans = allPlans.filter(p => !p.prompt || p.prompt.trim() === '')
    if (missingPlans.length > 0) {
      alert(`以下图片缺少策略：${missingPlans.map(p => `图${p.id}`).join(', ')}`)
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
      images: allPlans.map(plan => ({
        imageId: plan.id,
        name: plan.name,
        taskType: plan.taskType,
        status: 'pending',
        imageUrl: null,
        prompt: plan.prompt,
        promptEn: plan.promptEn || '',
        promptDirty: plan.promptDirty || false,
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
      const formData = new FormData()
      productImages.forEach(img => formData.append('images', img))

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })
      const uploadData = await uploadResponse.json()

      if (!uploadData.success) {
        throw new Error('图片上传失败')
      }

      const referenceImages = uploadData.images.map(img => img.url)

      setTasks(prev => prev.map(task => {
        if (task.id === taskId) {
          return { ...task, referenceImages }
        }
        return task
      }))

      let aborted = false
      for (let i = 0; i < allPlans.length; i++) {
        const plan = allPlans[i]
        
        if (stoppingRef.current) {
          console.log('用户取消生成')
          aborted = true
          setTasks(prev => prev.map(task => {
            if (task.id === taskId) {
              return { ...task, status: 'stopped' }
            }
            return task
          }))
          break
        }
        
        const currentTask = tasks.find(t => t.id === taskId)
        if (currentTask && currentTask.images[plan.id - 1]?.status === 'failed') {
          console.log(`图${plan.id} 已失败，跳过`)
          continue
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
            body: JSON.stringify(buildGenerateRequest(listingSnapshot, plan, selectedResolution, referenceImages))
          })
          const data = await generateResponse.json()
          
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
                          error: null,
                          prompt: generatedImage.promptZh || img.prompt,
                          promptEn: generatedImage.promptEn || generatedImage.prompt || img.promptEn || null,
                          promptDirty: false,
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
      alert('生成失败：' + error.message)
    } finally {
      setGenerating(false)
      setStopping(false)
      setCurrentTaskId(null)
    }
  }
  const handleRegenerate = async (task, imageIndex, newPrompt) => {
    const image = task.images[imageIndex]
    if (!image || image.status === 'generating') return
    
    const planToUse = {
      id: image.imageId,
      name: image.name,
      type: image.taskType,
      taskType: image.taskType,
      prompt: newPrompt || image.prompt,
      promptEn: newPrompt ? '' : image.promptEn,
      promptDirty: Boolean(newPrompt)
    }
    
    if (!planToUse.prompt || planToUse.prompt.trim() === '') {
      alert('这张图片没有可用的 Prompt')
      return
    }
    
    const taskId = Date.now()
    setCurrentTaskId(taskId)
    setGenerating(true)
    
    setTasks(prev => prev.map(t => {
      if (t.id === task.id) {
        return {
          ...t,
          images: t.images.map((img, idx) => {
            if (idx === imageIndex) {
              return { ...img, status: 'generating', error: null }
            }
            return img
          })
        }
      }
      return t
    }))
    
    try {
      const taskListing = task.listing || buildListingPayload(listing, { includeGenerationSettings: true })
      const generateResponse = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildGenerateRequest(
            taskListing,
            planToUse,
            task.resolution || selectedResolution,
            task.referenceImages || []
          )
        )
      })
      const data = await generateResponse.json()
      
      const generatedImage = data.images && data.images[0]
      const realSuccess = data.success && generatedImage && generatedImage.status === 'completed' && generatedImage.imageUrl

      if (realSuccess) {
        setTasks(prev => prev.map(t => {
          if (t.id === task.id) {
            return {
              ...t,
              images: t.images.map((img, idx) => {
                if (idx === imageIndex) {
                  return { 
                    ...img, 
                    status: 'completed', 
                    imageUrl: generatedImage.imageUrl,
                    name: generatedImage.name || img.name,
                    taskType: generatedImage.taskType || img.taskType,
                    error: null,
                    prompt: generatedImage.promptZh || img.prompt,
                    promptEn: generatedImage.promptEn || generatedImage.prompt || img.promptEn || null,
                    promptDirty: false,
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
        alert(`图${image.imageId} 重新生成成功${newPrompt ? '（已使用新 prompt）' : ''}`)
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
                  status: 'failed', 
                  error: error.message 
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
        prompt: img.prompt,
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
          body: JSON.stringify(buildGenerateRequest(task.listing, plan, task.resolution, referenceImages))
        })
        const data = await generateResponse.json()
        
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
                    error: null,
                    prompt: generatedImage.promptZh || img.prompt,
                    promptEn: generatedImage.promptEn || generatedImage.prompt || img.promptEn || null,
                    promptDirty: false,
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
                <p>先上传产品参考图，再补充 Listing 信息和卖点。</p>
              </div>
              <ProductImageUploader
                images={productImages}
                onChange={setProductImages}
              />
            </section>

            <section className="section workspace-panel">
              <div className="panel-heading">
                <h2>商品输入与偏好</h2>
                <p>这里统一填写产品信息、补充要求和生成偏好，作为后续分析与生图输入。</p>
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
                <p>先确定要出什么图、各出几张，再由 AI 结合参考图和产品信息补全方案。</p>
              </div>
              <AmazonListingForm
                listing={listing}
                onChange={handleListingChange}
                mode="strategy"
                analyzer={
                  <AgentAnalyzer
                    listing={listing}
                    productImages={productImages}
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
                <p>先选输出分辨率，再按当前任务数量开始生成。</p>
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
                <p>这里展示当前任务、预览、下载和单张重生成功能。</p>
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



