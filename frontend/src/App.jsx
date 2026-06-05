import { useState, useEffect } from 'react'
import AmazonListingForm from './components/AmazonListingForm'
import ProductImageUploader from './components/ProductImageUploader'
import ImagePlanCard from './components/ImagePlanCard'
import TaskGrid from './components/TaskGrid'
import GenerateButton from './components/GenerateButton'
import StyleSelector from './components/StyleSelector'
import ResolutionSelector from './components/ResolutionSelector'
import ComplianceCheckPanel from './components/ComplianceCheckPanel'
import SettingsModal from './components/SettingsModal'
import SettingsButton from './components/SettingsButton'
import { loadConfig, saveConfig, isConfigured } from './utils/apiConfig'
import './App.css'

function App() {
  const [listing, setListing] = useState({
    productName: '',
    category: '',
    dimensions: '',
    material: '',
    targetAudience: '',
    sellingPoints: '',
    sceneRequirements: '',
    marketplace: '',
    imageType: 'main',
    competitorAsin: '',
    productImage: null
  })
  
  const [productImages, setProductImages] = useState([])
  const [imagePlans, setImagePlans] = useState(
    Array(7).fill(null).map((_, i) => ({
      id: i + 1,
      scene: '',
      composition: '',
      colorTone: i === 0 ? 'Pure white background (RGB 255,255,255)' : '',
      elements: ''
    }))
  )
  
  const [selectedStyle, setSelectedStyle] = useState('')
  const [selectedResolution, setSelectedResolution] = useState('2k')
  const [tasks, setTasks] = useState([])
  const [generating, setGenerating] = useState(false)
  
  // 设置相关状态
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [apiConfig, setApiConfig] = useState(loadConfig())
  const [showConfigWarning, setShowConfigWarning] = useState(!isConfigured())

  useEffect(() => {
    // 检查是否已配置 API Key
    if (!isConfigured()) {
      setShowConfigWarning(true)
      setTimeout(() => setShowConfigWarning(false), 8000)
    }
  }, [])

  const handleListingChange = (field, value) => {
    setListing(prev => ({ ...prev, [field]: value }))
  }

  const handleImagePlanChange = (id, field, value) => {
    setImagePlans(prev => prev.map(plan => 
      plan.id === id ? { ...plan, [field]: value } : plan
    ))
  }

  const handleSaveConfig = (config) => {
    setApiConfig(config)
    saveConfig(config)
    setShowConfigWarning(false)
  }

  const handleGenerate = async () => {
    setGenerating(true)
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

      // 然后生成图片（传递 API 配置）
      const generateResponse = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          listing, 
          imagePlans,
          imageType: listing.imageType,
          style: selectedStyle,
          resolution: selectedResolution,
          referenceImages,
          apiConfig
        })
      })
      const data = await generateResponse.json()
      
      if (data.success) {
        setTasks(prev => [{
          id: Date.now(),
          status: 'completed',
          images: data.images,
          listing: listing.productName,
          resolution: selectedResolution,
          createdAt: new Date().toISOString()
        }, ...prev])
      }
    } catch (error) {
      console.error('生成失败:', error)
      alert('生成失败：' + error.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleRegenerate = async (imageId) => {
    const plan = imagePlans.find(p => p.id === imageId)
    if (!plan) return

    try {
      const formData = new FormData()
      productImages.forEach(img => formData.append('images', img))

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })
      const uploadData = await uploadResponse.json()
      const referenceImages = uploadData.images.map(img => img.url)

      const generateResponse = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          listing, 
          imagePlans: [plan],
          imageType: listing.imageType,
          style: selectedStyle,
          resolution: selectedResolution,
          referenceImages,
          apiConfig
        })
      })
      const data = await generateResponse.json()
      
      if (data.success) {
        alert(`图${imageId} 重新生成成功！`)
      }
    } catch (error) {
      console.error('重新生成失败:', error)
      alert('重新生成失败：' + error.message)
    }
  }

  // 检查是否可以生成
  const canGenerate = listing.productName && productImages.length > 0

  return (
    <div className="app">
      <header className="header">
        <h1>🦐 亚马逊图片生成工具</h1>
        <span className="subtitle">Amazon Image Generator - Powered by GPT-Image-2</span>
      </header>
      
      {/* 设置按钮 */}
      <SettingsButton onClick={() => setIsSettingsOpen(true)} />
      
      {/* API 配置警告 */}
      {showConfigWarning && (
        <div className="config-warning-banner">
          ⚠️ 请先配置 API Key！点击右上角 ⚙️ 设置
          <button onClick={() => setIsSettingsOpen(true)}>立即配置</button>
        </div>
      )}
      
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
          <AmazonListingForm 
            listing={listing} 
            onChange={handleListingChange} 
          />
        </section>

        <section className="section">
          <StyleSelector 
            selectedStyle={selectedStyle}
            onSelectStyle={setSelectedStyle}
          />
        </section>

        <section className="section">
          <ResolutionSelector
            selected={selectedResolution}
            onChange={setSelectedResolution}
          />
        </section>

        <section className="section">
          <h2>🖼️ 3. 图片方案 ({listing.imageType === 'main' ? '7 张主图' : listing.imageType === 'aplus' ? 'A+ 页面图' : '主图+A+ 图'})</h2>
          <div className="image-plans-grid">
            {imagePlans.map(plan => (
              <ImagePlanCard
                key={plan.id}
                plan={plan}
                onChange={handleImagePlanChange}
                imageType={listing.imageType}
              />
            ))}
          </div>
        </section>

        <section className="section">
          <h2>✅ 4. 合规检查</h2>
          <ComplianceCheckPanel 
            listing={listing}
            imagePlans={imagePlans}
            imageType={listing.imageType}
          />
        </section>

        <section className="section">
          <GenerateButton 
            onClick={handleGenerate} 
            disabled={!canGenerate || generating} 
            generating={generating}
            imageCount={7}
          />
          {!canGenerate && (
            <div className="generate-hint">
              ⚠️ 请先上传产品图并填写产品名称
            </div>
          )}
          {!isConfigured() && (
            <div className="generate-hint warning">
              ⚠️ API Key 未配置，无法生成图片
            </div>
          )}
        </section>

        <section className="section">
          <h2>📋 生成任务</h2>
          <TaskGrid tasks={tasks} onRegenerate={handleRegenerate} />
        </section>
      </main>

      {/* 设置弹窗 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={apiConfig}
        onSave={handleSaveConfig}
      />
    </div>
  )
}

export default App
