import { useMemo, useRef, useState } from 'react'
import './ImageFeedbackChat.css'

function buildInitialRevision(image) {
  return {
    strategyContent: image?.strategyContent || '',
    promptEn: image?.promptEn || '',
    executionRules: image?.executionRules || image?.constraints || []
  }
}

function getImagePromptUsed(image) {
  return image?.promptUsed || image?.executionPromptEn || image?.prompt || ''
}

function mayBeGenerateIntent(message) {
  return /生成|出图|开始做|按这个|可以了|好了|重新做|重做|再来一张/i.test(message)
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  )
}

function AttachmentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

export default function ImageFeedbackChat({
  task,
  image,
  chatState,
  onChange,
  onRegenerate,
  onDownload,
  onClose
}) {
  const fileInputRef = useRef(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const messages = chatState?.messages?.length
    ? chatState.messages
    : [
        {
          role: 'assistant',
          content: '你可以直接告诉我这张图哪里不对。我会结合这张图的产品真相、当前策略、英文执行稿和最终 prompt 来分析；如果你让我生成，我会按当前对话里的最新修图指令重新生成这张图。'
        }
      ]

  const revision = chatState?.revision || buildInitialRevision(image)
  const attachments = Array.isArray(chatState?.attachments) ? chatState.attachments : []

  const contextPayload = useMemo(() => ({
    productBlueprint: task?.listing?.productBlueprint || task?.listing?.productTruth || {},
    imagePlan: {
      id: image?.imageId,
      type: image?.taskType,
      taskType: image?.taskType,
      name: image?.name,
      imageRole: image?.imageRole || '',
      sellingFocus: image?.sellingFocus || image?.primarySellingPoint || '',
      strategyContent: image?.strategyContent || '',
      promptEn: image?.promptEn || '',
      executionRules: image?.executionRules || image?.constraints || []
    },
    generatedImage: {
      imageId: image?.imageId,
      name: image?.name,
      type: image?.taskType,
      imageUrl: image?.imageUrl,
      strategyContent: image?.strategyContent || '',
      promptEn: image?.promptEn || '',
      executionRules: image?.executionRules || image?.constraints || []
    },
    promptUsed: getImagePromptUsed(image),
    currentRevision: revision,
    feedbackReferenceImages: attachments.map((item) => item.url).filter(Boolean),
    complexity: task?.listing?.complexity || 'L2'
  }), [task, image, revision, attachments])

  const updateChatState = (nextState) => {
    onChange?.({
      messages,
      revision,
      attachments,
      ...nextState,
      updatedAt: new Date().toISOString()
    })
  }

  const appendAndSave = (baseMessages, nextMessage, nextRevision = revision, nextAttachments = attachments) => {
    const nextMessages = [...baseMessages, nextMessage]
    updateChatState({
      messages: nextMessages,
      revision: nextRevision,
      attachments: nextAttachments
    })
    return nextMessages
  }

  const uploadImages = async (event) => {
    const remainingSlots = Math.max(0, 8 - attachments.length)
    const files = Array.from(event.target.files || [])
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, remainingSlots)
    event.target.value = ''
    if (!files.length || uploading || loading || generating) return

    setError('')
    setUploading(true)

    try {
      const formData = new FormData()
      files.forEach((file) => formData.append('images', file))

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || `HTTP ${response.status}`)
      }

      const uploaded = (data.images || []).map((item) => ({
        url: item.url,
        filename: item.filename,
        size: item.size,
        mimetype: item.mimetype
      })).filter((item) => item.url)

      const nextAttachments = [...attachments, ...uploaded].slice(0, 8)
      appendAndSave(messages, {
        role: 'assistant',
        content: `已添加 ${uploaded.length} 张当前图片反馈参考图。生成时会一起用于这张图的单张重生。`
      }, revision, nextAttachments)
    } catch (err) {
      setError(err.message || '上传图片失败')
    } finally {
      setUploading(false)
    }
  }

  const sendMessage = async () => {
    const userMessage = input.trim()
    if (!userMessage || loading || generating || uploading) return

    setInput('')
    setError('')
    const nextMessages = [...messages, { role: 'user', content: userMessage }]
    updateChatState({ messages: nextMessages })
    setLoading(true)

    try {
      const response = await fetch('/api/image-feedback/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...contextPayload,
          messages,
          userMessage
        })
      })

      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || `HTTP ${response.status}`)
      }

      const result = data.data || {}
      const nextRevision = {
        strategyContent: result.revision?.strategyContent || revision.strategyContent,
        promptEn: result.revision?.promptEn || revision.promptEn,
        executionRules: result.revision?.executionRules?.length
          ? result.revision.executionRules
          : revision.executionRules
      }
      const shouldGenerate = result.intent === 'generate_ready'
      const assistantContent = [
        result.reply || '我已理解并更新这张图的修图方向。',
        shouldGenerate && result.finalInstruction
          ? `\n【最终生图指令摘要】\n${result.finalInstruction}`
          : '',
        shouldGenerate ? '\n我会按这份最新修图指令重新生成当前这张图。' : ''
      ].filter(Boolean).join('\n')

      let currentMessages = appendAndSave(nextMessages, {
        role: 'assistant',
        content: assistantContent,
        intent: result.intent
      }, nextRevision)

      if (shouldGenerate) {
        if (!onRegenerate) {
          throw new Error('当前图片没有可用的重新生成入口')
        }

        currentMessages = appendAndSave(currentMessages, {
          role: 'assistant',
          content: '正在调用真实生图接口重新生成当前图片...'
        }, nextRevision)
        setGenerating(true)

        const generatedImage = await onRegenerate(
          nextRevision,
          attachments.map((item) => item.url).filter(Boolean)
        )
        if (!generatedImage?.imageUrl) {
          throw new Error('重新生成失败：生图接口没有返回新图片')
        }

        appendAndSave(currentMessages, {
          role: 'assistant',
          content: '已按当前反馈重新生成图片。',
          generatedImage
        }, nextRevision)
      }
    } catch (err) {
      const message = err.message || '图片反馈对话失败'
      setError(message)
      updateChatState({
        messages: [
          ...nextMessages,
          { role: 'assistant', content: `请求失败：${message}` }
        ]
      })
    } finally {
      setLoading(false)
      setGenerating(false)
    }
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="feedback-chat-modal" onClick={onClose}>
      <div className="feedback-chat-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="feedback-chat-dialog__header">
          <div>
            <h3>图片反馈对话</h3>
            <p>图 {image?.imageId}{image?.name ? ` · ${image.name}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭图片反馈对话">×</button>
        </div>

        <div className="feedback-chat-dialog__body">
          <aside className="feedback-chat-preview">
            {image?.imageUrl ? <img src={image.imageUrl} alt={`图 ${image.imageId}`} /> : null}
            <div className="feedback-chat-preview__meta">
              <strong>{image?.taskType || 'image'}</strong>
              <span>{task?.listing?.productName || '当前产品'}</span>
            </div>
            <details>
              <summary>当前修图指令</summary>
              <pre>{revision.strategyContent || '暂无中文策略'}</pre>
              <pre>{revision.promptEn || '暂无英文执行稿'}</pre>
              <pre>{(revision.executionRules || []).join('\n') || '暂无执行保护'}</pre>
            </details>
          </aside>

          <section className="feedback-chat-panel">
            <div className="feedback-chat-panel__messages">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`feedback-chat-message feedback-chat-message--${message.role}`}>
                  <div className="feedback-chat-message__avatar">{message.role === 'assistant' ? 'AI' : '你'}</div>
                  <div className="feedback-chat-message__content">
                    <div>{message.content}</div>
                    {message.generatedImage?.imageUrl ? (
                      <div className="feedback-generated-image">
                        <img src={message.generatedImage.imageUrl} alt="反馈重新生成图片" />
                        <button
                          type="button"
                          className="feedback-generated-image__download"
                          title="下载图片"
                          aria-label="下载图片"
                          onClick={() => onDownload?.(
                            message.generatedImage.imageUrl,
                            `feedback-image-${message.generatedImage.imageId || image?.imageId || Date.now()}.png`,
                            message.generatedImage.resolution || image?.requestedResolution
                          )}
                        >
                          <DownloadIcon />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {(loading || generating) ? (
                <div className="feedback-chat-message feedback-chat-message--assistant">
                  <div className="feedback-chat-message__avatar">AI</div>
                  <div className="feedback-chat-message__content">
                    {generating ? '正在生成图片，请稍等...' : '正在结合这张图的策略和 prompt 分析...'}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="feedback-chat-panel__composer">
              {attachments.length ? (
                <div className="feedback-chat-attachments">
                  {attachments.map((attachment, index) => (
                    <div key={`${attachment.url}-${index}`} className="feedback-chat-attachment">
                      <img src={attachment.url} alt={`参考图 ${index + 1}`} />
                      <button
                        type="button"
                        aria-label="移除参考图"
                        onClick={() => updateChatState({
                          attachments: attachments.filter((_, itemIndex) => itemIndex !== index)
                        })}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="feedback-chat-panel__input">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="告诉 AI 这张图哪里不对，或直接说“按这个生成”。"
                  rows={3}
                />
                <button type="button" onClick={sendMessage} disabled={loading || generating || uploading || !input.trim()}>
                  {mayBeGenerateIntent(input) ? '发送并执行' : '发送'}
                </button>
              </div>

              <div className="feedback-chat-panel__tools">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="feedback-chat-file-input"
                  onChange={uploadImages}
                />
                <button
                  type="button"
                  className="feedback-chat-upload"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading || generating || uploading || attachments.length >= 8}
                >
                  <AttachmentIcon />
                  <span>{uploading ? '上传中...' : '添加图片'}</span>
                </button>
                <span className="feedback-chat-upload-hint">仅用于当前这张图</span>
              </div>
            </div>
            {error ? <div className="feedback-chat-panel__error">{error}</div> : null}
          </section>
        </div>
      </div>
    </div>
  )
}
