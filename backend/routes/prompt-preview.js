import express from 'express'
import { buildAmazonPrompt, translatePlanPromptIfNeeded } from './generate.js'
import { persistImagePlanVersion } from '../services/persistence/workbenchRepository.js'

const router = express.Router()

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

    if (req.auth && !persistedVersion) {
      return res.status(500).json({
        error: 'Persistence failed',
        message: '英文执行稿已生成，但策略版本保存失败。请检查数据库后重试。'
      })
    }

    res.json({
      success: true,
      data: {
        promptZh: normalizedPlan.originalPrompt || strategyContent,
        promptEn,
        executionPromptEn,
        persistence: persistedVersion
      }
    })
  } catch (error) {
    console.error('Prompt preview error:', error.response?.data || error.message)
    res.status(500).json({
      error: 'Prompt preview failed',
      message: error.message
    })
  }
})

export default router
