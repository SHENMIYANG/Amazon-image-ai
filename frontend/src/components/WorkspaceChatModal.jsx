import { useState } from 'react'
import WorkspaceChat, { createInitialWorkspaceChatMessages } from './WorkspaceChat'
import './WorkspaceChatModal.css'

export default function WorkspaceChatModal({ isOpen, onClose }) {
  const [messages, setMessages] = useState(createInitialWorkspaceChatMessages)
  const [attachments, setAttachments] = useState([])

  if (!isOpen) return null

  return (
    <div className="workspace-chat-modal-overlay">
      <div className="workspace-chat-modal" onClick={(event) => event.stopPropagation()}>
        <div className="workspace-chat-modal__header">
          <div>
            <h2>产品分析 Chat</h2>
            <p>像普通聊天一样分析产品、卖点、受众、参考图和图片表达方向。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭产品分析 Chat">
            x
          </button>
        </div>
        <div className="workspace-chat-modal__body">
          <WorkspaceChat
            showHeader={false}
            messages={messages}
            onMessagesChange={setMessages}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
          />
        </div>
      </div>
    </div>
  )
}
