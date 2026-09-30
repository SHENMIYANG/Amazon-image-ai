import { useEffect, useRef, useState } from 'react'
import { parseApiJson } from '../utils/apiResponse'
import './LayoutTemplatePicker.css'

export default function LayoutTemplatePicker({ selected = [], onChange, isAdmin = false, maxSelection = 8 }) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState('PUBLIC')
  const [templates, setTemplates] = useState([])
  const [draft, setDraft] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState('')
  const [uploadNotice, setUploadNotice] = useState('')
  const [preview, setPreview] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [previewError, setPreviewError] = useState('')
  const previewRef = useRef(null)
  const fileRef = useRef(null)
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const loadRequestRef = useRef(0)

  const loadTemplates = async (nextScope = scope) => {
    const requestNumber = ++loadRequestRef.current
    setLoading(true)
    setError('')
    setUploadNotice('')
    try {
      const data = await parseApiJson(
        await fetch(`/api/templates?scope=${nextScope.toLowerCase()}`),
        nextScope === 'PUBLIC' ? '公用模板接口' : '我的模板接口'
      )
      if (requestNumber !== loadRequestRef.current || nextScope !== scopeRef.current) return false
      setTemplates(data.templates || [])
      return true
    } catch (requestError) {
      if (requestNumber === loadRequestRef.current && nextScope === scopeRef.current) setError(requestError.message)
      return false
    } finally {
      if (requestNumber === loadRequestRef.current && nextScope === scopeRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (open) loadTemplates(scope)
  }, [open, scope])

  useEffect(() => {
    if (!preview) return
    const dialog = previewRef.current
    const previousFocus = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      previousFocus?.focus()
    }
  }, [preview])

  const openPreview = (template) => {
    setZoom(1)
    setPreviewError('')
    setPreview(template)
  }

  const openPicker = () => {
    setDraft(selected)
    setError('')
    setUploadNotice('')
    setOpen(true)
  }

  const toggleTemplate = (template) => {
    const exists = draft.some((item) => item.id === template.id)
    if (!exists && draft.length >= maxSelection) {
      setError(`本次最多可选 ${maxSelection} 个卖点模板。`)
      return
    }
    setError('')
    setDraft(exists ? draft.filter((item) => item.id !== template.id) : [...draft, template])
  }

  const uploadTemplate = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    setUploading(true)
    setUploadProgress({ current: 0, total: files.length })
    setError('')
    setUploadNotice('')
    const failures = []
    let succeeded = 0

    for (const [index, file] of files.entries()) {
      setUploadProgress({ current: index + 1, total: files.length })
      const formData = new FormData()
      formData.append('image', file)
      formData.append('name', file.name.replace(/\.[^.]+$/, ''))
      formData.append('scope', scope)
      try {
        await parseApiJson(await fetch('/api/templates', { method: 'POST', body: formData }), '模板上传接口')
        succeeded += 1
      } catch (requestError) {
        failures.push(`${file.name}: ${requestError.message}`)
      }
    }

    const loaded = await loadTemplates(scope)
    if (failures.length) {
      setError(`已上传 ${succeeded}/${files.length} 张。失败：${failures.join('；')}`)
    } else if (loaded) {
      setUploadNotice(`已上传 ${succeeded} 张模板。`)
    }
    setUploading(false)
    setUploadProgress({ current: 0, total: 0 })
  }

  const renameTemplate = async (template) => {
    const name = window.prompt('模板名称', template.name)
    if (!name || name.trim() === template.name) return
    try {
      await parseApiJson(await fetch(`/api/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
      }), '模板改名接口')
      setDraft((items) => items.map((item) => item.id === template.id ? { ...item, name: name.trim() } : item))
      await loadTemplates(scope)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const archiveTemplate = async (template) => {
    if (!window.confirm(`删除“${template.name}”后，历史记录不受影响。`)) return
    try {
      await parseApiJson(await fetch(`/api/templates/${template.id}`, { method: 'DELETE' }), '模板删除接口')
      setDraft((items) => items.filter((item) => item.id !== template.id))
      await loadTemplates(scope)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const confirmSelection = () => {
    onChange(draft)
    setOpen(false)
  }

  const canUpload = scope === 'PERSONAL' || isAdmin

  return (
    <div className="layout-template-field">
      <button type="button" className="layout-template-field__open" onClick={openPicker}>
        <span className="layout-template-field__icon" aria-hidden="true">▦</span>
        <span><strong>选择卖点排版</strong><small>{selected.length ? `已选 ${selected.length} 张，卖点图数量已锁定` : '可选模板，也可让 AI 自行设计'}</small></span>
        <b aria-hidden="true">›</b>
      </button>

      {open && (
        <div className="layout-template-modal" role="dialog" aria-modal="true" aria-label="设置卖点图排版参考">
          <div className="layout-template-modal__dialog">
            <header className="layout-template-modal__header">
              <div><h3>设置卖点图排版参考</h3><p>一张模板对应一张卖点图，并参与卖点策略分析。</p></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="关闭">×</button>
            </header>

            <div className="layout-template-modal__body">
              <main className="layout-template-library">
                <nav className="layout-template-tabs" aria-label="模板范围">
                  <button type="button" className={scope === 'PUBLIC' ? 'is-active' : ''} onClick={() => { if (scope !== 'PUBLIC') { setLoading(true); setScope('PUBLIC') } }} disabled={uploading}>公用模板</button>
                  <button type="button" className={scope === 'PERSONAL' ? 'is-active' : ''} onClick={() => { if (scope !== 'PERSONAL') { setLoading(true); setScope('PERSONAL') } }} disabled={uploading}>我的模板</button>
                </nav>

                <p className="layout-template-tip">最多选择 {maxSelection} 张。只迁移构图、信息层级和卖点证明方法，不复制竞品品牌、文案或产品。</p>
                {error && <p className="layout-template-modal__error" aria-live="polite">{error}</p>}
                {uploadNotice && <p className="layout-template-modal__notice" aria-live="polite">{uploadNotice}</p>}

                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={uploadTemplate} hidden />
                <div className="layout-template-grid">
                  {canUpload && (
                    <button type="button" className="layout-template-upload" onClick={() => fileRef.current?.click()} disabled={uploading}>
                      <b aria-hidden="true">+</b>
                      <strong>{uploading ? `上传中 ${uploadProgress.current}/${uploadProgress.total}...` : scope === 'PUBLIC' ? '上传公用模板' : '上传我的模板'}</strong>
                      <small>可多选，JPG、PNG、WebP，每张最大 10MB</small>
                    </button>
                  )}
                  {loading ? <p className="layout-template-modal__empty">正在读取模板...</p> : templates.map((template) => {
                    const selectedIndex = draft.findIndex((item) => item.id === template.id)
                    return (
                      <article key={template.id} className={selectedIndex >= 0 ? 'is-selected' : ''}>
                        <button type="button" className="layout-template-grid__preview" onClick={() => openPreview(template)} aria-label={`预览 ${template.name}`} title="查看原图">
                          <img src={template.imageUrl} alt={template.name} />
                        </button>
                        <button type="button" className="layout-template-grid__card" aria-label={template.name} aria-pressed={selectedIndex >= 0} onClick={() => toggleTemplate(template)}>
                          <span>{template.name}</span>
                          {selectedIndex >= 0 && <b>{selectedIndex + 1}</b>}
                        </button>
                        <div className="layout-template-grid__actions">
                          {template.canManage && <><button type="button" onClick={() => renameTemplate(template)}>改名</button><button type="button" onClick={() => archiveTemplate(template)}>删除</button></>}
                        </div>
                      </article>
                    )
                  })}
                </div>
                {!loading && templates.length === 0 && !canUpload && <p className="layout-template-modal__empty">还没有公用模板，请联系管理员上传。</p>}
              </main>

              <aside className="layout-template-selection">
                <h4>已选模板 <span>{draft.length}/{maxSelection}</span></h4>
                <div className="layout-template-selection__list">
                  {draft.length === 0 ? <p>未选择模板，AI 将根据产品自行设计卖点图。</p> : draft.map((template, index) => (
                    <div key={template.id}>
                      <b>{index + 1}</b>
                      <button type="button" onClick={() => openPreview(template)} aria-label={`预览已选 ${template.name}`}><img src={template.imageUrl} alt="" /></button>
                      <span>{template.name}</span>
                      <button type="button" onClick={() => toggleTemplate(template)} aria-label={`移除 ${template.name}`}>×</button>
                    </div>
                  ))}
                </div>
              </aside>
            </div>

            <footer className="layout-template-modal__footer">
              <span>{draft.length ? `确认后生成 ${draft.length} 张卖点图` : '不选模板时，卖点图数量可手动调整'}</span>
              <div><button type="button" className="is-secondary" onClick={() => setOpen(false)}>取消</button><button type="button" onClick={confirmSelection}>确认</button></div>
            </footer>
          </div>
        </div>
      )}
      {preview && (
        <dialog ref={previewRef} className="layout-template-preview" aria-label="模板大图预览" onCancel={() => setPreview(null)}>
          <header>
            <strong>{preview.name}</strong>
            <div>
              <button type="button" onClick={() => setZoom((value) => Math.max(.5, value - .25))} disabled={zoom <= .5} aria-label="缩小" title="缩小">−</button>
              <output aria-label="缩放比例">{Math.round(zoom * 100)}%</output>
              <button type="button" onClick={() => setZoom((value) => Math.min(4, value + .25))} disabled={zoom >= 4} aria-label="放大" title="放大">+</button>
              <button type="button" onClick={() => setZoom(1)} aria-label="适应窗口" title="适应窗口">↺</button>
              <button type="button" onClick={() => setPreview(null)} aria-label="关闭预览" title="关闭预览">×</button>
            </div>
          </header>
          {previewError && <p role="alert">{previewError}</p>}
          <div className="layout-template-preview__stage" onWheel={(event) => {
            setZoom((value) => Math.max(.5, Math.min(4, value + (event.deltaY < 0 ? .25 : -.25))))
          }}>
            <img src={preview.imageUrl} alt={`${preview.name} 原图`} onError={() => setPreviewError('模板原图读取失败，请检查图片存储服务。')} style={{ width: `${zoom * 100}%`, maxHeight: zoom <= 1 ? '100%' : 'none' }} />
          </div>
        </dialog>
      )}
    </div>
  )
}
