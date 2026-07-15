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

function plansSignature(plans = []) {
  return JSON.stringify(
    plans.map((plan) => ({
      id: plan.id,
      taskKey: plan.taskKey,
      taskType: plan.taskType,
      name: plan.name,
      prompt: plan.prompt,
      promptEn: plan.promptEn,
      executionPromptEn: plan.executionPromptEn,
      promptDirty: plan.promptDirty
    }))
  )
}

export default function AmazonListingForm({ listing, onChange, analyzer, mode = 'full' }) {
  const [promptPreviewState, setPromptPreviewState] = useState({})
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

  const handlePreviewPrompt = async (plan) => {
    if (!plan?.prompt || plan.prompt.trim() === '') {
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
            prompt: plan.prompt,
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
            <p className="section-description">
              把产品 Listing 信息、核心卖点、使用场景、使用方式、尺寸材质等尽量集中放在这里。
              AI 分析和后续生图都会以这里的内容为主。
            </p>

            <div className="form-group unified-listing-input">
              <label>
                产品 Listing 信息 + 核心卖点 <span className="required">*</span>
              </label>
              <textarea
                value={listing.listingInfo || listing.sellingPoints || ''}
                onChange={(event) => onChange('listingInfo', event.target.value)}
                placeholder={`可以直接粘贴完整资料，例如：
【产品名称】：Wireless Bluetooth Headphones with Noise Cancelling
【产品类目】：Electronics > Headphones
【尺寸规格】：20 x 18 x 8 cm, 300g
【目标受众】：Busy professionals, students, travelers
【卖点描述】：1. Advanced Noise Cancelling Technology
2. 40-Hour Battery Life
3. Comfortable Over-Ear Design`}
                rows={10}
              />
              <span className="help-text">
                建议至少包含：产品名称、卖点、使用场景、使用方式、尺寸规格、材质、目标受众、竞品线索等。信息越完整，分析和生图越稳。
              </span>
            </div>

            <div className="form-group">
              <label>补充信息（可选）</label>
              <textarea
                value={listing.additionalInfo || ''}
                onChange={(event) => onChange('additionalInfo', event.target.value)}
                placeholder={`补充说明，例如：
【使用方式/步骤】：首次使用前先充电 4-6 小时
【场景图要求】：希望展示花园、露台、夜间氛围
【特殊要求】：不要品牌 Logo，不要夸张特效，不要裁掉产品全貌`}
                rows={4}
              />
              <span className="help-text">
                这里适合填写禁用内容、额外场景要求、包装说明、礼品属性，或者你不想丢给 AI 自己猜的细节。
              </span>
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
          <p className="section-description">
            不再固定套用 7 套策略类型。这里直接决定要生成什么图、各出几张，再让 AI 结合产品图、补充信息和自定义设置去生成对应方案。
          </p>

          <div className="image-task-configurator">
            <div className="image-task-configurator__header">
              <h4>图片类型与张数</h4>
              <span className="help-text">
                例如可以只保留 4 张卖点图，不出主图和尺寸图，减少浪费。
              </span>
            </div>

            <div className="image-task-list">
              {IMAGE_TASK_OPTIONS.map((option) => {
                const count = normalizedTaskConfig[option.type] || 0

                return (
                  <div key={option.type} className="image-task-row">
                    <div className="image-task-copy">
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
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

          <p className="section-help">
            AI 会把上传的参考图当作产品一致性的依据：尽量保持产品的外形、颜色、材质、结构和细节统一，不乱改产品本体。
          </p>

          {analyzer && <div className="strategy-analyzer-slot">{analyzer}</div>}

          <div className="image-plans-container">
            <div className="image-plans-header">
              <h4>已规划 {imagePlans.length} 张图</h4>
              <span className="help-text">
                这里默认只看中文策略。英文执行稿不会自动请求，只有你手动点某一张时才会生成。
              </span>
            </div>

            {imagePlans.length === 0 ? (
              <div className="image-plans-empty">请先选择至少 1 张要生成的图片任务。</div>
            ) : (
              <div className="image-plans-grid image-plans-grid--full">
                {imagePlans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`form-group image-plan-group ${
                      plan.taskType === 'main' ? 'image-plan-group--hero' : ''
                    }`}
                  >
                    <div className="image-plan-label">
                      <span className="image-badge">{`图 ${plan.id}`}</span>
                      <span className="image-type">{plan.name}</span>
                    </div>

                    <textarea
                      value={plan.prompt || ''}
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

                      <span className="help-text">
                        英文执行稿仅在查看或核对时按需生成，真正点击“开始生成”时系统也会自动处理。
                      </span>
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

                    {plan.taskType === 'main' ? (
                      <span className="help-text">
                        主图必须优先满足亚马逊规范：白底、全貌、无 Logo、无无关元素。
                      </span>
                    ) : (
                      <span className="help-text">
                        这里可以继续手动补充你想要的场景、卖点顺序、排版重点或禁用元素。
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
