import { useEffect, useState } from 'react'
import './ProductImageUploader.css'

const MAX_UPLOADS = 5
const MAX_FILE_SIZE = 10 * 1024 * 1024
const MIN_IMAGE_SIDE = 384
const MAX_IMAGE_SIDE = 4096
const MAX_ASPECT_RATIO = 5
const NOTICE_DURATION_MS = 3200

function createValidationError(message) {
  const error = new Error(message)
  error.code = 'INVALID_IMAGE'
  return error
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M7 5h8v8M15 5 9 11M12 15H5V8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

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
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [activePreviewIndex, setActivePreviewIndex] = useState(0)

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

  useEffect(() => {
    if (!previewUrls.length) {
      setActivePreviewIndex(0)
      setGalleryOpen(false)
      return
    }

    if (activePreviewIndex >= previewUrls.length) {
      setActivePreviewIndex(0)
    }
  }, [previewUrls, activePreviewIndex])

  const imageCount = images?.length || 0
  const isAtLimit = imageCount >= MAX_UPLOADS
  const isEmpty = imageCount === 0

  const showNotice = (message, type = 'info') => {
    setNotice({ message, type, id: Date.now() })
  }

  const compressImage = async (file, maxSize = 1920, quality = 0.82) => {
    if (file.size > MAX_FILE_SIZE) {
      throw createValidationError(`${file.name} 超过 10MB`)
    }

    const shouldCompress = file.size > 2 * 1024 * 1024

    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (e) => {
        const img = new Image()

        img.onload = () => {
          const aspectRatio = Math.max(img.width / img.height, img.height / img.width)
          if (img.width < MIN_IMAGE_SIDE || img.height < MIN_IMAGE_SIDE) {
            reject(createValidationError(`${file.name} 的宽和高都不能小于 384px`))
            return
          }
          if (img.width > MAX_IMAGE_SIDE || img.height > MAX_IMAGE_SIDE) {
            reject(createValidationError(`${file.name} 的宽和高都不能超过 4096px`))
            return
          }
          if (aspectRatio > MAX_ASPECT_RATIO) {
            reject(createValidationError(`${file.name} 的最大宽高比不能超过 5`))
            return
          }

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
      const processingResults = await Promise.allSettled(imageFiles.map((file) => compressImage(file)))
      const rejectedMessages = []
      const compressedFiles = processingResults.flatMap((result, index) => {
        if (result.status === 'fulfilled') return [result.value]

        if (result.reason?.code === 'INVALID_IMAGE') {
          rejectedMessages.push(result.reason.message)
          return []
        }

        console.error('图片压缩失败，保留原图:', result.reason)
        return [imageFiles[index]]
      })

      if (rejectedMessages.length > 0) {
        showNotice(rejectedMessages[0], 'warning')
      }
      if (compressedFiles.length === 0) return

      const mergedImages = [...(images || []), ...compressedFiles]
      const trimmedImages = mergedImages.slice(0, MAX_UPLOADS)

      if (mergedImages.length > MAX_UPLOADS) {
        showNotice(`最多上传 ${MAX_UPLOADS} 张参考图，已自动保留前 ${MAX_UPLOADS} 张。`, 'warning')
      }

      onChange(trimmedImages)
      onPrimaryChange?.(normalizePrimaryIndex(trimmedImages, primaryIndex))
    } catch (error) {
      console.error('图片处理失败:', error)
      showNotice(error.message || '图片处理失败，请重新选择。', 'warning')
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
    setActivePreviewIndex((prev) => {
      if (!nextImages.length) return 0
      if (index === prev) return Math.max(0, prev - 1)
      if (index < prev) return prev - 1
      return Math.min(prev, nextImages.length - 1)
    })

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
    setGalleryOpen(false)
    setActivePreviewIndex(0)
  }

  const handleSetPrimary = (index) => {
    onPrimaryChange?.(index)
    setActivePreviewIndex(index)
  }

  const activePreviewUrl = previewUrls[activePreviewIndex] || previewUrls[primaryIndex] || ''
  const primaryPreviewUrl = previewUrls[primaryIndex] || previewUrls[0] || ''
  const secondaryPreviewItems = previewUrls
    .map((url, index) => ({ url, index }))
    .filter((item) => item.index !== primaryIndex)

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
              <div className="preview-showcase">
                <div className="preview-showcase-main">
                  <div className="preview-media preview-media--main">
                    <img src={primaryPreviewUrl} alt="主图预览" />
                    <button
                      type="button"
                      className="preview-zoom-btn"
                      onClick={() => {
                        setActivePreviewIndex(primaryIndex)
                        setGalleryOpen(true)
                      }}
                      title="放大查看"
                    >
                      <ExpandIcon />
                    </button>
                    <button
                      type="button"
                      className="remove-btn"
                      onClick={() => handleRemoveImage(primaryIndex)}
                      title="删除"
                    >
                      ×
                    </button>
                  </div>
                  <div className="preview-meta preview-meta--main">
                    <span className="primary-label">主图</span>
                  </div>
                </div>

                <div className="preview-showcase-side">
                  {secondaryPreviewItems.map(({ url, index }) => (
                    <div key={url} className="preview-card preview-card--mini">
                      <div className="preview-media preview-media--mini">
                        <img src={url} alt={`产品图 ${index + 1}`} />
                        <button
                          type="button"
                          className="preview-zoom-btn"
                          onClick={() => {
                            setActivePreviewIndex(index)
                            setGalleryOpen(true)
                          }}
                          title="放大查看"
                        >
                          <ExpandIcon />
                        </button>
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
                        <button
                          type="button"
                          className="set-primary-btn"
                          onClick={() => handleSetPrimary(index)}
                        >
                          设为主图
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="uploader-actions">
                <label
                  htmlFor="product-image-input"
                  className={`upload-primary-btn ${compressing || isAtLimit ? 'disabled' : ''}`}
                  aria-disabled={compressing || isAtLimit}
                >
                  {compressing ? '正在压缩图片...' : '继续上传'}
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

        {galleryOpen && (
          <div className="uploader-gallery-modal" onClick={() => setGalleryOpen(false)}>
            <div className="uploader-gallery-dialog" onClick={(event) => event.stopPropagation()}>
              <div className="uploader-gallery-header">
                <div>
                  <h4>图片预览</h4>
                  <p>点击下方缩略图切换查看。</p>
                </div>
                <button type="button" className="uploader-gallery-close" onClick={() => setGalleryOpen(false)}>
                  ×
                </button>
              </div>

              <div className="uploader-gallery-layout">
                <div className="uploader-gallery-preview">
                  <div className="uploader-gallery-preview-frame">
                    {activePreviewUrl ? <img src={activePreviewUrl} alt="当前预览" /> : null}
                  </div>

                  <div className="uploader-gallery-preview-meta">
                    <strong>{activePreviewIndex === primaryIndex ? '当前主图' : `图片 ${activePreviewIndex + 1}`}</strong>
                    <span>共 {imageCount} 张</span>
                  </div>
                </div>

                <div className="uploader-gallery-grid">
                  {previewUrls.map((url, index) => {
                    const isPrimary = index === primaryIndex
                    const isActive = index === activePreviewIndex

                    return (
                      <div
                        key={url}
                        className={`gallery-thumb-card ${isPrimary ? 'is-primary' : ''} ${isActive ? 'is-active' : ''}`}
                      >
                        <button
                          type="button"
                          className="gallery-thumb-media"
                          onClick={() => setActivePreviewIndex(index)}
                        >
                          <img src={url} alt={`产品图 ${index + 1}`} />
                        </button>

                        <div className="gallery-thumb-actions">
                          {isPrimary ? (
                            <span className="primary-label">主图</span>
                          ) : (
                            <button
                              type="button"
                              className="set-primary-btn"
                              onClick={() => handleSetPrimary(index)}
                            >
                              设为主图
                            </button>
                          )}

                          <button
                            type="button"
                            className="remove-btn remove-btn--inline"
                            onClick={() => handleRemoveImage(index)}
                            title="删除"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="uploader-gallery-footer">
                <button type="button" className="secondary-action-btn" onClick={() => setGalleryOpen(false)}>
                  完成
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
