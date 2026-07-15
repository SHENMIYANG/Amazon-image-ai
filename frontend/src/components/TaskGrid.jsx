import { useState } from 'react'
import './TaskGrid.css'

export default function TaskGrid({ tasks, onRegenerate, onDownload, onDownloadAll, onContinue }) {
  if (tasks.length === 0) {
    return (
      <div className="task-grid-empty">
        <p>暂无生成任务</p>
      </div>
    )
  }

  return (
    <div className="task-grid">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onRegenerate={onRegenerate}
          onDownload={onDownload}
          onDownloadAll={onDownloadAll}
          onContinue={onContinue}
        />
      ))}
    </div>
  )
}

function TaskCard({ task, onRegenerate, onDownload, onDownloadAll, onContinue }) {
  const [editingImageId, setEditingImageId] = useState(null)
  const [editedPrompt, setEditedPrompt] = useState('')
  const [previewImage, setPreviewImage] = useState(null)
  const [previewZoom, setPreviewZoom] = useState(1)

  const completedImages = task.images?.filter((img) => img.status === 'completed' && img.imageUrl) || []
  const statusClassName =
    task.status === 'completed'
      ? 'status-done'
      : task.status === 'stopped'
        ? 'status-stopped'
        : 'status-progress'

  const handleEditPrompt = (img) => {
    setEditingImageId(img.imageId)
    setEditedPrompt(img.prompt || '')
  }

  const handleOpenPreview = (img) => {
    setPreviewImage(img)
    setPreviewZoom(1)
  }

  const handleClosePreview = () => {
    setPreviewImage(null)
    setPreviewZoom(1)
  }

  const handleSavePrompt = () => {
    const imageIndex = task.images.findIndex((img) => img.imageId === editingImageId)
    if (imageIndex >= 0 && onRegenerate) {
      onRegenerate(task, imageIndex, editedPrompt)
    }
    setEditingImageId(null)
    setEditedPrompt('')
  }

  return (
    <div className="task-card">
      <div className="task-card-header">
        <div className="task-info">
          <h3 className="task-title">{task.listing?.productName || '未命名产品'}</h3>
          <span className="task-time">{new Date(task.createdAt).toLocaleString('zh-CN')}</span>
        </div>
        <div className="task-actions">
          {task.status === 'stopped' && (
            <button className="continue-btn" onClick={() => onContinue?.(task)} title="从停止位置继续生成">
              {'\u25B6\uFE0F'} 继续生成
            </button>
          )}
          {completedImages.length > 0 && (
            <button className="download-all-btn" onClick={() => onDownloadAll?.(completedImages)} title="一键下载全部图片">
              {'\u{1F4E5}'} 批量下载
            </button>
          )}
        </div>
      </div>

      <div className="task-meta">
        <span className="meta-item">
          分辨率 <strong>{task.resolution === '4k' ? '4K' : '2K'}</strong>
        </span>
        <span className="meta-item">
          图片张数 <strong>{task.images?.length || 0}</strong>
        </span>
        <span className="meta-item">
          进度 <strong className={statusClassName}>{completedImages.length}/{task.images?.length || 0}</strong>
        </span>
        {task.status === 'stopping' && <span className="meta-item status-stopping">正在停止...</span>}
        {task.status === 'stopped' && <span className="meta-item status-stopped">已停止</span>}
      </div>

      <div className="task-images-grid">
        {task.images && task.images.length > 0 ? (
          task.images.map((img, idx) => (
            <div key={idx} className="task-image-card">
              <div className="image-card-header">
                <div className="image-card-heading">
                  <span className="image-badge">图 {img.imageId}</span>
                  {img.name && <span className="image-name">{img.name}</span>}
                </div>
                <span className={`image-status status-${img.status || 'pending'}`}>
                  {img.status === 'completed'
                    ? '\u2705'
                    : img.status === 'failed'
                      ? '\u274C'
                      : '\u23F3'}
                </span>
              </div>

              {img.actualResolution && (
                <div className={`image-resolution ${img.sizeMatchesRequest === false ? 'mismatch' : ''}`}>
                  实际: {img.actualResolution}
                  {img.requestedResolution && <span> / 请求: {img.requestedResolution}</span>}
                  {img.sizeMatchesRequest === false && <span> / 下载保持原始输出，不会强行放大</span>}
                </div>
              )}

              {img.prompt && (
                <div className="image-prompt-display">
                  <small>
                    <strong>当前策略:</strong> {img.prompt}
                  </small>
                </div>
              )}

              {img.promptEn && (
                <details className="english-prompt-details">
                  <summary>查看英文 Prompt</summary>
                  <small>{img.promptEn}</small>
                </details>
              )}

              <div className="image-content">
                {img.imageUrl ? (
                  <button className="image-preview-button" onClick={() => handleOpenPreview(img)} title="点击查看大图">
                    <img src={img.imageUrl} alt={`生成图片 ${img.imageId}`} />
                  </button>
                ) : img.status === 'failed' ? (
                  <div className="image-error">
                    <span>生成失败</span>
                    <small>{img.error || '未知错误'}</small>
                  </div>
                ) : (
                  <div className="image-pending">正在生成...</div>
                )}
              </div>

              <div className="image-card-actions">
                {img.imageUrl && (
                  <>
                    <button className="action-btn preview" onClick={() => handleOpenPreview(img)} title="查看大图">
                      {'\u{1F50D}'}
                    </button>
                    <button
                      className="action-btn download"
                      onClick={() => onDownload?.(img.imageUrl, `image-${img.imageId}.png`, img.requestedResolution)}
                      title="下载图片"
                    >
                      {'\u2B07\uFE0F'}
                    </button>
                  </>
                )}

                {img.status === 'failed' && (
                  <button className="action-btn regenerate" onClick={() => onRegenerate?.(task, idx)} title="重新生成这张图">
                    {'\u{1F504}'}
                  </button>
                )}

                {img.status !== 'pending' && img.status !== 'failed' && (
                  <button className="action-btn edit" onClick={() => handleEditPrompt(img)} title="修改 Prompt 并重新生成">
                    {'\u270F\uFE0F'}
                  </button>
                )}
              </div>

              {editingImageId === img.imageId ? (
                <div className="prompt-editor">
                  <textarea
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    rows={3}
                    placeholder="输入新的 Prompt 或中文策略说明"
                  />
                  <div className="editor-actions">
                    <button className="btn-save" onClick={handleSavePrompt}>
                      重新生成
                    </button>
                    <button className="btn-cancel" onClick={() => setEditingImageId(null)}>
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                img.prompt && (
                  <div className="image-prompt">
                    <small>
                      {img.prompt.substring(0, 100)}
                      {img.prompt.length > 100 ? '...' : ''}
                    </small>
                  </div>
                )
              )}
            </div>
          ))
        ) : (
          <div className="task-placeholder">暂无图片</div>
        )}
      </div>

      {previewImage && (
        <div className="image-preview-modal" onClick={handleClosePreview}>
          <div className="image-preview-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="image-preview-toolbar">
              <div className="image-preview-title">
                图 {previewImage.imageId} 预览{previewImage.name ? ` · ${previewImage.name}` : ''}
              </div>
              <div className="image-preview-controls">
                <button onClick={() => setPreviewZoom((prev) => Math.max(0.5, prev - 0.25))} title="缩小">
                  -
                </button>
                <span>{Math.round(previewZoom * 100)}%</span>
                <button onClick={() => setPreviewZoom((prev) => Math.min(3, prev + 0.25))} title="放大">
                  +
                </button>
                <button onClick={() => setPreviewZoom(1)} title="恢复原始比例">
                  100%
                </button>
                <button onClick={handleClosePreview} title="关闭">
                  ×
                </button>
              </div>
            </div>
            <div className="image-preview-stage">
              <img
                src={previewImage.imageUrl}
                alt={`生成图片 ${previewImage.imageId} 大图预览`}
                style={{ transform: `scale(${previewZoom})` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
