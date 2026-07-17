import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const templatesDir = path.join(__dirname, '../config/visual-templates')

const templateFileMap = {
  main: 'main.json',
  feature: 'feature.json',
  scenario: 'scenario.json',
  detail: 'detail.json',
  dimensions: 'dimensions.json',
  summary: 'summary.json',
  steps: 'feature.json',
  comparison: 'feature.json',
  package: 'feature.json'
}

let cachedTemplates = null

function readTemplate(templateName) {
  const filePath = path.join(templatesDir, templateName)
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function loadTemplates() {
  if (cachedTemplates) return cachedTemplates

  cachedTemplates = Object.fromEntries(
    Object.entries(templateFileMap).map(([taskType, fileName]) => [taskType, readTemplate(fileName)])
  )

  return cachedTemplates
}

export function getVisualTemplate(taskType = 'feature') {
  const templates = loadTemplates()
  return templates[taskType] || templates.feature
}

export function normalizeVisualBlueprint(visualBlueprint = {}, taskType = 'feature') {
  const template = getVisualTemplate(taskType)
  const safeArea = visualBlueprint?.safeArea && typeof visualBlueprint.safeArea === 'object'
    ? visualBlueprint.safeArea
    : {}

  return {
    camera: String(visualBlueprint.camera || template.camera).trim(),
    composition: String(visualBlueprint.composition || template.composition).trim(),
    crop: String(visualBlueprint.crop || template.crop).trim(),
    lighting: String(visualBlueprint.lighting || template.lighting).trim(),
    background: String(visualBlueprint.background || template.background).trim(),
    text: String(visualBlueprint.text || template.text).trim(),
    safeArea: {
      top: String(safeArea.top || template.safeArea.top).trim(),
      bottom: String(safeArea.bottom || template.safeArea.bottom).trim(),
      left: String(safeArea.left || template.safeArea.left).trim(),
      right: String(safeArea.right || template.safeArea.right).trim()
    },
    typographyRules: Array.isArray(visualBlueprint.typographyRules) && visualBlueprint.typographyRules.length > 0
      ? visualBlueprint.typographyRules.map((item) => String(item || '').trim()).filter(Boolean)
      : template.typographyRules,
    negativeRules: Array.isArray(visualBlueprint.negativeRules) && visualBlueprint.negativeRules.length > 0
      ? visualBlueprint.negativeRules.map((item) => String(item || '').trim()).filter(Boolean)
      : template.negativeRules,
    style: String(visualBlueprint.style || template.style).trim()
  }
}
