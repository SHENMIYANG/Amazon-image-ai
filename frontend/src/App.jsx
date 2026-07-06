import { useState, useEffect, useRef } from 'react'
import AmazonListingForm from './components/AmazonListingForm'
import ProductImageUploader from './components/ProductImageUploader'
import TaskGrid from './components/TaskGrid'
import GenerateButton from './components/GenerateButton'
// import StyleSelector from './components/StyleSelector'  // 已删除：冗余，被 TemplateSelector 替代
import ResolutionSelector from './components/ResolutionSelector'
import ComplianceCheckPanel from './components/ComplianceCheckPanel'
import SettingsModal from './components/SettingsModal'
import SettingsButton from './components/SettingsButton'
import AgentAnalyzer from './components/AgentAnalyzer'
import './App.css'

function extractProductName(listingInfo) {
  const lines = (listingInfo || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return ''

  const titleLine = lines.find(line => /^(title|product\s*name|产品名|产品名称|标题)[:：]/i.test(line))
  if (titleLine) {
    return titleLine.replace(/^(title|product\s*name|产品名|产品名称|标题)[:：]\s*/i, '').slice(0, 200)
  }

  return lines[0].replace(/^[-*•\d.、\s]+/, '').slice(0, 200)
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
    marketplace: '',
    imageType: 'basic', // 默认基础套图
    fontPreference: 'arial', // 默认 Arial 字体
    designNotes: '',
    additionalInfo: '',
    complexity: 'L2', // 默认标准版
    // productImage: null,  // 已删除：冗余字段，真正使用的是 productImages 数组
    imagePlans: [] // 7 张图片的策略数组
  })
  
  const [productImages, setProductImages] = useState([])
  
  // const [selectedStyle, setSelectedStyle] = useState('')  // 已删除：冗余，被 listing.imageType 替代
  const [selectedResolution, setSelectedResolution] = useState('2k')
  const [selectedComplexity, setSelectedComplexity] = useState('L2') // 默认标准版
  const [tasks, setTasks] = useState([])
  const [generating, setGenerating] = useState(false)
  const [stopping, setStopping] = useState(false) // 停止标志
  const [currentTaskId, setCurrentTaskId] = useState(null) // 当前生成中的任务 ID
  
  // 使用 ref 存储 stopping 状态，避免异步循环中捕获旧值
  const stoppingRef = useRef(false)
  
  // 设置相关状态
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const handleListingChange = (field, value) => {
    if (field === 'listingInfo') {
      setListing(prev => ({
        ...prev,
        listingInfo: value,
        productName: extractProductName(value),
        sellingPoints: value
      }))
      return
    }

    setListing(prev => ({ ...prev, [field]: value }))
  }

  // 处理 Agent 分析完成
  const handleAgentAnalyzeComplete = (analysisResult) => {
    const { imagePlans, sellingPointsAnalysis, _meta } = analysisResult
    
    // 只更新 imagePlans，不覆盖用户选择的风格
    setListing(prev => ({
      ...prev,
      imagePlans: imagePlans,
      _meta: _meta  // 保存元数据（包含 AI 推荐策略）
      // 注意：不使用 recommendedTemplate 覆盖用户的 imageType 选择
    }))
    
    // 可选：分析卖点映射关系，给用户提示
    if (sellingPointsAnalysis && sellingPointsAnalysis.length > 0) {
      console.log('卖点映射分析:', sellingPointsAnalysis)
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setStopping(false)
    stoppingRef.current = false
    
    // 验证：检查是否所有 7 张图都有策略
    const allPlans = [...(listing.imagePlans || [])]
    
    if (allPlans.length < 7) {
      alert('请填写所有 7 张图片的策略（图 1-7 都需要填写）')
      setGenerating(false)
      return
    }
    
    // 检查每张图是否都有 prompt
    const missingPlans = allPlans.filter(p => !p.prompt || p.prompt.trim() === '')
    if (missingPlans.length > 0) {
      alert(`以下图片缺少策略：${missingPlans.map(p => `图${p.id}`).join(', ')}`)
      setGenerating(false)
      return
    }
    
    // 创建新任务
    const taskId = Date.now()
    setCurrentTaskId(taskId)
    setStopping(false) // 确保停止标志重置
    const newTask = {
      id: taskId,
      status: 'generating',
      images: allPlans.map(plan => ({
        imageId: plan.id,
        status: 'pending',
        imageUrl: null,
        prompt: plan.prompt,
        error: null,
        actualResolution: null,
        requestedResolution: selectedResolution === '4k' ? '4096x4096' : '2048x2048'
      })),
      listing: { ...listing },
      // style: selectedStyle,  // 已删除：冗余
      resolution: selectedResolution,
      createdAt: new Date().toISOString()
    }
    
    // 先添加到任务列表
    setTasks(prev => [newTask, ...prev])
    
    try {
      // 先上传图片
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

      // 把参考图 URL 存进 task，供单张重新生成时使用
      setTasks(prev => prev.map(task => {
        if (task.id === taskId) {
          return { ...task, referenceImages }
        }
        return task
      }))

      // 逐张生成，实时更新状态
      let aborted = false
      for (let i = 0; i < allPlans.length; i++) {
        const plan = allPlans[i]
        
        // 检查是否点了停止
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
        
        // 如果这张图已经失败，跳过（允许单独重新生成）
        const currentTask = tasks.find(t => t.id === taskId)
        if (currentTask && currentTask.images[plan.id - 1]?.status === 'failed') {
          console.log(`图${plan.id} 已失败，跳过`)
          continue
        }
        
        // 更新当前图片状态为生成中
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
            body: JSON.stringify({ 
              listing, 
              imagePlans: [plan],
              imageType: listing.imageType,
              complexity: listing.complexity || 'L2',  // 使用 listing.complexity 而不是 selectedComplexity
              // style: selectedStyle,  // 已删除：冗余
              resolution: selectedResolution,
              referenceImages
            })
          })
          const data = await generateResponse.json()
          
          const generatedImage = data.images && data.images[0]
          const realSuccess = data.success && generatedImage && generatedImage.status === 'completed' && generatedImage.imageUrl

          if (realSuccess) {
            // 更新这张图片的状态（保留前端的 prompt）
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
                          error: null,
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
          
          // 更新为失败状态
          setTasks(prev => prev.map(task => {
            if (task.id === taskId) {
              return {
                ...task,
                images: task.images.map(img => 
                  img.imageId === plan.id ? { 
                    ...img, 
                    status: 'failed', 
                    error: error.message 
                  } : img
                )
              }
            }
            return task
          }))
        }
        
        // 稍微延迟，避免请求太快
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      
      // 全部完成后更新任务状态
      setTasks(prev => prev.map(task => {
        if (task.id === taskId) {
          // 如果是被停止的，保持 stopped 状态
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
      // 只有正常完成或失败时才重置，停止时不重置（让用户看到停止状态）
      if (!stopping) {
        setGenerating(false)
        setStopping(false)
        setCurrentTaskId(null)
      }
    }
  }

  // 单独重新生成某张图
  const handleRegenerate = async (task, imageIndex, newPrompt) => {
    const image = task.images[imageIndex]
    if (!image || image.status === 'generating') return
    
    // 从 task 本身获取 prompt，不依赖 listing.imagePlans
    const planToUse = {
      id: image.imageId,
      prompt: newPrompt || image.prompt
    }
    
    if (!planToUse.prompt || planToUse.prompt.trim() === '') {
      alert('该图片没有可用的 prompt')
      return
    }
    
    const taskId = Date.now()
    setCurrentTaskId(taskId)
    setGenerating(true)
    
    // 更新这张图为生成中
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
      const generateResponse = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          listing, 
          imagePlans: [planToUse],
          imageType: listing.imageType,
          complexity: task.listing?.complexity || listing.complexity || 'L2',  // 添加复杂度参数
          // style: selectedStyle,  // 已删除：冗余
          resolution: selectedResolution,
          referenceImages: task.referenceImages || []
        })
      })
      const data = await generateResponse.json()
      
      const generatedImage = data.images && data.images[0]
      const realSuccess = data.success && generatedImage && generatedImage.status === 'completed' && generatedImage.imageUrl

      if (realSuccess) {
        // 更新这张图片的状态
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
                    error: null,
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
        alert(`图${image.imageId} 重新生成成功！${newPrompt ? '（已使用新 prompt）' : ''}`)
      } else {
        // 即使外层 success: true，单张图片也可能实际失败（比如上游 API 异常）
        throw new Error(generatedImage?.error || data.message || '生成失败')
      }
    } catch (error) {
      console.error(`重新生成失败:`, error)
      alert(`图${image.imageId} 重新生成失败：${error.message}`)
      
      // 更新为失败状态
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
  
  // 停止生成
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

  // 继续生成（从停止的位置）
  const handleContinue = async (task) => {
    if (!task || task.status !== 'stopped') return
    
    // 继续使用原任务 ID，不要创建新的
    const taskId = task.id
    setCurrentTaskId(taskId)
    setStopping(false)
    stoppingRef.current = false
    
    // 找到未完成的图片
    const pendingPlans = task.images
      .filter(img => img.status !== 'completed')
      .map(img => ({
        id: img.imageId,
        prompt: img.prompt
      }))
    
    if (pendingPlans.length === 0) return
    
    // 更新任务状态为生成中
    setTasks(prev => prev.map(t => {
      if (t.id === task.id) {
        return { ...t, status: 'generating' }
      }
      return t
    }))
    
    const referenceImages = task.referenceImages || []
    
    // 继续逐张生成
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
      
      // 更新状态
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
          body: JSON.stringify({ 
            listing: task.listing, 
            imagePlans: [plan],
            imageType: task.listing.imageType,
            complexity: task.listing.complexity || 'L2',  // 添加复杂度参数
            style: task.style,
            resolution: task.resolution,
            referenceImages
          })
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
                    error: null,
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
      
      // 稍微延迟
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    // 更新最终状态
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
      setGenerating(false)
      setCurrentTaskId(null)
    }
  }

  // 下载单张图片
  const handleDownload = async (imageUrl, filename) => {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
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

  // 批量下载所有图片
  const handleDownloadAll = async (images) => {
    try {
      for (const img of images) {
        if (img.imageUrl) {
          await handleDownload(img.imageUrl, `image-${img.imageId}.png`)
          // 稍微延迟，避免浏览器限制
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      }
    } catch (error) {
      console.error('批量下载失败:', error)
      alert('批量下载失败：' + error.message)
    }
  }

  // 检查是否可以生成
  const canGenerate = (listing.productName || listing.listingInfo) && productImages.length > 0

  return (
    <div className="app">
      <header className="header">
        <h1>🦐 亚马逊图片生成工具</h1>
        <span className="subtitle">Amazon Image Generator - Powered by GPT-Image-2</span>
      </header>
      
      {/* 设置按钮 */}
      <SettingsButton onClick={() => setIsSettingsOpen(true)} />
      
      <main className="main">
        <section className="section">
          <h2>📷 1. 上传产品图（必需）</h2>
          <ProductImageUploader 
            images={productImages}
            onChange={setProductImages}
          />
        </section>

        <section className="section">
          <h2>📦 2. Listing 信息</h2>
          <AgentAnalyzer 
            listing={listing}
            onAnalyzeComplete={handleAgentAnalyzeComplete}
          />
          <AmazonListingForm 
            listing={listing} 
            onChange={handleListingChange} 
          />
        </section>

        {/* <section className="section">
          <StyleSelector 
            selectedStyle={selectedStyle}
            onSelectStyle={setSelectedStyle}
          />
        </section> */}  {/* 已删除：冗余，被 TemplateSelector 替代 */}

        <section className="section">
          <ResolutionSelector
            selected={selectedResolution}
            onChange={setSelectedResolution}
          />
        </section>

        <section className="section">
          <h2>✅ 合规检查</h2>
          <ComplianceCheckPanel 
            listing={listing}
            imageType={listing.imageType}
          />
        </section>

        <section className="section">
          <GenerateButton 
            onClick={handleGenerate} 
            onStop={handleStop}
            disabled={!canGenerate || generating} 
            generating={generating}
            stopping={stopping}
            imageCount={7}
          />
          {!canGenerate && (
            <div className="generate-hint">
              ⚠️ 请先上传产品图并填写产品名称
            </div>
          )}
        </section>

        <section className="section">
          <h2>📋 生成任务</h2>
          <TaskGrid 
            tasks={tasks} 
            onRegenerate={handleRegenerate}
            onDownload={handleDownload}
            onDownloadAll={handleDownloadAll}
            onContinue={handleContinue}
          />
        </section>
      </main>

      {/* 设置弹窗 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  )
}

export default App
