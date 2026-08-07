import './WorkspaceChatButton.css'

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  )
}

export default function WorkspaceChatButton({ onClick }) {
  return (
    <button type="button" className="workspace-chat-button" onClick={onClick}>
      <ChatIcon />
      <span>产品分析 Chat</span>
    </button>
  )
}
