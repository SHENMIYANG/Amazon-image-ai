import { useEffect, useMemo, useRef, useState } from 'react'
import GenerationPreferences from './GenerationPreferences'
import {
  IMAGE_TASK_OPTIONS,
  buildDefaultPlansFromTasks,
  getDefaultImageTaskConfig,
  getSelectedImageTaskCount,
  normalizeImageTaskConfig
} from '../utils/imageTasks'
import './AmazonListingForm.css'

function InlineHelpTip({ content, width = '260px' }) {
  return (
    <span className="inline-help-tip">
      <button type="button" className="help-icon-btn" aria-label="查看说明">
        ?
      </button>
      <span className="inline-help-tip__popover" style={{ width }}>
        {content}
      </span>
    </span>
  )
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M7 5h8v8M15 5 9 11M12 15H5V8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function plansSignature(plans = []) {
  return JSON.stringify(
    plans.map((plan) => ({
      id: plan.id,
      taskKey: plan.taskKey,
      taskType: plan.taskType,
      name: plan.name,
      prompt: plan.prompt,
      placeholder: plan.placeholder,
      goal: plan.goal,
      layout: plan.layout,
      focus: plan.focus,
      visualFocus: plan.visualFocus,
      textDensity: plan.textDensity,
      style: plan.style,
      visualKeywords: plan.visualKeywords,
      constraints: plan.constraints,
      hardConstraints: plan.hardConstraints,
      copy: plan.copy,
      visualBlueprint: plan.visualBlueprint,
      promptHint: plan.promptHint,
      promptEn: plan.promptEn,
      executionPromptEn: plan.executionPromptEn,
      promptDirty: plan.promptDirty
    }))
  )
}

function getListingInfoPlaceholder() {
  return `可以直接粘贴完整资料，例如：
【产品名称】：Wireless Bluetooth Headphones with Noise Cancelling
【产品类目】：Electronics > Headphones
【尺寸规格】：20 x 18 x 8 cm，300g
【目标受众】：Busy professionals, students, travelers
【卖点描述】：
1. Advanced Noise Cancelling Technology
2. 40-Hour Battery Life
3. Comfortable Over-Ear Design`
}

function getAdditionalInfoPlaceholder() {
  return `补充说明，例如：
【使用方式/步骤】：首次使用前先充电 4-6 小时
【场景图要求】：希望展示花园、露台、夜间氛围
【特殊要求】：不要品牌 Logo，不要夸张特效，不要裁掉产品全貌`
}

const COMPLEXITY_LEVELS = [
  {
    value: 'L1',
    label: 'L1 极速版',
    icon: '⚡',
    description: '适合低价铺货和快速出图，画面更简洁。'
  },
  {
    value: 'L2',
    label: 'L2 标准版',
    icon: '◫',
    description: '适合大多数 SKU，卖点、场景和信息更均衡。'
  },
  {
    value: 'L3',
    label: 'L3 精品版',
    icon: '✦',
    description: '适合重点款，画面细节和质感会更重。'
  }
]

export default function AmazonListingForm({ listing, onChange, analyzer, mode = 'full' }) {
  const [promptPreviewState, setPromptPreviewState] = useState({})
  const [expandedEditor, setExpandedEditor] = useState(null)
  const previewRequestIdsRef = useRef({})
  const showProductSection = mode === 'full' || mode === 'product'
  const showStrategySection = mode === 'full' || mode === 'strategy'

  const normalizedTaskConfig = useMemo(
    () => normalizeImageTaskConfig(listing.selectedImageTasks || getDefaultImageTaskConfig()),
    [listing.selectedImageTasks]
  )

  const imagePlans = listing.imagePlans || []
  const selectedTaskCount = getSelectedImageTaskCount(normalizedTaskConfig)

  useEffect(() => {
    if (!showStrategySection) return

    const nextPlans = buildDefaultPlansFromTasks(normalizedTaskConfig, imagePlans)
    if (plansSignature(imagePlans) !== plansSignature(nextPlans)) {
      onChange('imagePlans', nextPlans)
    }
  }, [showStrategySection, normalizedTaskConfig, imagePlans, onChange])

  const handleImagePlanChange = (imageId, prompt) => {
    previewRequestIdsRef.current[imageId] = `dirty-${Date.now()}`

    onChange(
      'imagePlans',
      imagePlans.map((plan) =>
        plan.id === imageId
          ? {
              ...plan,
              promptHint: prompt,
              prompt,
              promptEn: '',
              executionPromptEn: '',
              promptDirty: true
            }
          : plan
      )
    )

    setPromptPreviewState((prev) => ({
      ...prev,
      [imageId]: null
    }))
  }

  const handleTaskCountChange = (taskType, nextCount) => {
    onChange('selectedImageTasks', {
      ...normalizedTaskConfig,
      [taskType]: Math.max(0, Math.min(6, nextCount))
    })
  }

  const openExpandedEditor = (config) => {
    setExpandedEditor(config)
  }

  const closeExpandedEditor = () => {
    setExpandedEditor(null)
  }

  const saveExpandedEditor = () => {
    if (!expandedEditor) return
    onChange(expandedEditor.field, expandedEditor.value)
    setExpandedEditor(null)
  }

  const handlePreviewPrompt = async (plan) => {
    const sourcePrompt = plan?.prompt || plan?.promptHint || ''
    if (!sourcePrompt || sourcePrompt.trim() === '') {
      setPromptPreviewState((prev) => ({
        ...prev,
        [plan.id]: {
          status: 'error',
          message: '请先填写这张图的中文策略，再生成英文执行稿。'
        }
      }))
      return
    }

    const requestId = Date.now() + plan.id
    previewRequestIdsRef.current[plan.id] = requestId

    setPromptPreviewState((prev) => ({
      ...prev,
      [plan.id]: {
        status: 'syncing',
        message: '正在生成英文执行稿...'
      }
    }))

    try {
      const response = await fetch('/api/prompt-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing,
          plan: {
            id: plan.id,
            name: plan.name,
            type: plan.type,
            taskType: plan.taskType,
            taskKey: plan.taskKey,
            purpose: plan.purpose,
            goal: plan.goal,
            layout: plan.layout,
            focus: plan.focus,
            visualFocus: plan.visualFocus,
            textDensity: plan.textDensity,
            style: plan.style,
            visualKeywords: plan.visualKeywords,
            constraints: plan.constraints,
            hardConstraints: plan.hardConstraints,
            copy: plan.copy,
            visualBlueprint: plan.visualBlueprint,
            promptHint: plan.promptHint || sourcePrompt,
            prompt: sourcePrompt,
            promptEn: plan.promptEn,
            promptDirty: plan.promptDirty
          },
          resolution: '2048x2048'
        })
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.message || '英文执行稿生成失败')
      }

      if (previewRequestIdsRef.current[plan.id] !== requestId) return

      onChange('imagePlans', (currentPlans = []) =>
        currentPlans.map((item) =>
          item.id === plan.id
            ? {
                ...item,
                promptEn: result.data.promptEn || '',
                executionPromptEn: result.data.executionPromptEn || '',
                promptDirty: false
              }
            : item
        )
      )

      setPromptPreviewState((prev) => ({
        ...prev,
        [plan.id]: {
          status: 'success',
          message: '英文执行稿已生成，可展开查看。'
        }
      }))
    } catch (error) {
      if (previewRequestIdsRef.current[plan.id] !== requestId) return

      setPromptPreviewState((prev) => ({
        ...prev,
        [plan.id]: {
          status: 'error',
          message: error.message || '英文执行稿生成失败'
        }
      }))
    }
  }

  return (
    <div className={`amazon-listing-form amazon-listing-form--${mode}`}>
      {showProductSection && (
        <>
          <div className="form-section">
            <div className="section-header">
              <h3>产品信息</h3>
              <span className="section-number">基础输入</span>
            </div>

            <div className="form-group unified-listing-input">
              <div className="form-group-header">
                <label className="label-with-help">
                  产品 Listing 信息 + 核心卖点 <span className="required">*</span>
                  <InlineHelpTip
                    width="300px"
                    content="这里统一填写产品名称、卖点、规格、材质、受众、类目等关键信息，AI 会把它当作后续分析和生成的核心输入。"
                  />
                </label>
              </div>
              <div className="expandable-textarea">
                <textarea
                  value={listing.listingInfo || listing.sellingPoints || ''}
                  onChange={(event) => onChange('listingInfo', event.target.value)}
                  placeholder={getListingInfoPlaceholder()}
                  rows={5}
                />
                <button
                  type="button"
                  className="textarea-expand-icon"
                  onClick={() =>
                    openExpandedEditor({
                      field: 'listingInfo',
                      title: '产品 Listing 信息 + 核心卖点',
                      placeholder: getListingInfoPlaceholder(),
                      value: listing.listingInfo || listing.sellingPoints || ''
                    })
                  }
                  title="放大编辑"
                >
                  <ExpandIcon />
                </button>
              </div>
            </div>

            <div className="form-group">
              <div className="form-group-header">
                <label className="label-with-help">
                  补充信息（可选）
                  <InlineHelpTip
                    width="300px"
                    content="这里适合补充使用方式、场景要求、禁用元素、卖点顺序、排版偏好等，属于对主信息的定向补充。"
                  />
                </label>
              </div>
              <div className="expandable-textarea">
                <textarea
                  value={listing.additionalInfo || ''}
                  onChange={(event) => onChange('additionalInfo', event.target.value)}
                  placeholder={getAdditionalInfoPlaceholder()}
                  rows={3}
                />
                <button
                  type="button"
                  className="textarea-expand-icon"
                  onClick={() =>
                    openExpandedEditor({
                      field: 'additionalInfo',
                      title: '补充信息',
                      placeholder: getAdditionalInfoPlaceholder(),
                      value: listing.additionalInfo || ''
                    })
                  }
                  title="放大编辑"
                >
                  <ExpandIcon />
                </button>
              </div>
            </div>
          </div>

          <GenerationPreferences listing={listing} onChange={onChange} />
        </>
      )}

      {showStrategySection && (
        <div className="form-section">
          <div className="section-header">
            <h3>出图任务规划</h3>
            <span className="section-number">{selectedTaskCount} 张图</span>
          </div>

          <div className="image-task-configurator">
            <div className="image-task-configurator__header">
              <h4>图片类型和张数</h4>
            </div>

            <div className="image-task-list">
              {IMAGE_TASK_OPTIONS.map((option) => {
                const count = normalizedTaskConfig[option.type] || 0

                return (
                  <div key={option.type} className="image-task-row">
                    <div className="image-task-copy">
                      <div className="image-task-copy__title">
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </div>
                    </div>

                    <div className="image-task-stepper">
                      <button
                        type="button"
                        onClick={() => handleTaskCountChange(option.type, count - 1)}
                        disabled={count <= 0}
                      >
                        -
                      </button>
                      <span>{count}</span>
                      <button
                        type="button"
                        onClick={() => handleTaskCountChange(option.type, count + 1)}
                        disabled={count >= 6}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="strategy-complexity-block">
            <div className="strategy-complexity-header">
              <h4>出图复杂度</h4>
            </div>

            <div className="strategy-complexity-grid">
              {COMPLEXITY_LEVELS.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  className={`strategy-complexity-card ${listing.complexity === level.value ? 'active' : ''}`}
                  onClick={() => onChange('complexity', level.value)}
                >
                  <span className="strategy-complexity-icon" aria-hidden="true">
                    {level.icon}
                  </span>
                  <span className="strategy-complexity-copy">
                    <strong>{level.label}</strong>
                    <small>{level.description}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {analyzer && <div className="strategy-analyzer-slot">{analyzer}</div>}

          <div className="image-plans-container">
            <div className="image-plans-header">
              <h4>已规划 {imagePlans.length} 张图</h4>
            </div>

            {imagePlans.length === 0 ? (
              <div className="image-plans-empty">请先选择至少 1 张要生成的图片任务。</div>
            ) : (
              <div className="image-plans-grid image-plans-grid--full">
                {imagePlans.map((plan) => {
                  return (
                    <div
                      key={plan.id}
                      className={`form-group image-plan-group ${
                        plan.taskType === 'main' ? 'image-plan-group--hero' : ''
                      }`}
                    >
                      <div className="image-plan-label">
                        <div className="image-plan-heading">
                          <span className="image-badge">{`图 ${plan.id}`}</span>
                          <span className="image-type">{plan.name}</span>
                        </div>
                        {plan.purpose ? <span className="image-plan-purpose">{plan.purpose}</span> : null}
                      </div>

                      <textarea
                        value={plan.prompt || ''}
                        placeholder={plan.placeholder || ''}
                        onChange={(event) => handleImagePlanChange(plan.id, event.target.value)}
                        rows={plan.taskType === 'main' ? 3 : 4}
                      />

                      <div className="plan-preview-actions">
                        <button
                          type="button"
                          className="plan-preview-btn"
                          onClick={() => handlePreviewPrompt(plan)}
                          disabled={promptPreviewState[plan.id]?.status === 'syncing'}
                        >
                          {promptPreviewState[plan.id]?.status === 'syncing'
                            ? '生成中...'
                            : plan.executionPromptEn && !plan.promptDirty
                              ? '更新英文执行稿'
                              : '生成英文执行稿'}
                        </button>
                      </div>

                      {promptPreviewState[plan.id]?.message && (
                        <span
                          className={`help-text prompt-sync-status prompt-sync-status--${promptPreviewState[plan.id].status}`}
                        >
                          {promptPreviewState[plan.id].message}
                        </span>
                      )}

                      {plan.promptEn && (
                        <details className="strategy-english-prompt">
                          <summary>查看英文策略 Prompt</summary>
                          <small>{plan.promptEn}</small>
                        </details>
                      )}

                      {plan.executionPromptEn && (
                        <details className="strategy-english-prompt strategy-english-prompt--final">
                          <summary>查看最终英文执行稿</summary>
                          <small>{plan.executionPromptEn}</small>
                        </details>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {expandedEditor && (
        <div className="editor-modal-overlay" onClick={closeExpandedEditor}>
          <div className="editor-modal-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="editor-modal-header">
              <div>
                <h4>{expandedEditor.title}</h4>
                <p>这里可以放大填写，保存后会同步回当前表单。</p>
              </div>
              <button type="button" className="editor-modal-close" onClick={closeExpandedEditor}>
                ×
              </button>
            </div>

            <textarea
              className="editor-modal-textarea"
              value={expandedEditor.value}
              placeholder={expandedEditor.placeholder}
              onChange={(event) =>
                setExpandedEditor((prev) =>
                  prev
                    ? {
                        ...prev,
                        value: event.target.value
                      }
                    : prev
                )
              }
              rows={18}
            />

            <div className="editor-modal-footer">
              <button type="button" className="editor-modal-btn editor-modal-btn--ghost" onClick={closeExpandedEditor}>
                取消
              </button>
              <button type="button" className="editor-modal-btn editor-modal-btn--primary" onClick={saveExpandedEditor}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
