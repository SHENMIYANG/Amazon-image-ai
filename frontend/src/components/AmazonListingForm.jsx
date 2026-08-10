import { useEffect, useMemo, useState } from 'react'
import GenerationPreferences from './GenerationPreferences'
import ComplexitySelector from './ComplexitySelector'
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
      strategyContent: plan.strategyContent,
      executionRules: Array.isArray(plan.executionRules) ? plan.executionRules : [],
      placeholder: plan.placeholder,
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

function getExecutionRulesPlaceholder() {
  return ['例如：', '对准产品与使用物体的真实接触位。', '关键配件必须清楚可见。', '禁止穿模、悬空或新增不存在结构。'].join('\n')
}

export default function AmazonListingForm({
  listing,
  onChange,
  analyzer,
  mode = 'full',
  onSaveStrategyTranslation,
  savingStrategyTranslations = {}
}) {
  const [expandedEditor, setExpandedEditor] = useState(null)
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
    onChange(
      'imagePlans',
      imagePlans.map((plan) =>
        plan.id === imageId
          ? {
              ...plan,
              strategyContent: prompt,
              prompt,
              promptEn: '',
              promptDirty: true
            }
          : plan
      )
    )
  }

  const handleExecutionRulesChange = (imageId, value) => {
    const executionRules = String(value || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    onChange(
      'imagePlans',
      imagePlans.map((plan) =>
        plan.id === imageId
          ? {
              ...plan,
              executionRules,
              promptEn: '',
              promptDirty: true
            }
          : plan
      )
    )
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
                    content="这里统一填写产品名称、卖点、规格、材质、受众、类目等关键信息，AI 会把它当作后续分析和生图的核心输入。"
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
                  补充信息
                  <InlineHelpTip
                    width="300px"
                    content="这里适合补充使用方式、场景痛点、安装方案、禁用元素、卖点顺序、排版偏好等，AI 会尽量把这些内容吸收到具体策略里。"
                  />
                </label>
              </div>
              <div className="expandable-textarea">
                <textarea
                  value={listing.additionalInfo || ''}
                  onChange={(event) => onChange('additionalInfo', event.target.value)}
                  placeholder={getAdditionalInfoPlaceholder()}
                  rows={4}
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

          <ComplexitySelector
            selected={listing.complexity || 'L2'}
            onChange={(value) => onChange('complexity', value)}
          />

          {analyzer && <div className="strategy-analyzer-slot">{analyzer}</div>}

          {(listing.listingInfo || listing.additionalInfo) && (
            <details className="strategy-source-context">
              <summary>
                <span>本次策划依据</span>
                <small>核对 AI 是否吸收了原始产品信息、场景痛点、安装方案和使用步骤</small>
              </summary>
              <div className="strategy-source-context__body">
                {listing.listingInfo ? (
                  <section>
                    <h5>产品 Listing 信息</h5>
                    <pre>{listing.listingInfo}</pre>
                  </section>
                ) : null}
                {listing.additionalInfo ? (
                  <section>
                    <h5>补充信息与业务要求</h5>
                    <pre>{listing.additionalInfo}</pre>
                  </section>
                ) : null}
              </div>
            </details>
          )}

          <div className="image-plans-container">
            <div className="image-plans-header">
              <h4>已规划 {imagePlans.length} 张图</h4>
              <p className="image-plans-review-note">
                这里只看中文策略正文。你修改后，点击生成图片时系统会直接按最新这版策略执行。
              </p>
            </div>

            {imagePlans.length === 0 ? (
              <div className="image-plans-empty">请先选择至少 1 张要生成的图片任务。</div>
            ) : (
              <div className="image-plans-grid image-plans-grid--full">
                {imagePlans.map((plan) => {
                  const isSaving = Boolean(savingStrategyTranslations?.[plan.id])
                  const hasStrategy = Boolean(String(plan.strategyContent || '').trim())
                  const englishStatus =
                    plan.taskType === 'main'
                      ? '主图固定英文稿'
                      : plan.promptDirty
                        ? '英文执行稿待更新'
                        : plan.promptEn
                          ? '英文执行稿已保存'
                          : '未生成英文执行稿'

                  return (
                    <div
                      key={plan.id}
                      className={`form-group image-plan-group ${plan.taskType === 'main' ? 'image-plan-group--hero' : ''}`}
                    >
                      <div className="image-plan-label">
                        <div className="image-plan-heading">
                          <span className="image-badge">{`图 ${plan.id}`}</span>
                          <span className="image-type">{plan.name}</span>
                        </div>
                        {plan.purpose ? <span className="image-plan-purpose">{plan.purpose}</span> : null}
                      </div>

                      <div className="image-plan-strategy-meta">
                        <span className="image-plan-strategy-tag">中文策略正文</span>
                        <span className="strategy-english-status">{englishStatus}</span>
                      </div>

                      <textarea
                        value={plan.strategyContent || ''}
                        placeholder={plan.placeholder || ''}
                        onChange={(event) => handleImagePlanChange(plan.id, event.target.value)}
                        rows={plan.taskType === 'main' ? 6 : 8}
                      />

                      {plan.taskType !== 'main' ? (
                        <div className="image-plan-execution-block">
                          <div className="image-plan-execution-block__header">
                            <span className="image-plan-execution-block__tag">执行保护</span>
                            <small>硬性要求和禁止项</small>
                          </div>
                          <textarea
                            className="image-plan-execution-textarea"
                            value={(plan.executionRules || []).join('\n')}
                            placeholder={getExecutionRulesPlaceholder()}
                            onChange={(event) => handleExecutionRulesChange(plan.id, event.target.value)}
                            rows={3}
                          />
                        </div>
                      ) : null}

                      {plan.taskType !== 'main' ? (
                        <div className="image-plan-actions">
                          <button
                            type="button"
                            className="editor-modal-btn editor-modal-btn--ghost image-plan-save-btn"
                            onClick={() => onSaveStrategyTranslation?.(plan.id)}
                            disabled={!hasStrategy || isSaving}
                          >
                            {isSaving ? '保存中...' : '保存本图英文执行稿'}
                          </button>
                        </div>
                      ) : null}
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
