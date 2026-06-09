import { useState, useEffect } from 'react'
import './SettingsModal.css'

export default function SettingsModal({ isOpen, onClose }) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [status, setStatus] = useState({ configured: false, baseUrl: '-' })

  useEffect(() => {
    if (isOpen) {
      // 获取后端配置状态
      fetch('/api/test-api-key/status')
        .then(res => res.json())
        .then(data => {
          setStatus({
            configured: data.configured,
            baseUrl: data.baseUrl || '-'
          })
        })
        .catch(() => {
          setStatus({ configured: false, baseUrl: '无法连接后端' })
        })
    }
  }, [isOpen])

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)

    try {
      const response = await fetch('/api/test-api-key', {
        method: 'POST'
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setTestResult({ 
          success: true, 
          message: '✅ API 配置有效！',
          testImage: data.testImage
        })
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
          <h2>⚙️ API 配置状态</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="config-section">
            <h3>📊 当前配置</h3>
            
            <div style={{ 
              padding: '1rem', 
              background: '#f8f9fa', 
              borderRadius: '6px',
              marginBottom: '1rem'
            }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>API Base URL:</strong> {status.baseUrl}
              </div>
              <div>
                <strong>配置状态:</strong>{' '}
                <span style={{ 
                  color: status.configured ? '#28a745' : '#dc3545',
                  fontWeight: 'bold'
                }}>
                  {status.configured ? '✅ 已配置' : '❌ 未配置'}
                </span>
              </div>
            </div>

            <p style={{ 
              color: '#6c757d', 
              fontSize: '0.9rem',
              fontStyle: 'italic'
            }}>
              ℹ️ API Key 已配置在后端 .env 文件中，前端无需设置
            </p>
          </div>

          <div className="config-section">
            <h3>🧪 测试连接</h3>
            
            <button 
              className="test-btn"
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? '🔄 测试中...' : '测试 API 连接'}
            </button>

            {testResult && (
              <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                <div style={{ marginBottom: testResult.testImage ? '1rem' : '0' }}>
                  {testResult.message}
                </div>
                {testResult.testImage && (
                  <div style={{ 
                    marginTop: '1rem', 
                    padding: '1rem', 
                    background: '#f8f9fa', 
                    borderRadius: '6px',
                    textAlign: 'center'
                  }}>
                    <p style={{ 
                      margin: '0 0 0.5rem 0', 
                      fontSize: '0.9rem', 
                      color: '#6c757d' 
                    }}>
                      🖼️ 测试生成图片：
                    </p>
                    <img 
                      src={testResult.testImage} 
                      alt="测试生成结果" 
                      style={{ 
                        maxWidth: '300px', 
                        maxHeight: '300px', 
                        borderRadius: '4px',
                        border: '2px solid #dee2e6'
                      }} 
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
