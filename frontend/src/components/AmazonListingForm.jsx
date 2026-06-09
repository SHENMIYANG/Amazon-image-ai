import { useState } from 'react'
import './AmazonListingForm.css'

export default function AmazonListingForm({ listing, onChange }) {
  return (
    <div className="amazon-listing-form">
      {/* 基础信息 */}
      <div className="form-section">
        <h3>📦 基础信息</h3>
        
        <div className="form-row">
          <div className="form-group full-width">
            <label>产品名称 *</label>
            <input
              type="text"
              value={listing.productName}
              onChange={(e) => onChange('productName', e.target.value)}
              placeholder="例如：Wireless Bluetooth Headphones with Noise Cancelling"
              maxLength={200}
            />
            <span className="char-count">{(listing.productName || '').length}/200</span>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>所属类目 *</label>
            <input
              type="text"
              value={listing.category}
              onChange={(e) => onChange('category', e.target.value)}
              placeholder="例如：Electronics > Headphones"
            />
            <span className="help-text">自由填写，英文</span>
          </div>

          <div className="form-group">
            <label>售卖国家 *</label>
            <select
              value={listing.marketplace}
              onChange={(e) => onChange('marketplace', e.target.value)}
            >
              <option value="">请选择</option>
              <option value="US">美国 (Amazon.com)</option>
              <option value="UK">英国 (Amazon.co.uk)</option>
              <option value="DE">德国 (Amazon.de)</option>
              <option value="FR">法国 (Amazon.fr)</option>
              <option value="IT">意大利 (Amazon.it)</option>
              <option value="ES">西班牙 (Amazon.es)</option>
            </select>
          </div>

          <div className="form-group">
            <label>尺寸规格 *</label>
            <input
              type="text"
              value={listing.dimensions}
              onChange={(e) => onChange('dimensions', e.target.value)}
              placeholder="例如：10 x 5 x 3 inches, 1.5 lbs"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>材质/表面工艺 *</label>
            <input
              type="text"
              value={listing.material}
              onChange={(e) => onChange('material', e.target.value)}
              placeholder="例如：ABS Plastic, Matte Finish"
            />
          </div>

          <div className="form-group">
            <label>图片类型 *</label>
            <select
              value={listing.imageType}
              onChange={(e) => onChange('imageType', e.target.value)}
            >
              <option value="">请选择</option>
              <option value="main">7 张主图</option>
              <option value="aplus">A+ 页面图</option>
              <option value="both">主图+A+ 图</option>
            </select>
          </div>
        </div>

      </div>

      {/* 营销信息 */}
      <div className="form-section">
        <h3>🎯 营销信息</h3>
        
        <div className="form-group">
          <label>目标受众 *</label>
          <input
            type="text"
            value={listing.targetAudience}
            onChange={(e) => onChange('targetAudience', e.target.value)}
            placeholder="例如：Busy professionals, Fitness enthusiasts, Parents with young children"
          />
        </div>

        <div className="form-group">
          <label>核心卖点（5 点描述）*</label>
          <textarea
            value={listing.sellingPoints}
            onChange={(e) => onChange('sellingPoints', e.target.value)}
            placeholder="每行一个卖点，最多 5 个&#10;例如：&#10;Advanced Noise Cancelling Technology&#10;40-Hour Battery Life&#10;Comfortable Over-Ear Design&#10;Built-in Microphone for Calls&#10;Foldable and Portable"
            rows={5}
          />
          <span className="char-count">
            {(listing.sellingPoints || '').split('\n').filter(s => s.trim()).length}/5 个卖点
          </span>
        </div>
      </div>

      {/* 图片要求 */}
      <div className="form-section">
        <h3>🖼️ 图片要求</h3>
        
        <div className="form-group">
          <label>场景图要求 *</label>
          <textarea
            value={listing.sceneRequirements}
            onChange={(e) => onChange('sceneRequirements', e.target.value)}
            placeholder="描述期望的场景效果&#10;例如：Product on modern desk with laptop and coffee cup, natural lighting, minimalist style"
            rows={3}
          />
        </div>
      </div>

      {/* 参考信息（可选） */}
      <div className="form-section optional">
        <h3>🔗 参考信息（可选）</h3>
        
        <div className="form-group">
          <label>竞品链接</label>
          <input
            type="url"
            value={listing.competitorAsin}
            onChange={(e) => onChange('competitorAsin', e.target.value)}
            placeholder="https://www.amazon.com/dp/BXXXXXXXXX"
          />
          <span className="help-text">用于参考风格和构图</span>
        </div>

        <div className="form-group">
          <label>上传产品图</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onChange('productImage', e.target.files[0])}
          />
          <span className="help-text">支持 JPG/PNG，用于 AI 参考</span>
        </div>
      </div>
    </div>
  )
}
