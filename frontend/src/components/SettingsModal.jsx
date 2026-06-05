import { useState, useEffect } from 'react'
import './SettingsModal.css'

export default function SettingsModal({ isOpen, onClose, config, onSave }) {
  const [formData, setFormData] = useState({
    baseUrl: 'https://api.openai.com/v1',
    endpoint: '/images/generations',
    apiKey: '',
    model: 'gpt-image-2',
    defaultSize: '2048x2048',
    defaultQuality: 'high'
  })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    if (config) {
      setFormData(config)
    }
  }, [config])

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = () => {
    onSave(formData)
    onClose()
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)

    try {
      // 通过后端代理测试 API Key（避免 CORS 问题）
      const response = await fetch('/api/test-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: formData.baseUrl,
          apiKey: formData.apiKey,
          model: formData.model
        })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setTestResult({ success: true, message: '✅ API Key 有效！' })
      } else {
        setTestResult({ 
          success: false, 
          message: `❌ 失败：${data.message || data.error}` 
        })
      }
    } catch (error) {
      setTestResult({ 
        success: false, 
        message: `❌ 错误：${error.message}` 
      })
    } finally {
      setTesting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⚙️ API 配置</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="config-section">
            <h3>🔗 接口配置</h3>
            
            <div className="form-group">
              <label>API Base URL</label>
              <input
                type="text"
                value={formData.baseUrl}
                onChange={e => handleChange('baseUrl', e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
              <small>OpenAI 或兼容接口的基础 URL</small>
            </div>

            <div className="form-group">
              <label>API Endpoint</label>
              <input
                type="text"
                value={formData.endpoint}
                onChange={e => handleChange('endpoint', e.target.value)}
                placeholder="/images/generations"
              />
              <small>Images API 端点</small>
            </div>
          </div>

          <div className="config-section">
            <h3>🔑 认证信息</h3>
            
            <div className="form-group">
              <label>API Key *</label>
              <input
                type="password"
                value={formData.apiKey}
                onChange={e => handleChange('apiKey', e.target.value)}
                placeholder="sk-proj-..."
              />
              <small>你的 OpenAI API Key</small>
            </div>

            <button 
              className="test-btn"
              onClick={handleTest}
              disabled={testing || !formData.apiKey}
            >
              {testing ? '🔄 测试中...' : '🧪 测试连接'}
            </button>

            {testResult && (
              <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                {testResult.message}
              </div>
            )}
          </div>

          <div className="config-section">
            <h3>🎨 模型配置</h3>
            
            <div className="form-group">
              <label>模型名称</label>
              <input
                type="text"
                value={formData.model}
                onChange={e => handleChange('model', e.target.value)}
                placeholder="gpt-image-2"
              />
              <small>使用的 AI 模型</small>
            </div>

            <div className="form-group">
              <label>默认尺寸</label>
              <select
                value={formData.defaultSize}
                onChange={e => handleChange('defaultSize', e.target.value)}
              >
                <option value="1024x1024">1024x1024</option>
                <option value="2048x2048">2048x2048 (2K)</option>
                <option value="4096x4096">4096x4096 (4K)</option>
              </select>
            </div>

            <div className="form-group">
              <label>默认质量</label>
              <select
                value={formData.defaultQuality}
                onChange={e => handleChange('defaultQuality', e.target.value)}
              >
                <option value="standard">Standard</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>取消</button>
          <button className="save-btn" onClick={handleSave}>💾 保存配置</button>
        </div>
      </div>
    </div>
  )
}
