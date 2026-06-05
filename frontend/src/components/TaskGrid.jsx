import './TaskGrid.css'

export default function TaskGrid({ tasks, onRegenerate }) {
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
        <div key={task.id} className="task-card">
          <div className="task-header">
            <h3>{task.listing || '未命名产品'}</h3>
            <span className="task-time">
              {new Date(task.createdAt).toLocaleString('zh-CN')}
            </span>
          </div>
          
          <div className="task-resolution">
            分辨率：<strong>{task.resolution === '4k' ? '4K (4096x4096)' : '2K (2048x2048)'}</strong>
          </div>
          
          <div className="task-images">
            {task.images && task.images.length > 0 ? (
              task.images.map((img, idx) => (
                <div key={idx} className="task-image-item">
                  <div className="image-header">
                    <div className="image-number">图 {img.imageId}</div>
                    {onRegenerate && (
                      <button
                        className="regenerate-btn"
                        onClick={() => onRegenerate(img.imageId)}
                        title="重新生成这张"
                      >
                        🔄 重新生成
                      </button>
                    )}
                  </div>
                  
                  {img.imageUrl ? (
                    <img src={img.imageUrl} alt={`生成的图片 ${img.imageId}`} />
                  ) : (
                    <div className="task-placeholder">生成中...</div>
                  )}
                  
                  {img.prompt && (
                    <div className="image-prompt">
                      <strong>Prompt:</strong>
                      <p>{img.prompt}</p>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="task-placeholder">暂无图片</div>
            )}
          </div>
          
          <div className="task-footer">
            <div className="task-status">
              <span className={`status-badge status-${task.status}`}>
                {task.status === 'completed' ? '✅ 完成' : '⏳ 生成中'}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
