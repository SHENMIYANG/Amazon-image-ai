import { useMemo, useState } from 'react'
import ImageFeedbackChat from './ImageFeedbackChat'
import './TaskGrid.css'

const MAX_REFERENCE_SIZE = 10 * 1024 * 1024
const REGENERATE_COMPLEXITY_OPTIONS = [
  { value: 'L1', label: 'L1 极速版' },
  { value: 'L2', label: 'L2 标准版' },
  { value: 'L3', label: 'L3 精品版' }
]

function Icon({ name }) {
  const commonProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true'
  }

  if (name === 'eye') {
    return (
      <svg {...commonProps}>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    )
  }

  if (name === 'download') {
    return (
      <svg {...commonProps}>
        <path d="M12 3v11" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
    )
  }

  if (name === 'refresh') {
    return (
      <svg {...commonProps}>
        <path d="M21 12a9 9 0 0 1-15 6.7" />
        <path d="M3 12a9 9 0 0 1 15-6.7" />
        <path d="M18 3v5h-5" />
        <path d="M6 21v-5h5" />
      </svg>
    )
  }

  if (name === 'history') {
    return (
      <svg {...commonProps}>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
        <path d="M12 7v5l3 2" />
      </svg>
    )
  }

  if (name === 'chat') {
    return (
      <svg {...commonProps}>
        <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-6.5A8 8 0 1 1 21 12Z" />
        <path d="M8 12h.01" />
        <path d="M12 12h.01" />
        <path d="M16 12h.01" />
      </svg>
    )
  }

  if (name === 'play') {
    return (
      <svg {...commonProps}>
        <path d="M8 5v14l11-7Z" />
      </svg>
    )
  }

  return null
}

function ActionIconButton({ icon, label, className = '', children, ...props }) {
  return (
    <button
      type="button"
      className={`action-icon-btn ${className}`.trim()}
      title={label}
      aria-label={label}
      {...props}
    >
      <Icon name={icon} />
      {children ? <span className="action-icon-badge">{children}</span> : null}
    </button>
  )
}

function getImageVariants(image) {
  const variants = []

  if (image?.imageUrl) {
    variants.push({
      key: 'current',
      label: '当前图',
      imageUrl: image.imageUrl,
      requestedResolution: image.requestedResolution || null
    })
  }

  const history = Array.isArray(image?.versions) ? image.versions : []
  history.forEach((version, index) => {
    if (!version?.imageUrl) return
    variants.push({
      key: `history-${index}`,
      label: `历史 ${index + 1}`,
      imageUrl: version.imageUrl,
      requestedResolution: version.requestedResolution || null
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
  const [previewState, setPreviewState] = useState(null)
  const [previewZoom, setPreviewZoom] = useState(1)
  const [regenerateDialog, setRegenerateDialog] = useState(null)
  const [feedbackDialog, setFeedbackDialog] = useState(null)
  const [feedbackChats, setFeedbackChats] = useState({})
  const [dialogError, setDialogError] = useState('')

  const completedImages = task.images?.filter((image) => image.status === 'completed' && image.imageUrl) || []
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

  const handleOpenPreview = (image, variantIndex = 0) => {
    setPreviewState({ image, variantIndex })
    setPreviewZoom(1)
  }

  const handleClosePreview = () => {
    setPreviewState(null)
    setPreviewZoom(1)
  }

  const openFeedbackDialog = (imageIndex) => {
    const image = task.images?.[imageIndex]
    if (!image) return
    setFeedbackDialog({ imageIndex, imageId: image.imageId })
  }

  const closeFeedbackDialog = () => {
    setFeedbackDialog(null)
  }

  const updateFeedbackChat = (imageId, nextState) => {
    setFeedbackChats((previous) => ({
      ...previous,
      [imageId]: nextState
    }))
  }

  const closeRegenerateDialog = () => {
    if (regenerateDialog?.referencePreviewUrl) {
      URL.revokeObjectURL(regenerateDialog.referencePreviewUrl)
    }
    setRegenerateDialog(null)
    setDialogError('')
  }

  const openRegenerateDialog = (imageIndex) => {
    const image = task.images?.[imageIndex]
    if (!image) return

    setDialogError('')
    setRegenerateDialog({
      imageIndex,
      imageId: image.imageId,
      imageName: image.name || '',
      prompt: image.strategyContent || '',
      complexity: task?.listing?.complexity || 'L2',
      referenceFile: null,
      referencePreviewUrl: ''
    })
  }

  const handleReferenceFileChange = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setDialogError('只能追加 JPG、PNG 或 WebP 图片。')
      return
    }
    if (file.size > MAX_REFERENCE_SIZE) {
      setDialogError('追加参考图不能超过 10MB。')
      return
    }

    setDialogError('')
    setRegenerateDialog((previous) => {
      if (!previous) return previous
      if (previous.referencePreviewUrl) URL.revokeObjectURL(previous.referencePreviewUrl)
      return {
        ...previous,
        referenceFile: file,
        referencePreviewUrl: URL.createObjectURL(file)
      }
    })
  }

  const removeAdditionalReference = () => {
    setRegenerateDialog((previous) => {
      if (!previous) return previous
      if (previous.referencePreviewUrl) URL.revokeObjectURL(previous.referencePreviewUrl)
      return { ...previous, referenceFile: null, referencePreviewUrl: '' }
    })
  }

  const handleConfirmRegenerate = () => {
    if (!regenerateDialog || !onRegenerate) return
    const prompt = regenerateDialog.prompt.trim()
    if (!prompt) {
      setDialogError('请保留或填写这张图的中文策略。')
      return
    }

    onRegenerate(task, regenerateDialog.imageIndex, {
      prompt,
      complexity: regenerateDialog.complexity || 'L2',
      referenceFiles: regenerateDialog.referenceFile ? [regenerateDialog.referenceFile] : []
    })
    closeRegenerateDialog()
  }

  return (
    <div className="task-card">
      <div className="task-card-header">
        <div className="task-info">
          <h3 className="task-title">{task.listing?.productName || '未命名产品'}</h3>
          <span className="task-time">{new Date(task.createdAt).toLocaleString('zh-CN')}</span>
        </div>
        <div className="task-actions">
          {task.status === 'stopped' ? (
            <button type="button" className="task-toolbar-btn" onClick={() => onContinue?.(task)} title="从停止位置继续生成">
              <Icon name="play" />
              <span>继续</span>
            </button>
          ) : null}
          {completedImages.length > 0 ? (
            <button type="button" className="task-toolbar-btn" onClick={() => onDownloadAll?.(completedImages)} title="下载全部图片">
              <Icon name="download" />
              <span>全部</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="task-meta">
        <span className="meta-item">分辨率 <strong>{task.resolution === '4k' ? '4K' : '2K'}</strong></span>
        <span className="meta-item">图片张数 <strong>{task.images?.length || 0}</strong></span>
        <span className="meta-item">进度 <strong className={statusClassName}>{completedImages.length}/{task.images?.length || 0}</strong></span>
        {task.status === 'stopping' ? <span className="meta-item status-stopping">正在停止...</span> : null}
        {task.status === 'stopped' ? <span className="meta-item status-stopped">已停止</span> : null}
        {task.status === 'failed' ? <span className="meta-item status-failed">任务失败</span> : null}
      </div>

      <div className="task-images-grid">
        {task.images?.length ? task.images.map((image, index) => {
          const variantCount = Array.isArray(image.versions) ? image.versions.length : 0
          const isRegenerating = image.status === 'regenerating'

          return (
            <div key={image.imageId ?? index} className="task-image-card">
              <div className="image-card-header">
                <div className="image-card-heading">
                  <span className="image-badge">图 {image.imageId}</span>
                  {image.name ? <span className="image-name">{image.name}</span> : null}
                </div>
                <span className={`image-status status-${image.status || 'pending'}`}>
                  {image.status === 'completed' ? '完成' : image.status === 'failed' ? '失败' : image.status === 'regenerating' ? '重新生成中' : '等待'}
                </span>
              </div>

              {image.actualResolution ? (
                <div className={`image-resolution ${image.sizeMatchesRequest === false ? 'mismatch' : ''}`}>
                  实际 {image.actualResolution}{image.requestedResolution ? <span> / 请求 {image.requestedResolution}</span> : null}
                </div>
              ) : null}

              {image.strategyContent ? (
                <div className="image-prompt-display">
                  <strong>当前中文策略</strong>
                  <p>{image.strategyContent}</p>
                </div>
              ) : null}

              {image.lastRegeneration ? (
                <div className="regeneration-summary">
                  上次重新生成使用 {image.lastRegeneration.usedReferenceCount} 张参考图
                  {image.lastRegeneration.addedReferenceCount ? `，其中新增 ${image.lastRegeneration.addedReferenceCount} 张` : ''}
                </div>
              ) : null}

              {image.regenerationError ? (
                <div className="regeneration-warning">重新生成失败，已保留上一张图片：{image.regenerationError}</div>
              ) : null}

              <div className="image-content">
                {image.imageUrl ? (
                  <button className="image-preview-button" onClick={() => handleOpenPreview(image)} title="查看大图">
                    <img src={image.imageUrl} alt={`生成图片 ${image.imageId}`} />
                    {isRegenerating ? <span className="image-regenerating-overlay">重新生成中，旧图已保留</span> : null}
                  </button>
                ) : image.status === 'failed' ? (
                  <div className="image-error"><span>生成失败</span><small>{image.error || '未知错误'}</small></div>
                ) : (
                  <div className="image-pending">正在生成...</div>
                )}
              </div>

              <div className="image-card-actions">
                {image.imageUrl ? (
                  <>
                    <ActionIconButton icon="eye" label="查看大图" onClick={() => handleOpenPreview(image)} />
                    <ActionIconButton icon="download" label="下载图片" onClick={() => onDownload?.(image.imageUrl, `image-${image.imageId}.png`, image.requestedResolution)} />
                    {variantCount > 0 ? (
                      <ActionIconButton icon="history" label={`查看历史版本（${variantCount} 张）`} onClick={() => handleOpenPreview(image, 1)}>
                        {variantCount}
                      </ActionIconButton>
                    ) : null}
                    <ActionIconButton icon="chat" label="图片反馈对话" onClick={() => openFeedbackDialog(index)} />
                  </>
                ) : null}
                {image.status !== 'pending' && image.status !== 'regenerating' ? (
                  <ActionIconButton icon="refresh" label="重新生成" className="regenerate" onClick={() => openRegenerateDialog(index)} />
                ) : null}
              </div>
            </div>
          )
        }) : <div className="task-placeholder">暂无图片</div>}
      </div>

      {previewState && activePreviewVariant ? (
        <div className="image-preview-modal" onClick={handleClosePreview}>
          <div className="image-preview-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="image-preview-toolbar">
              <div className="image-preview-title">图 {previewState.image.imageId} 预览{previewState.image.name ? ` · ${previewState.image.name}` : ''}</div>
              <div className="image-preview-controls">
                <button onClick={() => setPreviewZoom((value) => Math.max(0.5, value - 0.25))}>-</button>
                <span>{Math.round(previewZoom * 100)}%</span>
                <button onClick={() => setPreviewZoom((value) => Math.min(3, value + 0.25))}>+</button>
                <button onClick={() => setPreviewZoom(1)}>100%</button>
                <button onClick={() => onDownload?.(activePreviewVariant.imageUrl, `image-${previewState.image.imageId}.png`, activePreviewVariant.requestedResolution)}>下载</button>
                <button onClick={handleClosePreview}>×</button>
              </div>
            </div>
            {previewVariants.length > 1 ? (
              <div className="image-preview-variants">
                {previewVariants.map((variant, index) => (
                  <button
                    key={variant.key}
                    type="button"
                    className={`preview-variant-btn ${index === previewState.variantIndex ? 'active' : ''}`}
                    onClick={() => { setPreviewState((value) => ({ ...value, variantIndex: index })); setPreviewZoom(1) }}
                  >
                    {variant.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="image-preview-stage">
              <img src={activePreviewVariant.imageUrl} alt={`生成图片 ${previewState.image.imageId} 大图预览`} style={{ transform: `scale(${previewZoom})` }} />
            </div>
          </div>
        </div>
      ) : null}

      {feedbackDialog ? (
        <ImageFeedbackChat
          task={task}
          image={task.images?.[feedbackDialog.imageIndex]}
          chatState={feedbackChats[feedbackDialog.imageId]}
          onChange={(nextState) => updateFeedbackChat(feedbackDialog.imageId, nextState)}
          onRegenerate={(revision, feedbackReferenceImages = []) => onRegenerate?.(task, feedbackDialog.imageIndex, {
            prompt: revision.strategyContent,
            promptEn: revision.promptEn,
            executionRules: revision.executionRules,
            referenceImageUrls: feedbackReferenceImages,
            complexity: task?.listing?.complexity || 'L2',
            suppressAlert: true,
            source: 'feedback-chat'
          })}
          onDownload={onDownload}
          onClose={closeFeedbackDialog}
        />
      ) : null}

      {regenerateDialog ? (
        <div className="image-preview-modal regenerate-modal" onClick={closeRegenerateDialog}>
          <div className="regenerate-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="regenerate-dialog__header">
              <div>
                <h4>重新生成图 {regenerateDialog.imageId}</h4>
                <p>{regenerateDialog.imageName || '单张图片'}</p>
              </div>
              <button type="button" className="regenerate-dialog__close" onClick={closeRegenerateDialog}>×</button>
            </div>

            <div className="regenerate-dialog__body">
              <label className="regenerate-field">
                <span>本次中文策略</span>
                <textarea
                  rows={9}
                  value={regenerateDialog.prompt}
                  onChange={(event) => setRegenerateDialog((value) => ({ ...value, prompt: event.target.value }))}
                />
              </label>

              <label className="regenerate-field">
                <span>本次出图复杂度</span>
                <select
                  className="regenerate-select"
                  value={regenerateDialog.complexity}
                  onChange={(event) =>
                    setRegenerateDialog((value) =>
                      value
                        ? {
                            ...value,
                            complexity: event.target.value
                          }
                        : value
                    )
                  }
                >
                  {REGENERATE_COMPLEXITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="regenerate-reference">
                <div className="regenerate-reference__heading">
                  <div>
                    <strong>追加参考图（可选）</strong>
                    <span>用于补充这一次的角度、安装关系或场景理解</span>
                  </div>
                  {!regenerateDialog.referenceFile ? (
                    <label className="regenerate-upload-btn">
                      选择图片
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleReferenceFileChange} />
                    </label>
                  ) : null}
                </div>

                {regenerateDialog.referenceFile ? (
                  <div className="regenerate-reference__preview">
                    <img src={regenerateDialog.referencePreviewUrl} alt="本次追加参考图" />
                    <div><strong>{regenerateDialog.referenceFile.name}</strong><span>仅用于本次重新生成</span></div>
                    <button type="button" onClick={removeAdditionalReference}>移除</button>
                  </div>
                ) : (
                  <div className="regenerate-reference__empty">未追加图片，将继续使用原任务的 {task.referenceImages?.length || 0} 张参考图。</div>
                )}
              </div>

              <div className="regenerate-usage-summary">
                本次将使用：原参考图 {task.referenceImages?.length || 0} 张
                {regenerateDialog.referenceFile ? ' + 新增参考图 1 张' : ''}，以及上方当前中文策略。原图片会保留到历史版本。
              </div>
              {dialogError ? <div className="regenerate-dialog__error">{dialogError}</div> : null}
            </div>

            <div className="regenerate-dialog__footer">
              <button type="button" className="btn-cancel" onClick={closeRegenerateDialog}>取消</button>
              <button type="button" className="btn-save" onClick={handleConfirmRegenerate}>开始重新生成</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
