import { useState } from 'react'
import './ProductImageUploader.css'

export default function ProductImageUploader({ images, onChange }) {
  const [previewUrls, setPreviewUrls] = useState([])
  const [compressing, setCompressing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // 压缩图片函数
  const compressImage = async (file, maxSize = 1920, quality = 0.85) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height

          // 如果图片超过最大尺寸，等比缩放
          if (width > maxSize || height > maxSize) {
            const ratio = Math.min(maxSize / width, maxSize / height)
            width = Math.floor(width * ratio)
            height = Math.floor(height * ratio)
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)

          // 转换为 JPEG 并压缩
          canvas.toBlob(
            (blob) => {
              if (blob) {
                // 创建新的 File 对象
                const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                  type: 'image/jpeg'
                })
                resolve(compressedFile)
              } else {
                reject(new Error('压缩失败'))
              }
            },
            'image/jpeg',
            quality
          )
        }
        img.onerror = () => reject(new Error('图片加载失败'))
        img.src = e.target.result
      }
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(file)
    })
  }

  // 处理文件选择（统一入口）
  const handleFilesSelected = async (files) => {
    if (files.length === 0) return

    setCompressing(true)

    try {
      // 压缩所有图片
      const compressedFiles = await Promise.all(
        files.map(file => compressImage(file))
      )

      // 保存压缩后的文件
      onChange(compressedFiles)

      // 生成预览图
      const urls = compressedFiles.map(file => URL.createObjectURL(file))
      setPreviewUrls(urls)
    } catch (error) {
      console.error('图片压缩失败:', error)
      alert('图片压缩失败，请尝试其他图片')
      // 如果压缩失败，使用原图
      onChange(files)
      const urls = files.map(file => URL.createObjectURL(file))
      setPreviewUrls(urls)
    } finally {
      setCompressing(false)
    }
  }

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files)
    handleFilesSelected(files)
  }

  // 拖拽事件处理
  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith('image/')
    )
    
    if (files.length === 0) return
    
    handleFilesSelected(files)
  }

  const handleRemoveImage = (index) => {
    const newFiles = images.filter((_, i) => i !== index)
    const newUrls = previewUrls.filter((_, i) => i !== index)
    
    onChange(newFiles)
    setPreviewUrls(newUrls)
  }

  return (
    <div className="product-image-uploader">
      <div className="uploader-header">
        <label className="required-label">
          产品图片 *
        </label>
        <span className="help-text">
          至少上传 1 张产品图，支持多张（不同角度）
        </span>
      </div>

      <div 
        className={`upload-area ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          id="product-image-input"
          className="file-input"
          disabled={compressing}
        />
        <label htmlFor="product-image-input" className={`upload-label ${compressing ? 'compressing' : ''}`}>
          {compressing ? (
            <>
              <div className="upload-icon loading">⏳</div>
              <div className="upload-text">正在压缩图片...</div>
              <div className="upload-hint">自动压缩到 1920x1920 以内，转换为 JPG 格式</div>
            </>
          ) : (
            <>
              <div className="upload-icon">📷</div>
              <div className="upload-text">点击或拖拽上传图片</div>
              <div className="upload-hint">支持 JPG/PNG，自动压缩优化</div>
            </>
          )}
        </label>
      </div>

      {previewUrls.length > 0 && (
        <div className="image-preview-grid">
          {previewUrls.map((url, index) => (
            <div key={index} className="preview-item">
              <img src={url} alt={`产品图 ${index + 1}`} />
              <div className="preview-overlay">
                <span className="preview-number">图 {index + 1}</span>
                <button
                  className="remove-btn"
                  onClick={() => handleRemoveImage(index)}
                  title="删除"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(images && images.length > 0) && (
        <div className="image-count">
          ✅ 已上传 {images.length} 张产品图
        </div>
      )}
    </div>
  )
}
