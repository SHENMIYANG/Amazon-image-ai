import express from 'express'
import { buildAmazonPrompt, translatePlanPromptIfNeeded } from './generate.js'

const router = express.Router()

router.post('/', async (req, res) => {
  try {
    const { listing, plan, resolution } = req.body || {}

    if (!listing || !plan?.prompt) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'listing and plan.prompt are required'
      })
    }

    const normalizedPlan = await translatePlanPromptIfNeeded(plan, listing, resolution || '2048x2048')
    const promptEn = normalizedPlan.prompt || ''
    const executionPromptEn = buildAmazonPrompt(
      listing,
      normalizedPlan,
      listing._meta?.strategyUsed || listing.imageType || 'basic',
      listing.complexity || 'L2',
      resolution || '2048x2048'
    )

    res.json({
      success: true,
      data: {
        promptZh: normalizedPlan.originalPrompt || plan.prompt || '',
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
