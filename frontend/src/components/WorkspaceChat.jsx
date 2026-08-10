import { useEffect, useMemo, useRef, useState } from 'react'
import { formatApiError, parseApiJson } from '../utils/apiResponse'
import './WorkspaceChat.css'

const MAX_ATTACHMENTS = 8
const MAX_FILE_SIZE = 10 * 1024 * 1024
const SUPPORTED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json'
])

const SUPPORTED_EXTENSIONS = /\.(txt|md|csv|json)$/i

function isSupportedFile(file) {
  return SUPPORTED_TYPES.has(file.type) || SUPPORTED_EXTENSIONS.test(file.name || '')
}

function AttachmentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  )
}

function buildInitialMessage() {
  return {
    role: 'assistant',
    content: '你可以在这里分析产品、卖点、受众、参考图和图片表达方向。'
  }
}

export function createInitialWorkspaceChatMessages() {
  return [buildInitialMessage()]
}

export default function WorkspaceChat({
  showHeader = true,
  messages,
  onMessagesChange,
  attachments,
  onAttachmentsChange
}) {
  const fileInputRef = useRef(null)
  const attachmentsRef = useRef([])
  const [localMessages, setLocalMessages] = useState(createInitialWorkspaceChatMessages())
  const [input, setInput] = useState('')
  const [localAttachments, setLocalAttachments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const activeMessages = Array.isArray(messages) ? messages : localMessages
  const activeAttachments = Array.isArray(attachments) ? attachments : localAttachments
  const updateMessages = onMessagesChange || setLocalMessages
  const updateAttachments = onAttachmentsChange || setLocalAttachments

  useEffect(() => {
    attachmentsRef.current = activeAttachments
  }, [activeAttachments])

  useEffect(() => () => {
    attachmentsRef.current.forEach((attachment) => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    })
  }, [])

  const canSend = useMemo(
    () => Boolean(input.trim() || activeAttachments.length) && !loading,
    [input, activeAttachments.length, loading]
  )

  const addAttachments = (event) => {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''
    if (!selectedFiles.length) return

    const nextAttachments = [...activeAttachments]
    const errors = []

    for (const file of selectedFiles) {
      if (nextAttachments.length >= MAX_ATTACHMENTS) {
        errors.push(`最多上传 ${MAX_ATTACHMENTS} 个附件。`)
        break
      }

      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name} 超过 10MB。`)
        continue
      }

      if (!isSupportedFile(file)) {
        errors.push(`${file.name} 不支持。当前支持 JPG、PNG、WEBP、TXT、MD、CSV、JSON。`)
        continue
      }

      nextAttachments.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        type: file.type,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
      })
    }

    updateAttachments(nextAttachments)
    setError(errors[0] || '')
  }

  const removeAttachment = (attachmentId) => {
    updateAttachments((prev) => {
      const target = prev.find((attachment) => attachment.id === attachmentId)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((attachment) => attachment.id !== attachmentId)
    })
  }

  const clearChat = () => {
    activeAttachments.forEach((attachment) => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    })
    updateMessages(createInitialWorkspaceChatMessages())
    updateAttachments([])
    setInput('')
    setError('')
  }

  const sendMessage = async () => {
    if (!canSend) return

    const userText = input.trim()
    const sentAttachments = activeAttachments
    const userMessage = {
      role: 'user',
      content: userText || '请分析我上传的附件。',
      attachments: sentAttachments.map((attachment) => ({
        name: attachment.name,
        type: attachment.type
      }))
    }
    const nextMessages = [...activeMessages, userMessage]

    updateMessages(nextMessages)
    setInput('')
    updateAttachments([])
    setError('')
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('message', userMessage.content)
      formData.append('history', JSON.stringify(activeMessages.filter((message) => message.role !== 'system')))
      sentAttachments.forEach((attachment) => formData.append('attachments', attachment.file))

      const response = await fetch('/api/workspace-chat', {
        method: 'POST',
        body: formData
      })
      const data = await parseApiJson(response, '产品分析对话接口')

      if (!data.success) {
        throw new Error(data.message || '产品分析对话失败')
      }

      updateMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply || '没有返回内容。'
        }
      ])
    } catch (err) {
      const message = formatApiError(err, '产品分析对话')
      setError(message)
      updateMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: message
        }
      ])
    } finally {
      sentAttachments.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      })
      setLoading(false)
    }
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  return (
    <section className="workspace-chat">
      {showHeader ? (
        <div className="workspace-chat__header">
          <div>
            <h2>产品分析 Chat</h2>
            <p>用于分析产品、卖点、受众、参考图和图片表达方向。</p>
          </div>
          <div className="workspace-chat__actions">
            <button type="button" onClick={clearChat} disabled={loading}>
              清空对话
            </button>
          </div>
        </div>
      ) : (
        <div className="workspace-chat__modal-actions">
          <button type="button" onClick={clearChat} disabled={loading}>
            清空对话
          </button>
        </div>
      )}

      <div className="workspace-chat__messages">
        {activeMessages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`workspace-chat-message workspace-chat-message--${message.role}`}>
            <div className="workspace-chat-message__avatar">
              {message.role === 'assistant' ? 'AI' : '你'}
            </div>
            <div className="workspace-chat-message__bubble">
              <div className="workspace-chat-message__text">{message.content}</div>
              {message.attachments?.length ? (
                <div className="workspace-chat-message__files">
                  {message.attachments.map((attachment, itemIndex) => (
                    <span key={`${attachment.name}-${itemIndex}`}>{attachment.name}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {loading ? (
          <div className="workspace-chat-message workspace-chat-message--assistant">
            <div className="workspace-chat-message__avatar">AI</div>
            <div className="workspace-chat-message__bubble">正在分析...</div>
          </div>
        ) : null}
      </div>

      {activeAttachments.length ? (
        <div className="workspace-chat__attachments">
          {activeAttachments.map((attachment) => (
            <div key={attachment.id} className="workspace-chat-attachment">
              {attachment.previewUrl ? (
                <img src={attachment.previewUrl} alt={attachment.name} />
              ) : (
                <span className="workspace-chat-attachment__file">FILE</span>
              )}
              <span title={attachment.name}>{attachment.name}</span>
              <button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={`移除 ${attachment.name}`}>
                x
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="workspace-chat__composer">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,.txt,.md,.csv,.json"
          className="workspace-chat__file-input"
          onChange={addAttachments}
        />
        <button
          type="button"
          className="workspace-chat__icon-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || activeAttachments.length >= MAX_ATTACHMENTS}
          title="上传图片或文本文件"
          aria-label="上传图片或文本文件"
        >
          <AttachmentIcon />
        </button>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你要分析的问题。可以问：这个产品适合做哪些卖点图？参考图里哪些版式可以借鉴？"
          rows={3}
        />
        <button
          type="button"
          className="workspace-chat__send"
          onClick={sendMessage}
          disabled={!canSend}
          title="发送"
          aria-label="发送"
        >
          <SendIcon />
        </button>
      </div>

      {error ? <div className="workspace-chat__error">{error}</div> : null}
    </section>
  )
}
