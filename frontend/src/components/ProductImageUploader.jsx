import { useState } from 'react'
import './ProductImageUploader.css'

export default function ProductImageUploader({ images, onChange }) {
  const [previewUrls, setPreviewUrls] = useState([])

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    // 保存文件对象
    onChange(files)

    // 生成预览图
    const urls = files.map(file => URL.createObjectURL(file))
    setPreviewUrls(urls)
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

      <div className="upload-area">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          id="product-image-input"
          className="file-input"
        />
        <label htmlFor="product-image-input" className="upload-label">
          <div className="upload-icon">📷</div>
          <div className="upload-text">点击上传图片</div>
          <div className="upload-hint">支持 JPG/PNG，建议 1000x1000 以上</div>
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

      {images.length > 0 && (
        <div className="image-count">
          ✅ 已上传 {images.length} 张产品图
        </div>
      )}
    </div>
  )
}
