import express from 'express'
import { buildAmazonPrompt, translatePlanPromptIfNeeded } from './generate.js'

const router = express.Router()

router.post('/', async (req, res) => {
  try {
    const { listing, plan, resolution } = req.body || {}
    const strategyContent = String(plan?.strategyContent || plan?.strategyBody || plan?.prompt || '').trim()

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
    const promptEn = normalizedPlan.promptEn || normalizedPlan.prompt || ''
    const executionPromptEn = buildAmazonPrompt(
      listing,
      normalizedPlan,
      listing.complexity || 'L2',
      resolution || '2048x2048',
      listing.primaryReferenceImageUrl || ''
    )

    res.json({
      success: true,
      data: {
        promptZh: normalizedPlan.originalPrompt || strategyContent,
        promptEn,
        executionPromptEn
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
