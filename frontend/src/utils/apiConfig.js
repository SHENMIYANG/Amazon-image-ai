const STORAGE_KEY = 'amazon-image-gen-config'

const defaultConfig = {
  baseUrl: 'https://claudex.me/v1',
  endpoint: '/images/edits',  // 图生图接口
  apiKey: '',
  model: 'gpt-image-2',
  defaultSize: '2048x2048',
  defaultQuality: 'high'
}

export function loadConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      return { ...defaultConfig, ...JSON.parse(saved) }
    }
  } catch (error) {
    console.error('Failed to load config:', error)
  }
  return { ...defaultConfig }
}

export function saveConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    return true
  } catch (error) {
    console.error('Failed to save config:', error)
    return false
  }
}

export function removeConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    return true
  } catch (error) {
    console.error('Failed to remove config:', error)
    return false
  }
}

export function getApiKey() {
  const config = loadConfig()
  return config.apiKey
}

export function isConfigured() {
  const config = loadConfig()
  return !!config.apiKey && config.apiKey.startsWith('sk-')
}
