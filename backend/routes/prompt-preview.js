import express from 'express'
import { buildAmazonPrompt, translatePlanPromptIfNeeded } from './generate.js'
import { persistImagePlanVersion } from '../services/persistence/workbenchRepository.js'

const router = express.Router()

export function buildPromptPreviewSuccessResponse({ promptZh, promptEn, executionPromptEn, persistence, persistenceRequired = false }) {
  const persistenceWarning = persistenceRequired && !persistence
    ? '英文执行稿已生成，但策略版本保存失败。当前执行稿仍可使用，生成记录可能不完整。'
    : ''

  return {
    success: true,
    data: { promptZh, promptEn, executionPromptEn, persistence },
    persistenceWarning: persistenceWarning || undefined
  }
}

router.post('/', async (req, res) => {
  try {
    const { listing, plan, resolution, persistence } = req.body || {}
    const strategyContent = String(plan?.strategyContent || '').trim()

    if (!listing || !strategyContent) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'listing and plan.strategyContent are required'
      })
    }

    const normalizedPlan = await translatePlanPromptIfNeeded(
      {
        ...plan,
        strategyContent
      },
      listing,
      resolution || '2048x2048'
    )
    const promptEn = normalizedPlan.promptEn || ''
    const executionPromptEn = buildAmazonPrompt(
      listing,
      normalizedPlan,
      listing.complexity || 'L2',
      resolution || '2048x2048',
      listing.primaryReferenceImageUrl || ''
    )
    const persistedVersion = await persistImagePlanVersion({
      workspaceId: persistence?.workspaceId,
      imagePlanId: persistence?.imagePlanId || plan?.databasePlanId,
      plan: normalizedPlan,
      actor: req.auth
    })

    res.json(buildPromptPreviewSuccessResponse({
      promptZh: normalizedPlan.originalPrompt || strategyContent,
      promptEn,
      executionPromptEn,
      persistence: persistedVersion,
      persistenceRequired: Boolean(req.auth)
    }))
  } catch (error) {
    console.error('Prompt preview error:', error.response?.data || error.message)
    res.status(500).json({
      error: 'Prompt preview failed',
      message: error.message
    })
  }
})

export default router
