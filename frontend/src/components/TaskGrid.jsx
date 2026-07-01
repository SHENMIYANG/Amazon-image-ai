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
      {tasks.map(task => (
        <TaskCard 
          key={task.id} 
          task={task} 
          onRegenerate={onRegenerate}
          onDownload={onDownload}
          onDownloadAll={onDownloadAll}
        />
      ))}
    </div>
  )
}

function TaskCard({ task, onRegenerate, onDownload, onDownloadAll }) {
  const [editingImageId, setEditingImageId] = useState(null)
  const [editedPrompt, setEditedPrompt] = useState('')

  const handleEditPrompt = (img) => {
    setEditingImageId(img.imageId)
    setEditedPrompt(img.prompt || '')
  }

  const handleSavePrompt = () => {
    // 找到对应的 task 和 image index
    const imageIndex = task.images.findIndex(img => img.imageId === editingImageId)
    if (imageIndex >= 0 && onRegenerate) {
      onRegenerate(task, imageIndex, editedPrompt)
    }
    setEditingImageId(null)
    setEditedPrompt('')
  }

  const completedImages = task.images?.filter(img => img.status === 'completed' && img.imageUrl) || []

  return (
    <div className="task-card">
      <div className="task-card-header">
        <div className="task-info">
          <h3 className="task-title">{task.listing?.productName || '未命名产品'}</h3>
          <span className="task-time">
            {new Date(task.createdAt).toLocaleString('zh-CN')}
          </span>
        </div>
        <div className="task-actions">
          {task.status === 'stopped' && (
            <button 
              className="continue-btn"
              onClick={() => onContinue?.(task)}
              title="从停止位置继续生成"
            >
              ▶️ 继续生成
            </button>
          )}
          {completedImages.length > 0 && (
            <button 
              className="download-all-btn"
              onClick={() => onDownloadAll?.(completedImages)}
              title="一键下载全部"
            >
              📥 批量下载
            </button>
          )}
        </div>
      </div>

      <div className="task-meta">
        <span className="meta-item">分辨率：<strong>{task.resolution === '4k' ? '4K' : '2K'}</strong></span>
        <span className="meta-item">风格：<strong>{task.style || '默认'}</strong></span>
        <span className="meta-item">
          进度：<strong className={task.status === 'completed' ? 'status-done' : task.status === 'stopped' ? 'status-stopped' : 'status-progress'}>
            {completedImages.length}/{task.images?.length || 7}
          </strong>
        </span>
        {task.status === 'stopping' && (
          <span className="meta-item status-stopping">⏹️ 停止中...</span>
        )}
        {task.status === 'stopped' && (
          <span className="meta-item status-stopped">⏹️ 已停止</span>
        )}
      </div>
      
      <div className="task-images-grid">
        {task.images && task.images.length > 0 ? (
          task.images.map((img, idx) => (
            <div key={idx} className="task-image-card">
              <div className="image-card-header">
                <span className="image-badge">图 {img.imageId}</span>
                <span className={`image-status status-${img.status || 'pending'}`}>
                  {img.status === 'completed' ? '✅' : img.status === 'failed' ? '❌' : '⏳'}
                </span>
              </div>
              
              {img.prompt && (
                <div className="image-prompt-display">
                  <small><strong>策略：</strong>{img.prompt}</small>
                </div>
              )}
              
              <div className="image-content">
                {img.imageUrl ? (
                  <img src={img.imageUrl} alt={`生成的图片 ${img.imageId}`} />
                ) : img.status === 'failed' ? (
                  <div className="image-error">
                    <span>❌ 生成失败</span>
                    <small>{img.error || '未知错误'}</small>
                  </div>
                ) : (
                  <div className="image-pending">⏳ 生成中...</div>
                )}
              </div>
              
              <div className="image-card-actions">
                {img.imageUrl && (
                  <button
                    className="action-btn download"
                    onClick={() => onDownload?.(img.imageUrl, `image-${img.imageId}.png`)}
                    title="下载这张"
                  >
                    📥
                  </button>
                )}
                {img.status === 'failed' && (
                  <button
                    className="action-btn regenerate"
                    onClick={() => onRegenerate?.(task, idx)}
                    title="重新生成这张"
                  >
                     重试
                  </button>
                )}
                {img.status !== 'pending' && img.status !== 'failed' && (
                  <button
                    className="action-btn edit"
                    onClick={() => handleEditPrompt(img)}
                    title="修改 Prompt 并重新生成"
                  >
                    ✏️
                  </button>
                )}
              </div>
              
              {editingImageId === img.imageId ? (
                <div className="prompt-editor">
                  <textarea
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    rows={3}
                    placeholder="输入新的 Prompt..."
                  />
                  <div className="editor-actions">
                    <button className="btn-save" onClick={handleSavePrompt}>
                      🔄 重新生成
                    </button>
                    <button className="btn-cancel" onClick={() => setEditingImageId(null)}>
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                img.prompt && (
                  <div className="image-prompt">
                    <small>{img.prompt.substring(0, 100)}{img.prompt.length > 100 ? '...' : ''}</small>
                  </div>
                )
              )}
            </div>
          ))
        ) : (
          <div className="task-placeholder">暂无图片</div>
        )}
      </div>
    </div>
  )
}
