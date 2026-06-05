import { useState } from 'react'
import './StyleSelector.css'

const styleTemplates = {
  'minimalist': {
    name: '极简风格',
    description: '简洁、干净、现代感',
    keywords: 'minimalist, clean, modern, simple, white background, professional lighting'
  },
  'lifestyle': {
    name: '生活场景',
    description: '真实使用场景，自然光',
    keywords: 'lifestyle, natural lighting, home environment, realistic, warm tone'
  },
  'premium': {
    name: '高端奢华',
    description: '高级感、精致、奢华',
    keywords: 'premium, luxury, elegant, sophisticated, dark background, dramatic lighting'
  },
  'vibrant': {
    name: '活力色彩',
    description: '鲜艳、活泼、吸引力',
    keywords: 'vibrant, colorful, energetic, eye-catching, bright, bold'
  },
  'natural': {
    name: '自然环保',
    description: '天然、环保、有机',
    keywords: 'natural, eco-friendly, organic, earth tone, green, sustainable'
  },
  'tech': {
    name: '科技感',
    description: '未来感、数码、创新',
    keywords: 'futuristic, tech, digital, innovation, blue tone, neon, cyber'
  },
  'cozy': {
    name: '温馨舒适',
    description: '温暖、舒适、居家',
    keywords: 'cozy, warm, comfortable, homey, soft lighting, inviting'
  },
  'professional': {
    name: '商务专业',
    description: '正式、专业、可信',
    keywords: 'professional, business, corporate, formal, clean, trustworthy'
  }
}

export default function StyleSelector({ selectedStyle, onSelectStyle }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="style-selector">
      <div className="style-header">
        <h3>🎨 生图风格</h3>
        <button 
          className="toggle-btn"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '收起 ▲' : '选择风格 ▼'}
        </button>
      </div>

      {expanded && (
        <div className="style-grid">
          {Object.entries(styleTemplates).map(([key, style]) => (
            <div
              key={key}
              className={`style-card ${selectedStyle === key ? 'selected' : ''}`}
              onClick={() => onSelectStyle(key)}
            >
              <div className="style-name">{style.name}</div>
              <div className="style-desc">{style.description}</div>
              {selectedStyle === key && (
                <div className="style-check">✅ 已选</div>
              )}
            </div>
          ))}
        </div>
      )}

      {!expanded && selectedStyle && (
        <div className="selected-style-preview">
          当前风格：<strong>{styleTemplates[selectedStyle].name}</strong> - {styleTemplates[selectedStyle].description}
        </div>
      )}
    </div>
  )
}
