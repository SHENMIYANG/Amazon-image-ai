import './ImagePlanCard.css'

export default function ImagePlanCard({ plan, onChange, imageType = 'main' }) {
  const isMainImage = plan.id === 1 && (imageType === 'main' || imageType === 'both')
  
  return (
    <div className={`image-plan-card ${isMainImage ? 'main-image' : ''}`}>
      <div className="card-header">
        <span className={`card-number ${isMainImage ? 'main' : ''}`}>
          {isMainImage ? '🎯 主图 (图 1)' : `图 ${plan.id}`}
        </span>
        {isMainImage && (
          <span className="main-image-badge">纯白背景</span>
        )}
      </div>

      <div className="card-body">
        <div className="form-group">
          <label>使用场景</label>
          <input
            type="text"
            value={plan.scene}
            onChange={(e) => onChange(plan.id, 'scene', e.target.value)}
            placeholder={isMainImage ? '主图：纯白背景，不需要场景' : '例如：办公室桌面，户外露营，健身房'}
            disabled={isMainImage}
          />
          {isMainImage && (
            <span className="help-text">⚠️ 亚马逊主图必须是纯白背景</span>
          )}
        </div>

        <div className="form-group">
          <label>构图方式</label>
          <input
            type="text"
            value={plan.composition}
            onChange={(e) => onChange(plan.id, 'composition', e.target.value)}
            placeholder={isMainImage ? '产品占据 85% 以上画布' : '例如：中心构图，三分法，俯拍视角'}
          />
        </div>

        <div className="form-group">
          <label>色调风格</label>
          <input
            type="text"
            value={plan.colorTone}
            onChange={(e) => onChange(plan.id, 'colorTone', e.target.value)}
            placeholder={isMainImage ? 'Pure white (RGB 255,255,255)' : '例如：暖色调，冷色系，莫兰迪色'}
            disabled={isMainImage}
          />
          {isMainImage && (
            <span className="help-text">✅ 已自动设置为纯白背景</span>
          )}
        </div>

        <div className="form-group">
          <label>关键元素</label>
          <textarea
            value={plan.elements}
            onChange={(e) => onChange(plan.id, 'elements', e.target.value)}
            placeholder={isMainImage ? '仅产品本身，无文字、水印、边框' : '用逗号分隔，例如：产品主体，绿植，笔记本电脑'}
            rows={2}
          />
          {isMainImage && (
            <span className="help-text">⚠️ 主图不能包含文字、logo、水印</span>
          )}
        </div>
      </div>
    </div>
  )
}
