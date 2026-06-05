import './ProductForm.css'

export default function ProductForm({ product, onChange }) {
  return (
    <div className="product-form">
      <div className="form-group">
        <label>产品名称</label>
        <input
          type="text"
          value={product.name}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="例如：智能保温杯"
        />
      </div>

      <div className="form-group">
        <label>核心卖点</label>
        <textarea
          value={product.sellingPoints}
          onChange={(e) => onChange('sellingPoints', e.target.value)}
          placeholder="用逗号分隔多个卖点，例如：24 小时保温，智能测温，轻便携带"
          rows={3}
        />
      </div>

      <div className="form-group">
        <label>目标人群</label>
        <input
          type="text"
          value={product.targetAudience}
          onChange={(e) => onChange('targetAudience', e.target.value)}
          placeholder="例如：25-35 岁上班族，注重健康生活的年轻人"
        />
      </div>
    </div>
  )
}
