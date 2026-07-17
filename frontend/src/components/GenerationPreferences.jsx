import { useEffect, useMemo, useRef, useState } from 'react'
import './GenerationPreferences.css'

const DEFAULT_MANUAL_COLOR = '#FF4D4F'

const MARKETPLACE_OPTIONS = [
  { value: 'UK', label: '英国 Amazon.co.uk', language: 'English' },
  { value: 'US', label: '美国 Amazon.com', language: 'English' },
  { value: 'CA', label: '加拿大 Amazon.ca', language: 'English' },
  { value: 'DE', label: '德国 Amazon.de', language: 'German' },
  { value: 'FR', label: '法国 Amazon.fr', language: 'French' },
  { value: 'IT', label: '意大利 Amazon.it', language: 'Italian' },
  { value: 'ES', label: '西班牙 Amazon.es', language: 'Spanish' },
  { value: 'JP', label: '日本 Amazon.co.jp', language: 'Japanese' },
  { value: 'AU', label: '澳大利亚 Amazon.com.au', language: 'English' },
  { value: 'NL', label: '荷兰 Amazon.nl', language: 'Dutch' },
  { value: 'SE', label: '瑞典 Amazon.se', language: 'Swedish' },
  { value: 'PL', label: '波兰 Amazon.pl', language: 'Polish' }
]

const LANGUAGE_OPTIONS = [
  { value: 'English', label: '英语' },
  { value: 'Chinese', label: '中文' },
  { value: 'Japanese', label: '日语' },
  { value: 'German', label: '德语' },
  { value: 'French', label: '法语' },
  { value: 'Italian', label: '意大利语' },
  { value: 'Spanish', label: '西班牙语' },
  { value: 'Dutch', label: '荷兰语' },
  { value: 'Swedish', label: '瑞典语' },
  { value: 'Polish', label: '波兰语' },
  { value: 'Portuguese', label: '葡萄牙语' },
  { value: 'Korean', label: '韩语' },
  { value: 'Russian', label: '俄语' }
]

const FONT_OPTIONS = [
  { value: 'auto', label: '智能字体风格', description: '根据商品智能设定' },
  { value: 'geometric-sans', label: '几何无衬线体', description: '科技产品、现代家具等' },
  { value: 'bold-sans', label: '硬朗无衬线体', description: '五金工具、户外用品等' },
  { value: 'elegant-serif', label: '优雅衬线体', description: '化妆品、复古、高奢等' },
  { value: 'rounded-playful', label: '圆润童趣字体', description: '母婴玩具、休闲零食等' },
  { value: 'handwritten-playful', label: '俏皮手写风格', description: '文创手作、节日礼品等' }
]

const BRAND_COLORS = [
  '#111827',
  '#2563EB',
  '#7C3AED',
  '#EC4899',
  '#EF4444',
  '#F97316',
  '#FACC15',
  '#22C55E',
  '#14B8A6',
  '#0EA5E9',
  '#E5E7EB',
  '#FFFFFF'
]

export function getMarketplaceDefaultLanguage(marketplace = 'UK') {
  return MARKETPLACE_OPTIONS.find((option) => option.value === marketplace)?.language || 'English'
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizeHex(value = '') {
  const cleaned = String(value).trim().replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
  return cleaned ? `#${cleaned.toUpperCase()}` : ''
}

function hexToRgb(hex = '') {
  const normalized = normalizeHex(hex).replace('#', '')
  if (normalized.length !== 6) return null
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  }
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}

function rgbToHsv({ r, g, b }) {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  let hue = 0

  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6
    else if (max === green) hue = (blue - red) / delta + 2
    else hue = (red - green) / delta + 4
  }

  hue = Math.round(hue * 60)
  if (hue < 0) hue += 360

  return {
    h: hue,
    s: max === 0 ? 0 : delta / max,
    v: max
  }
}

function hsvToRgb({ h, s, v }) {
  const hue = ((h % 360) + 360) % 360
  const chroma = v * s
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const match = v - chroma

  let red = 0
  let green = 0
  let blue = 0

  if (hue < 60) {
    red = chroma
    green = x
  } else if (hue < 120) {
    red = x
    green = chroma
  } else if (hue < 180) {
    green = chroma
    blue = x
  } else if (hue < 240) {
    green = x
    blue = chroma
  } else if (hue < 300) {
    red = x
    blue = chroma
  } else {
    red = chroma
    blue = x
  }

  return {
    r: (red + match) * 255,
    g: (green + match) * 255,
    b: (blue + match) * 255
  }
}

function getAutoGradientStyle() {
  return {
    background:
      'conic-gradient(from 225deg, #7c3aed, #3b82f6, #22c55e, #fde047, #fb7185, #7c3aed)'
  }
}

function FontPreviewIcon({ variant }) {
  if (variant === 'auto') {
    return (
      <svg viewBox="0 0 44 44" className="font-preview-svg" aria-hidden="true">
        <rect x="0" y="0" width="44" height="44" rx="12" fill="#050505" />
        <path d="M11 30V14h4.2l3.8 8.2L22.9 14H27v16h-3v-10l-3.5 7.5h-2.8L14.2 20v10H11Z" fill="#FFFFFF" />
        <rect x="29.5" y="13.5" width="7.5" height="2.3" rx="1.15" fill="#FFFFFF" opacity="0.95" />
        <rect x="29.5" y="18.3" width="7.5" height="2.3" rx="1.15" fill="#FFFFFF" opacity="0.82" />
        <rect x="29.5" y="23.1" width="7.5" height="2.3" rx="1.15" fill="#FFFFFF" opacity="0.68" />
        <rect x="29.5" y="27.9" width="5.2" height="2.3" rx="1.15" fill="#FFFFFF" opacity="0.54" />
      </svg>
    )
  }

  if (variant === 'geometric-sans') {
    return (
      <svg viewBox="0 0 44 44" className="font-preview-svg" aria-hidden="true">
        <rect width="44" height="44" rx="12" fill="#050505" />
        <text x="10.5" y="29" fill="#FFFFFF" fontSize="21" fontWeight="700" fontFamily="Arial, Helvetica, sans-serif">Aa</text>
        <rect x="10" y="32.5" width="23" height="2" rx="1" fill="#FFFFFF" opacity="0.78" />
      </svg>
    )
  }

  if (variant === 'bold-sans') {
    return (
      <svg viewBox="0 0 44 44" className="font-preview-svg" aria-hidden="true">
        <rect width="44" height="44" rx="12" fill="#050505" />
        <text x="7.8" y="30.5" fill="#FFFFFF" fontSize="24" fontWeight="900" fontFamily="Arial Black, Arial, Helvetica, sans-serif">Aa</text>
      </svg>
    )
  }

  if (variant === 'elegant-serif') {
    return (
      <svg viewBox="0 0 44 44" className="font-preview-svg" aria-hidden="true">
        <rect width="44" height="44" rx="12" fill="#050505" />
        <text x="10" y="28.8" fill="#FFFFFF" fontSize="22" fontWeight="700" fontFamily="Georgia, 'Times New Roman', serif">Aa</text>
        <path d="M10 32.2H31.5" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      </svg>
    )
  }

  if (variant === 'rounded-playful') {
    return (
      <svg viewBox="0 0 44 44" className="font-preview-svg" aria-hidden="true">
        <rect width="44" height="44" rx="12" fill="#050505" />
        <text x="9" y="30" fill="#FFFFFF" fontSize="22" fontWeight="800" fontFamily="'Trebuchet MS', 'Arial Rounded MT Bold', Arial, sans-serif">Aa</text>
        <circle cx="33.5" cy="13.5" r="2.5" fill="#FFFFFF" opacity="0.9" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 44 44" className="font-preview-svg" aria-hidden="true">
      <rect width="44" height="44" rx="12" fill="#050505" />
      <text
        x="8.5"
        y="30"
        fill="#FFFFFF"
        fontSize="22"
        fontWeight="700"
        fontFamily="'Segoe Script', 'Comic Sans MS', cursive"
        transform="rotate(-7 22 22)"
      >
        Aa
      </text>
      <path d="M10 31.5C15 33.2 22.5 33.4 31.2 30.5" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}

export default function GenerationPreferences({ listing, onChange }) {
  const selectedLanguage = listing.imageLanguage || getMarketplaceDefaultLanguage(listing.marketplace)
  const manualColor = normalizeHex(listing.brandColor || '') || DEFAULT_MANUAL_COLOR
  const squareRef = useRef(null)
  const colorPopoverRef = useRef(null)
  const colorTriggerRef = useRef(null)
  const fontMenuRef = useRef(null)
  const [pickerHue, setPickerHue] = useState(0)
  const [fontMenuOpen, setFontMenuOpen] = useState(false)
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false)
  const [eyedropperPicking, setEyedropperPicking] = useState(false)

  const selectedFont =
    FONT_OPTIONS.find((option) => option.value === (listing.fontPreference || 'auto')) || FONT_OPTIONS[0]

  const manualHsv = useMemo(() => {
    const rgb = hexToRgb(manualColor)
    return rgb ? rgbToHsv(rgb) : { h: 0, s: 0, v: 1 }
  }, [manualColor])

  useEffect(() => {
    if (manualHsv.s > 0.01) {
      setPickerHue(manualHsv.h)
    }
  }, [manualHsv.h, manualHsv.s])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (fontMenuRef.current && !fontMenuRef.current.contains(event.target)) {
        setFontMenuOpen(false)
      }

      const clickedColorTrigger = colorTriggerRef.current?.contains(event.target)
      const clickedColorPopover = colorPopoverRef.current?.contains(event.target)
      if (!clickedColorTrigger && !clickedColorPopover) {
        setColorPopoverOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const hueColor = rgbToHex(hsvToRgb({ h: pickerHue, s: 1, v: 1 }))

  const updateManualColor = (nextHex) => {
    onChange('brandColorMode', 'manual')
    onChange('brandColor', nextHex)
  }

  const handleOpenColorPopover = () => {
    setColorPopoverOpen((prev) => !prev)
  }

  const handleClearManualColor = (event) => {
    event.stopPropagation()
    onChange('brandColorMode', 'auto')
    onChange('brandColor', '')
    setColorPopoverOpen(false)
  }

  const handleSquareSelection = (clientX, clientY) => {
    const rect = squareRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = clamp((clientX - rect.left) / rect.width, 0, 1)
    const y = clamp((clientY - rect.top) / rect.height, 0, 1)
    const saturation = x
    const value = 1 - y
    updateManualColor(rgbToHex(hsvToRgb({ h: pickerHue, s: saturation, v: value })))
  }

  const startSquareDrag = (event) => {
    event.preventDefault()
    handleSquareSelection(event.clientX, event.clientY)

    const handleMove = (moveEvent) => {
      handleSquareSelection(moveEvent.clientX, moveEvent.clientY)
    }

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  const handleHueChange = (event) => {
    const nextHue = Number(event.target.value)
    setPickerHue(nextHue)
    updateManualColor(
      rgbToHex(
        hsvToRgb({
          h: nextHue,
          s: manualHsv.s,
          v: manualHsv.v
        })
      )
    )
  }

  const triggerSwatchStyle =
    listing.brandColorMode === 'manual' ? { backgroundColor: manualColor } : getAutoGradientStyle()
  const eyeDropperSupported = typeof window !== 'undefined' && 'EyeDropper' in window

  const handleEyeDropperPick = async () => {
    if (!eyeDropperSupported || eyedropperPicking) return

    try {
      setEyedropperPicking(true)
      setColorPopoverOpen(false)
      await new Promise((resolve) => window.setTimeout(resolve, 40))
      const eyeDropper = new window.EyeDropper()
      const result = await eyeDropper.open()

      if (result?.sRGBHex) {
        updateManualColor(normalizeHex(result.sRGBHex))
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('取色笔取色失败:', error)
      }
    } finally {
      setEyedropperPicking(false)
    }
  }

  return (
    <div className="form-section">
      <div className="section-header">
        <h3>生成偏好设置</h3>
        <span className="section-number">智能可调</span>
      </div>

      <div className="preferences-block">
        <div className="form-group brand-color-popover-wrap">
          <label>品牌主色</label>

          <div className="brand-color-shell">
            <button
              ref={colorTriggerRef}
              type="button"
              className={`brand-color-card brand-color-card--trigger ${colorPopoverOpen ? 'active' : ''}`}
              onClick={handleOpenColorPopover}
            >
              <span className="brand-color-card-icon" style={triggerSwatchStyle} />
              <span className="brand-color-card-copy">
                <strong>{listing.brandColorMode === 'manual' ? manualColor : '智能主色'}</strong>
                <small>
                  {listing.brandColorMode === 'manual' ? '已手动指定主色' : '根据商品智能设定'}
                </small>
              </span>
              {listing.brandColorMode === 'manual' ? (
                <span
                  className="brand-color-card-action"
                  onClick={handleClearManualColor}
                  role="button"
                  tabIndex={0}
                >
                  ×
                </span>
              ) : (
                <span className="brand-color-card-arrow">›</span>
              )}
            </button>

            {colorPopoverOpen && (
              <div ref={colorPopoverRef} className="brand-color-popover">
                <div
                  ref={squareRef}
                  className="brand-color-square"
                  style={{
                    background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${hueColor}`
                  }}
                  onMouseDown={startSquareDrag}
                >
                  <span
                    className="brand-color-square-thumb"
                    style={{
                      left: `${manualHsv.s * 100}%`,
                      top: `${(1 - manualHsv.v) * 100}%`
                    }}
                  />
                </div>

                <div className="brand-color-slider-row">
                  <button
                    type="button"
                    className={`brand-color-slider-icon brand-color-eyedropper-btn ${eyedropperPicking ? 'picking' : ''}`}
                    onClick={handleEyeDropperPick}
                    disabled={!eyeDropperSupported || eyedropperPicking}
                    title={
                      eyeDropperSupported
                        ? '使用取色笔从屏幕取色'
                        : '当前浏览器不支持取色笔'
                    }
                  >
                    {eyedropperPicking ? '…' : '🖊'}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={pickerHue}
                    className="brand-color-hue-slider"
                    onChange={handleHueChange}
                    style={{
                      background:
                        'linear-gradient(90deg, #ff4d4f 0%, #f59e0b 16%, #84cc16 33%, #14b8a6 50%, #3b82f6 66%, #8b5cf6 83%, #ff4d4f 100%)'
                    }}
                  />
                  <span className="brand-color-slider-preview" style={{ backgroundColor: manualColor }} />
                </div>

                <div className="brand-color-swatches">
                  {BRAND_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`brand-color-swatch ${manualColor === color ? 'active' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => updateManualColor(color)}
                      title={color}
                    />
                  ))}
                </div>

                <div className="brand-color-hex-row">
                  <span className="brand-color-hex-label">HEX</span>
                  <input
                    type="text"
                    value={listing.brandColor || manualColor}
                    onChange={(event) => updateManualColor(normalizeHex(event.target.value))}
                    placeholder="#FF4D4F"
                  />
                </div>
              </div>
            )}
          </div>

        </div>

        <div className="form-group" ref={fontMenuRef}>
          <label>字体风格</label>
          <button
            type="button"
            className={`font-select-card ${fontMenuOpen ? 'open' : ''}`}
            onClick={() => setFontMenuOpen((prev) => !prev)}
          >
            <span className="font-select-icon">
              <FontPreviewIcon variant={selectedFont.value} />
            </span>
            <span className="font-select-copy">
              <strong>{selectedFont.label}</strong>
              <small>{selectedFont.description}</small>
            </span>
            <span className={`font-select-arrow ${fontMenuOpen ? 'open' : ''}`}>⌄</span>
          </button>

          {fontMenuOpen && (
            <div className="font-select-menu">
              {FONT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`font-option ${selectedFont.value === option.value ? 'active' : ''}`}
                  onClick={() => {
                    onChange('fontPreference', option.value)
                    setFontMenuOpen(false)
                  }}
                >
                  <span className="font-option-icon">
                    <FontPreviewIcon variant={option.value} />
                  </span>
                  <span className="font-option-copy">
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </button>
              ))}
            </div>
          )}

        </div>

        <div className="preferences-grid">
          <div className="form-group marketplace-select-group">
            <label>
              销售国家/地区 <span className="required">*</span>
            </label>
            <select
              value={listing.marketplace || 'UK'}
              onChange={(event) => onChange('marketplace', event.target.value)}
            >
              {MARKETPLACE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>
              生成图片语言 <span className="required">*</span>
            </label>
            <select
              value={selectedLanguage}
              onChange={(event) => onChange('imageLanguage', event.target.value)}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>自定义设置</label>
          <textarea
            value={listing.designNotes || ''}
            onChange={(event) => onChange('designNotes', event.target.value)}
            placeholder="可输入想要的视觉氛围、设计风格、排版偏好、禁用元素等自定义内容"
            rows={4}
            maxLength={500}
          />
          <div className="preferences-footer">
            <span className="char-count">{(listing.designNotes || '').length}/500</span>
          </div>
        </div>
      </div>
    </div>
  )
}
