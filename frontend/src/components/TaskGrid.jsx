import { useMemo, useState } from 'react'
import './TaskGrid.css'

function getImageVariants(image) {
  const variants = []

  if (image?.imageUrl) {
    variants.push({
      key: 'current',
      label: '当前图',
      imageUrl: image.imageUrl,
      prompt: image.prompt || '',
      promptEn: image.promptEn || '',
      requestedResolution: image.requestedResolution || null,
      actualResolution: image.actualResolution || null,
      sizeMatchesRequest: image.sizeMatchesRequest
    })
  }

  const history = Array.isArray(image?.versions) ? image.versions : []
  history.forEach((version, index) => {
    if (!version?.imageUrl) return
    variants.push({
      key: `history-${index}`,
      label: `历史 ${index + 1}`,
      imageUrl: version.imageUrl,
      prompt: version.prompt || '',
      promptEn: version.promptEn || '',
      requestedResolution: version.requestedResolution || null,
      actualResolution: version.actualResolution || null,
      sizeMatchesRequest: version.sizeMatchesRequest,
      savedAt: version.savedAt || null
    })
  })

  return variants
}

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
  const [previewState, setPreviewState] = useState(null)
  const [previewZoom, setPreviewZoom] = useState(1)
  const [regenerateConfirm, setRegenerateConfirm] = useState(null)

  const completedImages = task.images?.filter((img) => img.status === 'completed' && img.imageUrl) || []
  const statusClassName =
    task.status === 'completed'
      ? 'status-done'
      : task.status === 'failed'
        ? 'status-failed'
        : task.status === 'stopped'
          ? 'status-stopped'
          : 'status-progress'

  const previewVariants = useMemo(() => {
    if (!previewState?.image) return []
    return getImageVariants(previewState.image)
  }, [previewState])

  const activePreviewVariant = previewVariants[previewState?.variantIndex || 0] || null

  const handleEditPrompt = (img) => {
    setEditingImageId(img.imageId)
    setEditedPrompt(img.prompt || '')
  }

  const handleOpenPreview = (img, variantIndex = 0) => {
    setPreviewState({ image: img, variantIndex })
    setPreviewZoom(1)
  }

  const handleClosePreview = () => {
    setPreviewState(null)
    setPreviewZoom(1)
  }

  const handleRequestRegenerate = (imageIndex, prompt = '') => {
    const image = task.images?.[imageIndex]
    if (!image) return

    setRegenerateConfirm({
      imageIndex,
      imageId: image.imageId,
      prompt,
      hasHistory: Boolean(image.imageUrl)
    })
  }

  const handleConfirmRegenerate = () => {
    if (!regenerateConfirm || !onRegenerate) return
    onRegenerate(task, regenerateConfirm.imageIndex, regenerateConfirm.prompt)
    setRegenerateConfirm(null)
  }

  const handleSavePrompt = () => {
    const imageIndex = task.images.findIndex((img) => img.imageId === editingImageId)
    if (imageIndex >= 0) {
      handleRequestRegenerate(imageIndex, editedPrompt)
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
        {task.status === 'failed' && <span className="meta-item status-failed">任务失败</span>}
      </div>

      <div className="task-images-grid">
        {task.images && task.images.length > 0 ? (
          task.images.map((img, idx) => {
            const variantCount = Array.isArray(img.versions) ? img.versions.length : 0
            const isRegenerating = img.status === 'regenerating'

            return (
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
                        : img.status === 'regenerating'
                          ? '\u{1F504}'
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

                {img.regenerationError && (
                  <div className="regeneration-warning">
                    重新生成失败，已保留上一张可用图片：{img.regenerationError}
                  </div>
                )}

                <div className="image-content">
                  {img.imageUrl ? (
                    <button className="image-preview-button" onClick={() => handleOpenPreview(img)} title="点击查看大图">
                      <img src={img.imageUrl} alt={`生成图片 ${img.imageId}`} />
                      {isRegenerating && (
                        <span className="image-regenerating-overlay">重新生成中，旧图已保留</span>
                      )}
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
                      {variantCount > 0 && (
                        <button
                          className="action-btn history"
                          onClick={() => handleOpenPreview(img, 1)}
                          title="查看历史版本"
                        >
                          历史 {variantCount}
                        </button>
                      )}
                    </>
                  )}

                  {img.status !== 'pending' && img.status !== 'regenerating' && (
                    <button
                      className="action-btn regenerate"
                      onClick={() => handleRequestRegenerate(idx)}
                      title="重新生成这张图"
                    >
                      {'\u{1F504}'} 重生成
                    </button>
                  )}

                  {img.status !== 'pending' && img.status !== 'failed' && img.status !== 'regenerating' && (
                    <button className="action-btn edit" onClick={() => handleEditPrompt(img)} title="修改策略后重新生成">
                      {'\u270F\uFE0F'}
                    </button>
                  )}
                </div>

                {editingImageId === img.imageId ? (
                  <div className="prompt-editor">
                    <textarea
                      value={editedPrompt}
                      onChange={(event) => setEditedPrompt(event.target.value)}
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
            )
          })
        ) : (
          <div className="task-placeholder">暂无图片</div>
        )}
      </div>

      {previewState && activePreviewVariant && (
        <div className="image-preview-modal" onClick={handleClosePreview}>
          <div className="image-preview-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="image-preview-toolbar">
              <div className="image-preview-title">
                图 {previewState.image.imageId} 预览{previewState.image.name ? ` · ${previewState.image.name}` : ''}
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
                <button
                  onClick={() => onDownload?.(activePreviewVariant.imageUrl, `image-${previewState.image.imageId}.png`, activePreviewVariant.requestedResolution)}
                  title="下载当前查看版本"
                >
                  下载
                </button>
                <button onClick={handleClosePreview} title="关闭">
                  ×
                </button>
              </div>
            </div>

            {previewVariants.length > 1 && (
              <div className="image-preview-variants">
                {previewVariants.map((variant, index) => (
                  <button
                    key={variant.key}
                    type="button"
                    className={`preview-variant-btn ${index === previewState.variantIndex ? 'active' : ''}`}
                    onClick={() => {
                      setPreviewState((prev) => ({ ...prev, variantIndex: index }))
                      setPreviewZoom(1)
                    }}
                  >
                    {variant.label}
                  </button>
                ))}
              </div>
            )}

            <div className="image-preview-stage">
              <img
                src={activePreviewVariant.imageUrl}
                alt={`生成图片 ${previewState.image.imageId} 大图预览`}
                style={{ transform: `scale(${previewZoom})` }}
              />
            </div>
          </div>
        </div>
      )}

      {regenerateConfirm && (
        <div className="image-preview-modal" onClick={() => setRegenerateConfirm(null)}>
          <div className="regenerate-confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <h4>确认重新生成</h4>
            <p>图 {regenerateConfirm.imageId} 即将重新生成。</p>
            <p>当前图片不会丢失，成功后旧图会自动保留到历史版本里。</p>
            <div className="regenerate-confirm-actions">
              <button type="button" className="btn-cancel" onClick={() => setRegenerateConfirm(null)}>
                取消
              </button>
              <button type="button" className="btn-save" onClick={handleConfirmRegenerate}>
                确认重生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
