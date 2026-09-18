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
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const loadTemplates = async (nextScope = scope) => {
    setLoading(true)
    setError('')
    try {
      const data = await parseApiJson(
        await fetch(`/api/templates?scope=${nextScope.toLowerCase()}`),
        nextScope === 'PUBLIC' ? '公用模板接口' : '我的模板接口'
      )
      setTemplates(data.templates || [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) loadTemplates(scope)
  }, [open, scope])

  const openPicker = () => {
    setDraft(selected)
    setError('')
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
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('image', file)
      formData.append('name', file.name.replace(/\.[^.]+$/, ''))
      formData.append('scope', scope)
      await parseApiJson(await fetch('/api/templates', { method: 'POST', body: formData }), '模板上传接口')
      await loadTemplates(scope)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUploading(false)
    }
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
                  <button type="button" className={scope === 'PUBLIC' ? 'is-active' : ''} onClick={() => setScope('PUBLIC')}>公用模板</button>
                  <button type="button" className={scope === 'PERSONAL' ? 'is-active' : ''} onClick={() => setScope('PERSONAL')}>我的模板</button>
                </nav>

                <p className="layout-template-tip">最多选择 {maxSelection} 张。只迁移构图、信息层级和卖点证明方法，不复制竞品品牌、文案或产品。</p>
                {error && <p className="layout-template-modal__error">{error}</p>}

                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadTemplate} hidden />
                <div className="layout-template-grid">
                  {canUpload && (
                    <button type="button" className="layout-template-upload" onClick={() => fileRef.current?.click()} disabled={uploading}>
                      <b aria-hidden="true">+</b>
                      <strong>{uploading ? '上传中...' : scope === 'PUBLIC' ? '上传公用模板' : '上传我的模板'}</strong>
                      <small>JPG、PNG、WebP，最大 10MB</small>
                    </button>
                  )}
                  {loading ? <p className="layout-template-modal__empty">正在读取模板...</p> : templates.map((template) => {
                    const selectedIndex = draft.findIndex((item) => item.id === template.id)
                    return (
                      <article key={template.id} className={selectedIndex >= 0 ? 'is-selected' : ''}>
                        <button type="button" className="layout-template-grid__card" onClick={() => toggleTemplate(template)}>
                          <img src={template.imageUrl} alt={template.name} />
                          <span>{template.name}</span>
                          {selectedIndex >= 0 && <b>{selectedIndex + 1}</b>}
                        </button>
                        {template.canManage && <div className="layout-template-grid__actions"><button type="button" onClick={() => renameTemplate(template)}>改名</button><button type="button" onClick={() => archiveTemplate(template)}>删除</button></div>}
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
                      <img src={template.imageUrl} alt="" />
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
    </div>
  )
}
