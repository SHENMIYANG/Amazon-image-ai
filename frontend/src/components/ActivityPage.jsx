import { useEffect, useMemo, useState } from 'react'
import { parseApiJson } from '../utils/apiResponse'
import './ActivityPage.css'

const FIELD_LABELS = {
  productName: '产品名称',
  category: '产品类目',
  marketplace: '销售国家/地区',
  imageLanguage: '生成图片语言',
  dimensions: '尺寸规格',
  material: '材质',
  targetAudience: '目标受众',
  sellingPoints: '核心卖点',
  listingInfo: '产品信息',
  additionalInfo: '补充信息',
  designNotes: '自定义要求'
}

const STATUS_LABELS = {
  SUCCEEDED: '完成',
  FAILED: '失败',
  PENDING: '等待中',
  RUNNING: '进行中',
  CANCELLED: '已取消'
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'
}

function formatDuration(startedAt, completedAt, durationMs) {
  const milliseconds = Number(durationMs) || (startedAt && completedAt ? new Date(completedAt) - new Date(startedAt) : 0)
  return milliseconds > 0 ? `${Math.max(1, Math.round(milliseconds / 1000))} 秒` : '-'
}

function statusClass(status) {
  return `activity-status activity-status-${String(status || '').toLowerCase()}`
}

function statusLabel(status, fallback = '-') {
  return STATUS_LABELS[status] || fallback
}

async function requestActivity(url) {
  const response = await fetch(url)
  return await parseApiJson(response, '使用记录')
}

function SnapshotFields({ snapshot = {} }) {
  const fields = Object.entries(FIELD_LABELS)
    .map(([key, label]) => ({ key, label, value: snapshot?.[key] }))
    .filter((item) => item.value !== undefined && item.value !== null && String(item.value).trim())

  if (fields.length === 0) return <p className="activity-empty">没有保存产品资料。</p>
  return (
    <div className="activity-input-fields">
      {fields.map((field) => (
        <section key={field.key}>
          <h4>{field.label}</h4>
          <pre>{typeof field.value === 'string' ? field.value : JSON.stringify(field.value, null, 2)}</pre>
        </section>
      ))}
    </div>
  )
}

function References({ references = [] }) {
  if (references.length === 0) return null
  return (
    <section className="activity-references">
      <h4>当时的参考图</h4>
      <div className="activity-reference-list">
        {references.map((reference, index) => (
          <a key={`${reference.asset?.publicUrl || index}-${reference.sortOrder}`} href={reference.asset?.publicUrl || '#'} target="_blank" rel="noreferrer">
            {reference.isPrimary ? '主产品图' : reference.role}
            {reference.asset?.width && reference.asset?.height ? ` ${reference.asset.width}x${reference.asset.height}` : ''}
          </a>
        ))}
      </div>
    </section>
  )
}

function StrategyRuns({ runs = [] }) {
  if (runs.length === 0) return <p className="activity-empty">还没有生成策略。</p>
  return (
    <div className="activity-run-list">
      {runs.map((run) => (
        <details key={run.id} className="activity-detail-card">
          <summary>
            <div>
              <strong>策略生成</strong>
              <span>{formatDate(run.completedAt || run.createdAt)}</span>
            </div>
            <span className={statusClass(run.status)}>{statusLabel(run.status)}</span>
          </summary>
          <div className="activity-detail-body">
            <p className="activity-meta">
              模型：{run.model || '-'}　任务数：{run.imagePlans.length}
            </p>
            {run.errorMessage && <p className="activity-error">{run.errorMessage}</p>}
            {run.imagePlans.map((plan) => {
              const version = plan.versions?.[0]
              return (
                <article key={plan.id} className="activity-plan-card">
                  <header>
                    <strong>{plan.name}</strong>
                    <span>{plan.taskType}</span>
                    {version?.source === 'OPERATOR' && <span>人工修改</span>}
                  </header>
                  {version?.sellingFocus && (
                    <p>
                      <b>卖点重点：</b>
                      {version.sellingFocus}
                    </p>
                  )}
                  <section>
                    <h5>中文策略</h5>
                    <pre>{version?.strategyContent || '-'}</pre>
                  </section>
                  <section>
                    <h5>英文执行稿</h5>
                    <pre>{version?.promptEn || '-'}</pre>
                  </section>
                  {Array.isArray(version?.executionRules) && version.executionRules.length > 0 && (
                    <section>
                      <h5>执行保护</h5>
                      <ul>
                        {version.executionRules.map((rule, index) => (
                          <li key={`${rule}-${index}`}>{rule}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                </article>
              )
            })}
          </div>
        </details>
      ))}
    </div>
  )
}

function GenerationRuns({ runs = [] }) {
  if (runs.length === 0) return <p className="activity-empty">还没有生成图片。</p>
  return (
    <div className="activity-run-list">
      {runs.map((run) => (
        <details key={run.id} className="activity-detail-card">
          <summary>
            <div>
              <strong>{run.imagePlan?.name || '图片生成'}</strong>
              <span>{formatDate(run.completedAt || run.createdAt)}</span>
            </div>
            <span className={statusClass(run.status)}>{statusLabel(run.status)}</span>
          </summary>
          <div className="activity-detail-body">
            <p className="activity-meta">
              {run.model || '-'}　{run.resolution || '-'}　复杂度 {run.complexity || '-'}　耗时 {formatDuration(run.startedAt, run.completedAt)}
            </p>
            {run.errorMessage && <p className="activity-error">{run.errorMessage}</p>}
            {run.generatedImages.length > 0 && (
              <div className="activity-generated-images">
                {run.generatedImages.map((image) => (
                  <a key={image.id} href={image.imageUrl || '#'} target="_blank" rel="noreferrer" title="查看生成图">
                    {image.imageUrl ? <img src={image.imageUrl} alt="生成结果" /> : <span>图片文件已不存在</span>}
                  </a>
                ))}
              </div>
            )}
            <details className="activity-prompt-details">
              <summary>查看当时的英文执行稿</summary>
              <pre>{run.promptEnSnapshot || '-'}</pre>
            </details>
            {run.modelRequests.map((request) => (
              <p key={request.id} className="activity-model-request">
                模型请求：{formatDuration(null, null, request.durationMs)}
                {request.inputTokens !== null ? `，输入 ${request.inputTokens} tokens` : ''}
                {request.outputTokens !== null ? `，输出 ${request.outputTokens} tokens` : ''}
                {request.costUsd !== null ? `，费用 $${request.costUsd}` : ''}
              </p>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}

function ActivityDetail({ record }) {
  return (
    <main className="activity-detail-page">
      <section className="activity-detail-intro">
        <div>
          <span className="activity-eyebrow">产品记录</span>
          <h2>{record.title}</h2>
          <p>
            {record.owner?.displayName || record.owner?.loginName || '历史记录'}
            　更新于 {formatDate(record.updatedAt)}
          </p>
        </div>
      </section>
      <section className="activity-detail-section">
        <h3>产品资料</h3>
        <SnapshotFields snapshot={record.inputVersions?.[0]?.inputSnapshot} />
        <References references={record.inputVersions?.[0]?.references || []} />
      </section>
      <section className="activity-detail-section">
        <h3>策略记录</h3>
        <StrategyRuns runs={record.strategyRuns} />
      </section>
      <section className="activity-detail-section">
        <h3>生图记录</h3>
        <GenerationRuns runs={record.generationRuns} />
      </section>
    </main>
  )
}

export default function ActivityPage({ currentUser, workspaceId = '' }) {
  const [records, setRecords] = useState([])
  const [members, setMembers] = useState([])
  const [record, setRecord] = useState(null)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({
    q: '',
    stage: '',
    memberId: '',
    from: '',
    to: ''
  })
  const isAdmin = currentUser?.role === 'ADMIN'
  const isDetailPage = Boolean(workspaceId)
  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    return params.toString()
  }, [filters])

  useEffect(() => {
    if (isDetailPage) return undefined
    let active = true
    setLoading(true)
    setError('')
    requestActivity(`/api/activity${queryString ? `?${queryString}` : ''}`)
      .then((data) => {
        if (active) setRecords(data.records || [])
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || '使用记录读取失败。')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [isDetailPage, queryString])

  useEffect(() => {
    if (!isDetailPage || !workspaceId) return undefined
    let active = true
    setLoading(true)
    setError('')
    requestActivity(`/api/activity/${workspaceId}`)
      .then((data) => {
        if (active) setRecord(data.record || null)
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || '使用记录读取失败。')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [isDetailPage, workspaceId])

  useEffect(() => {
    if (isDetailPage || !isAdmin) return
    requestActivity('/api/members')
      .then((data) => setMembers(data.members || []))
      .catch(() => setMembers([]))
  }, [isAdmin, isDetailPage])

  const openDetail = async (recordId) => {
    setDetailLoading(true)
    setError('')
    try {
      const data = await requestActivity(`/api/activity/${recordId}`)
      setSelectedRecord(data.record || null)
    } catch (loadError) {
      setError(loadError.message || '使用记录详情读取失败。')
    } finally {
      setDetailLoading(false)
    }
  }

  const columnCount = isAdmin ? 6 : 5
  return (
    <div className="activity-page">
      <header className="activity-header">
        <a className="activity-brand" href="/" target="_blank" rel="noreferrer">
          Amazon Image Studio
        </a>
        <nav>
          {isDetailPage && <a href="/activity">全部记录</a>}
          <a href="/" target="_blank" rel="noreferrer">
            打开工作台
          </a>
        </nav>
      </header>
      {isDetailPage ? (
        <>
          {loading && <p className="activity-loading">正在读取记录...</p>}
          {error && <p className="activity-error activity-page-error">{error}</p>}
          {!loading && record && <ActivityDetail record={record} />}
        </>
      ) : (
        <main className="activity-main">
          <section className="activity-page-heading">
            <div>
              <span className="activity-eyebrow">记录中心</span>
              <h1>使用记录</h1>
              <p>{isAdmin ? '查看团队产品、策略和出图记录' : '查看你创建的产品、策略和出图记录'}</p>
            </div>
            <span className="activity-record-count">{loading ? '正在读取...' : `${records.length} 条记录`}</span>
          </section>
          <section className="activity-filter-bar" aria-label="记录筛选">
            <input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="搜索产品名称" />
            <select
              value={filters.stage}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  stage: event.target.value
                }))
              }
            >
              <option value="">全部状态</option>
              <option value="strategy">已生成策略</option>
              <option value="generated">已生成图片</option>
              <option value="failed">生图失败</option>
            </select>
            {isAdmin && (
              <select
                value={filters.memberId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    memberId: event.target.value
                  }))
                }
              >
                <option value="">全部成员</option>
                {members.map((member) => (
                  <option key={member.user.id} value={member.user.id}>
                    {member.user.displayName || member.user.loginName}
                  </option>
                ))}
              </select>
            )}
            <input
              type="date"
              value={filters.from}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  from: event.target.value
                }))
              }
              aria-label="开始日期"
            />
            <input
              type="date"
              value={filters.to}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  to: event.target.value
                }))
              }
              aria-label="结束日期"
            />
          </section>
          {error && <p className="activity-error activity-page-error">{error}</p>}
          <section className="activity-table-shell">
            <table className="activity-table">
              <thead>
                <tr>
                  <th>产品名称</th>
                  {isAdmin && <th>创建成员</th>}
                  <th>策略</th>
                  <th>生图</th>
                  <th>最近操作</th>
                  <th aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {!loading && records.length === 0 && (
                  <tr>
                    <td colSpan={columnCount} className="activity-empty">
                      还没有可查看的产品记录。
                    </td>
                  </tr>
                )}
                {records.map((item) => {
                  const strategyStatus = item.latestStrategy?.status
                  const generationStatus = item.latestGeneration?.status
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="activity-product-cell">
                          <strong>{item.title}</strong>
                          <span>{item.latestInput?.productName || '未填写产品名称'}</span>
                        </div>
                      </td>
                      {isAdmin && <td>{item.owner?.displayName || item.owner?.loginName || '历史记录'}</td>}
                      <td>
                        <span>共 {item.counts.strategyRuns} 次</span>
                        {strategyStatus && <em className={statusClass(strategyStatus)}>{statusLabel(strategyStatus)}</em>}
                      </td>
                      <td>
                        <span>
                          共 {item.counts.generationRuns} 次，
                          {item.latestGeneration?.imageCount || 0} 张
                        </span>
                        {generationStatus && <em className={statusClass(generationStatus)}>{statusLabel(generationStatus)}</em>}
                      </td>
                      <td>{formatDate(item.lastActivityAt)}</td>
                      <td>
                        <button type="button" className="activity-open-link" onClick={() => openDetail(item.id)}>
                          查看详情
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
          {(selectedRecord || detailLoading) && (
            <div className="activity-detail-overlay" role="presentation">
              <aside className="activity-detail-drawer" role="dialog" aria-modal="true" aria-label="产品使用记录详情">
                <header>
                  <div>
                    <span className="activity-eyebrow">产品记录</span>
                    <h2>{detailLoading ? '正在读取记录...' : selectedRecord?.title}</h2>
                  </div>
                  <button type="button" onClick={() => setSelectedRecord(null)}>
                    关闭
                  </button>
                </header>
                {detailLoading && <p className="activity-loading">正在读取记录...</p>}
                {!detailLoading && selectedRecord && <ActivityDetail record={selectedRecord} />}
              </aside>
            </div>
          )}
        </main>
      )}
    </div>
  )
}
