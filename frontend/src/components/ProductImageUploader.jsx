import { useEffect, useState } from 'react'
import './ProductImageUploader.css'

export default function ProductImageUploader({ images, onChange }) {
  const [previewUrls, setPreviewUrls] = useState([])
  const [compressing, setCompressing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const nextUrls = (images || []).map((file) => URL.createObjectURL(file))

    setPreviewUrls((prevUrls) => {
      prevUrls.forEach((url) => URL.revokeObjectURL(url))
      return nextUrls
    })

    return () => {
      nextUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [images])

  const compressImage = async (file, maxSize = 1920, quality = 0.82) => {
    const shouldCompress = file.size > 2 * 1024 * 1024

    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (e) => {
        const img = new Image()

        img.onload = () => {
          const needsResize = img.width > maxSize || img.height > maxSize

          if (!shouldCompress && !needsResize) {
            resolve(file)
            return
          }

          const scale = needsResize ? Math.min(maxSize / img.width, maxSize / img.height) : 1
          const width = Math.round(img.width * scale)
          const height = Math.round(img.height * scale)
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')

          canvas.width = width
          canvas.height = height
          ctx.drawImage(img, 0, 0, width, height)

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('图片压缩失败'))
                return
              }

              const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
                type: 'image/webp'
              })

              resolve(compressedFile.size < file.size ? compressedFile : file)
            },
            'image/webp',
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

  const updateImages = async (files) => {
    if (files.length === 0) return

    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) return

    setCompressing(true)

    try {
      const compressedFiles = await Promise.all(imageFiles.map((file) => compressImage(file)))
      onChange([...(images || []), ...compressedFiles])
    } catch (error) {
      console.error('图片压缩失败:', error)
      alert('图片压缩失败，已保留原图上传。')
      onChange([...(images || []), ...imageFiles])
    } finally {
      setCompressing(false)
    }
  }

  const handleFileChange = (e) => {
    updateImages(Array.from(e.target.files || []))
    e.target.value = ''
  }

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
    updateImages(Array.from(e.dataTransfer.files || []))
  }

  const handleRemoveImage = (index) => {
    const newFiles = images.filter((_, i) => i !== index)
    onChange(newFiles)
  }

  return (
    <div className="product-image-uploader">
      <div className="uploader-header">
        <label className="required-label">产品图片 *</label>
        <span className="help-text">
          至少上传 1 张产品参考图，支持多张不同角度。再次上传会继续追加，不会覆盖前面已经上传的图片。
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
        <label
          htmlFor="product-image-input"
          className={`upload-label ${compressing ? 'compressing' : ''}`}
        >
          {compressing ? (
            <>
              <div className="upload-icon loading">{'\u23F3'}</div>
              <div className="upload-text">正在压缩图片...</div>
              <div className="upload-hint">只压缩体积，不裁切、不补白、不改变产品全貌</div>
            </>
          ) : (
            <>
              <div className="upload-icon">{'\u{1F4E4}'}</div>
              <div className="upload-text">点击或拖拽上传产品图</div>
              <div className="upload-hint">支持 JPG / PNG / WebP，自动压缩体积，保留原图比例与全貌</div>
            </>
          )}
        </label>
      </div>

      {previewUrls.length > 0 && (
        <div className="image-preview-toolbar">
          <div className="image-count">
            {'\u2705'} 已上传 {images.length} 张产品图
          </div>
          <button type="button" className="upload-more-btn" onClick={() => document.getElementById('product-image-input')?.click()}>
            {'\u2795'} 继续上传
          </button>
        </div>
      )}

      {previewUrls.length > 0 && (
        <div className="image-preview-grid">
          {previewUrls.map((url, index) => (
            <div key={url} className="preview-item">
              <img src={url} alt={`产品图 ${index + 1}`} />
              <div className="preview-overlay">
                <span className="preview-number">图 {index + 1}</span>
                <button
                  className="remove-btn"
                  onClick={() => handleRemoveImage(index)}
                  title="删除"
                >
                  {'\u2715'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
