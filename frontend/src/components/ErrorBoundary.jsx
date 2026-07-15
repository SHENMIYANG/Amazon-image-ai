import React from 'react'
import './ErrorBoundary.css'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null
    }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error('页面渲染异常:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="error-boundary-page">
        <div className="error-boundary-panel">
          <h1>页面出了点问题</h1>
          <p>当前页面渲染失败，可以先刷新页面重试。如果连续出现，请把当前操作步骤发给管理员排查。</p>
          {this.state.error?.message && (
            <pre>{this.state.error.message}</pre>
          )}
          <button type="button" onClick={this.handleReload}>
            刷新页面
          </button>
        </div>
      </div>
    )
  }
}
