import { useState } from 'react'
import './LoginPage.css'

export default function LoginPage({ onLogin, error: initialError = '' }) {
  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(initialError)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await onLogin({ loginName, password })
    } catch (loginError) {
      setError(loginError.message || '登录失败，请稍后重试。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="login-mark" aria-hidden="true">AI</span>
          <div>
            <h1>Amazon Image Studio</h1>
            <p>工作台登录</p>
          </div>
        </div>
        <label>
          账号或邮箱
          <input
            value={loginName}
            onChange={(event) => setLoginName(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          密码
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="login-submit" type="submit" disabled={submitting}>
          {submitting ? '登录中...' : '登录'}
        </button>
      </form>
    </main>
  )
}
