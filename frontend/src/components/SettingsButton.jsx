import './SettingsButton.css'

export default function SettingsButton({ onClick }) {
  return (
    <button className="settings-button" onClick={onClick}>
      ⚙️
      <span className="tooltip">设置</span>
    </button>
  )
}
