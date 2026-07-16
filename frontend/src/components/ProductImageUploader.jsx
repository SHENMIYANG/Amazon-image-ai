import { useEffect, useState } from 'react'
import './ProductImageUploader.css'

const MAX_UPLOADS = 5
const NOTICE_DURATION_MS = 3200

function normalizePrimaryIndex(nextImages, currentPrimaryIndex = 0) {
  if (!nextImages.length) return 0
  if (currentPrimaryIndex < 0 || currentPrimaryIndex >= nextImages.length) return 0
  return currentPrimaryIndex
}

export default function ProductImageUploader({
  images,
  onChange,
  primaryIndex = 0,
  onPrimaryChange
}) {
  const [previewUrls, setPreviewUrls] = useState([])
  const [compressing, setCompressing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [notice, setNotice] = useState(null)

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

  useEffect(() => {
    if (!notice) return undefined

    const timer = window.setTimeout(() => {
      setNotice(null)
    }, NOTICE_DURATION_MS)

    return () => window.clearTimeout(timer)
  }, [notice])

  const imageCount = images?.length || 0
  const isAtLimit = imageCount >= MAX_UPLOADS
  const isEmpty = imageCount === 0

  const showNotice = (message, type = 'info') => {
    setNotice({ message, type, id: Date.now() })
  }

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

    if (isAtLimit) {
      showNotice(`最多上传 ${MAX_UPLOADS} 张参考图`, 'warning')
      return
    }

    setCompressing(true)

    try {
      const compressedFiles = await Promise.all(imageFiles.map((file) => compressImage(file)))
      const mergedImages = [...(images || []), ...compressedFiles]
      const trimmedImages = mergedImages.slice(0, MAX_UPLOADS)

      if (mergedImages.length > MAX_UPLOADS) {
        showNotice(`最多上传 ${MAX_UPLOADS} 张参考图，已自动保留前 ${MAX_UPLOADS} 张。`, 'warning')
      }

      onChange(trimmedImages)
      onPrimaryChange?.(normalizePrimaryIndex(trimmedImages, primaryIndex))
    } catch (error) {
      console.error('图片压缩失败:', error)
      showNotice('图片压缩失败，已保留原图上传。', 'warning')

      const mergedImages = [...(images || []), ...imageFiles]
      const trimmedImages = mergedImages.slice(0, MAX_UPLOADS)

      if (mergedImages.length > MAX_UPLOADS) {
        showNotice(`最多上传 ${MAX_UPLOADS} 张参考图，已自动保留前 ${MAX_UPLOADS} 张。`, 'warning')
      }

      onChange(trimmedImages)
      onPrimaryChange?.(normalizePrimaryIndex(trimmedImages, primaryIndex))
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
    if (isAtLimit || compressing) return
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)

    if (isAtLimit) {
      showNotice(`最多上传 ${MAX_UPLOADS} 张参考图`, 'warning')
      return
    }

    updateImages(Array.from(e.dataTransfer.files || []))
  }

  const handleRemoveImage = (index) => {
    const nextImages = images.filter((_, i) => i !== index)
    onChange(nextImages)

    if (!nextImages.length) {
      onPrimaryChange?.(0)
      return
    }

    if (index === primaryIndex) {
      onPrimaryChange?.(0)
      return
    }

    if (index < primaryIndex) {
      onPrimaryChange?.(primaryIndex - 1)
      return
    }

    onPrimaryChange?.(normalizePrimaryIndex(nextImages, primaryIndex))
  }

  const handleClearAll = () => {
    onChange([])
    onPrimaryChange?.(0)
    setNotice(null)
  }

  return (
    <div className="product-image-uploader">
      <div className="uploader-card">
        <div className="uploader-card-header">
          <div className="uploader-title-row">
            <label className="required-label">多视角白底商品&实拍图</label>
            <div
              className="uploader-help-anchor"
              onMouseEnter={() => setShowGuide(true)}
              onMouseLeave={() => setShowGuide(false)}
            >
              <button type="button" className="help-icon-btn" aria-label="查看上传提示">
                ?
              </button>

              {showGuide && (
                <div className="uploader-guide-popover">
                  <strong>图片上传建议：</strong>
                  <p>建议上传多角度白底产品图，再少量补充实拍图。</p>
                  <ul>
                    <li>优先上传完整清晰的产品全貌图</li>
                    <li>建议 1 张主图 + 2 到 4 张补充角度图</li>
                    <li>竞品图或风格图不建议混入产品基准图</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          className={`uploader-inner ${isDragging ? 'dragging' : ''} ${isAtLimit ? 'at-limit' : ''} ${
            isEmpty ? 'empty-state' : ''
          }`}
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
            disabled={compressing || isAtLimit}
          />

          {notice && (
            <div className="upload-popup-layer" aria-live="polite">
              <div className={`upload-popup upload-popup--${notice.type}`} role="status">
                <span className="upload-popup-icon">{notice.type === 'warning' ? '!' : 'i'}</span>
                <span className="upload-popup-text">{notice.message}</span>
              </div>
            </div>
          )}

          {isEmpty ? (
            <div className="empty-upload-box">
              <label
                htmlFor="product-image-input"
                className={`upload-primary-btn empty-upload-btn ${compressing || isAtLimit ? 'disabled' : ''}`}
                aria-disabled={compressing || isAtLimit}
              >
                {compressing ? '正在压缩图片...' : '上传'}
              </label>
              <div className="empty-upload-spec">10M以内，384*384 ~ 4096*4096，最大宽高比5</div>
            </div>
          ) : (
            <>
              <div className="image-preview-grid embedded-grid">
                {previewUrls.map((url, index) => {
                  const isPrimary = index === primaryIndex

                  return (
                    <div key={url} className={`preview-card ${isPrimary ? 'is-primary' : ''}`}>
                      <div className="preview-media">
                        <img src={url} alt={`产品图 ${index + 1}`} />
                        <button
                          type="button"
                          className="remove-btn"
                          onClick={() => handleRemoveImage(index)}
                          title="删除"
                        >
                          ×
                        </button>
                      </div>

                      <div className="preview-meta">
                        {isPrimary ? (
                          <span className="primary-label">主图</span>
                        ) : (
                          <button
                            type="button"
                            className="set-primary-btn"
                            onClick={() => onPrimaryChange?.(index)}
                          >
                            设为主图
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="uploader-actions">
                <label
                  htmlFor="product-image-input"
                  className={`upload-primary-btn ${compressing || isAtLimit ? 'disabled' : ''}`}
                  aria-disabled={compressing || isAtLimit}
                >
                  {compressing ? '正在压缩图片...' : `上传最多 ${MAX_UPLOADS} 张参考图`}
                </label>

                <button
                  type="button"
                  className="clear-btn"
                  onClick={handleClearAll}
                  disabled={!imageCount}
                >
                  清空
                </button>
              </div>

              <div className="uploader-status-row">
                <span className={`upload-status ${imageCount ? 'has-images' : ''}`}>
                  已上传 {imageCount} / {MAX_UPLOADS}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
