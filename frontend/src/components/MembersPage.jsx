import { useEffect, useMemo, useState } from 'react'
import './MembersPage.css'

const ROLE_OPTIONS = [
  ['ADMIN', '管理员'],
  ['OPERATOR', '运营'],
  ['DESIGNER', '美工']
]

const roleLabel = Object.fromEntries(ROLE_OPTIONS)

async function requestMembers(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.success) throw new Error(data.message || `请求失败（HTTP ${response.status}）`)
  return data
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '从未登录'
}

export default function MembersPage({ currentUser, onBack }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [draft, setDraft] = useState({ loginName: '', displayName: '', email: '', password: '', role: 'OPERATOR' })
  const [submitting, setSubmitting] = useState(false)

  const loadMembers = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await requestMembers('/api/members')
      setMembers(data.members || [])
    } catch (loadError) {
      setError(loadError.message || '成员列表读取失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadMembers() }, [])

  const visibleMembers = useMemo(() => members.filter((member) => {
    const keyword = query.trim().toLowerCase()
    const matchesText = !keyword || [member.user.loginName, member.user.displayName, member.user.email]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
    return matchesText && (!role || member.role === role)
  }), [members, query, role])

  const updateMember = async (member, patch) => {
    try {
      const data = await requestMembers(`/api/members/${member.membershipId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch)
      })
      setMembers((current) => current.map((item) => item.membershipId === member.membershipId ? data.member : item))
    } catch (updateError) {
      alert(`成员修改失败：${updateError.message}`)
    }
  }

  const resetPassword = async (member) => {
    const password = window.prompt(`为 ${member.user.displayName || member.user.loginName} 设置新密码`)
    if (!password) return
    try {
      await requestMembers(`/api/members/${member.membershipId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password })
      })
      alert('密码已重置。该成员需要使用新密码重新登录。')
    } catch (resetError) {
      alert(`密码重置失败：${resetError.message}`)
    }
  }

  const createMember = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      const data = await requestMembers('/api/members', { method: 'POST', body: JSON.stringify(draft) })
      setMembers((current) => [...current, data.member])
      setDraft({ loginName: '', displayName: '', email: '', password: '', role: 'OPERATOR' })
      setShowCreate(false)
    } catch (createError) {
      alert(`添加成员失败：${createError.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="members-page">
      <header className="members-header">
        <button type="button" className="members-back" onClick={onBack}>返回工作台</button>
        <div className="members-heading">
          <h1>成员与权限</h1>
          <p>{currentUser.organizationName}</p>
        </div>
        <button type="button" className="members-create" onClick={() => setShowCreate(true)}>添加成员</button>
      </header>

      <main className="members-main">
        <div className="members-filters">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索账号、姓名或邮箱" aria-label="搜索成员" />
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="">全部角色</option>
            {ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {!loading && <span className="members-count">{visibleMembers.length} 位成员</span>}
        </div>
        {error && <p className="members-error">{error}</p>}
        <section className="members-table-wrap">
          <table className="members-table">
            <thead><tr><th>成员</th><th>账号</th><th>角色</th><th>状态</th><th>最近登录</th><th>操作</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan="6">正在读取成员...</td></tr>}
              {!loading && visibleMembers.length === 0 && <tr><td colSpan="6">没有成员记录。</td></tr>}
              {!loading && visibleMembers.map((member) => (
                <tr key={member.membershipId}>
                  <td><strong>{member.user.displayName || member.user.loginName}</strong>{member.user.email && <small>{member.user.email}</small>}</td>
                  <td>{member.user.loginName}</td>
                  <td><select value={member.role} disabled={member.user.id === currentUser.userId} onChange={(event) => updateMember(member, { role: event.target.value })}>{ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                  <td><button type="button" className={member.user.isActive ? 'status-active' : 'status-inactive'} disabled={member.user.id === currentUser.userId} onClick={() => updateMember(member, { isActive: !member.user.isActive })}>{member.user.isActive ? '启用' : '停用'}</button></td>
                  <td>{formatDate(member.user.lastLoginAt)}</td>
                  <td><button type="button" className="members-text-action" onClick={() => resetPassword(member)}>重置密码</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>

      {showCreate && (
        <div className="members-modal-overlay">
          <form className="members-modal" onSubmit={createMember} onClick={(event) => event.stopPropagation()}>
            <h2>添加成员</h2>
            <label>账号<input required value={draft.loginName} onChange={(event) => setDraft({ ...draft, loginName: event.target.value })} /></label>
            <label>姓名<input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} /></label>
            <label>邮箱（可选）<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
            <label>初始密码<input type="password" minLength="8" required value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} /></label>
            <label>角色<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })}>{ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <div className="members-modal-actions"><button type="button" onClick={() => setShowCreate(false)}>取消</button><button type="submit" disabled={submitting}>{submitting ? '保存中...' : '添加成员'}</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
