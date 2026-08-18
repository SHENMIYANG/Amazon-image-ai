import express from 'express'
import { getDatabaseClient } from '../services/persistence/client.js'
import { hasPermission } from '../services/auth/permissions.js'
import { isAuthEnabled } from '../services/auth/session.js'
import { buildAssetUrl } from '../services/storage.js'

const router = express.Router()

function unavailable(res) {
  return res.status(503).json({ success: false, message: '使用记录需要先配置并迁移 PostgreSQL。' })
}

function canReadAll(auth) {
  return hasPermission(auth?.role, 'activity:read_all')
}

function getWorkspaceScope(auth, memberId = '') {
  const requestedMemberId = String(memberId || '').trim()
  if (requestedMemberId && !canReadAll(auth)) {
    const error = new Error('当前账号不能查看其他成员的记录。')
    error.statusCode = 403
    throw error
  }

  return {
    organizationId: auth.organizationId,
    deletedAt: null,
    ...(canReadAll(auth)
      ? (requestedMemberId ? { createdById: requestedMemberId } : {})
      : { createdById: auth.userId })
  }
}

function parseDate(value, endOfDay = false) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return null
  if (endOfDay) date.setHours(23, 59, 59, 999)
  return date
}

function assetUrl(asset) {
  if (!asset) return null
  return buildAssetUrl(asset.storageProvider, asset.objectKey) || asset.publicUrl
}

function serializeWorkspaceSummary(workspace) {
  const latestInput = workspace.inputVersions?.[0] || null
  const latestStrategy = workspace.strategyRuns?.[0] || null
  const latestGeneration = workspace.generationRuns?.[0] || null
  const lastActivityAt = [workspace.updatedAt, latestStrategy?.completedAt, latestGeneration?.completedAt]
    .filter(Boolean)
    .map((value) => new Date(value))
    .sort((left, right) => right - left)[0] || workspace.updatedAt

  return {
    id: workspace.id,
    title: workspace.title || latestInput?.inputSnapshot?.productName || '未命名产品',
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    lastActivityAt,
    owner: workspace.createdBy
      ? { id: workspace.createdBy.id, loginName: workspace.createdBy.loginName, displayName: workspace.createdBy.displayName }
      : null,
    latestInput: latestInput
      ? { id: latestInput.id, version: latestInput.version, createdAt: latestInput.createdAt, productName: latestInput.inputSnapshot?.productName || '' }
      : null,
    latestStrategy: latestStrategy
      ? { id: latestStrategy.id, status: latestStrategy.status, model: latestStrategy.model, completedAt: latestStrategy.completedAt, imagePlanCount: latestStrategy._count?.imagePlans || 0 }
      : null,
    latestGeneration: latestGeneration
      ? {
          id: latestGeneration.id,
          status: latestGeneration.status,
          model: latestGeneration.model,
          resolution: latestGeneration.resolution,
          completedAt: latestGeneration.completedAt,
          imageCount: latestGeneration._count?.generatedImages || 0
        }
      : null,
    counts: workspace._count
  }
}

function serializeDetail(workspace) {
  return {
    id: workspace.id,
    title: workspace.title || '未命名产品',
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    owner: workspace.createdBy
      ? { id: workspace.createdBy.id, loginName: workspace.createdBy.loginName, displayName: workspace.createdBy.displayName }
      : null,
    inputVersions: workspace.inputVersions.map((input) => ({
      id: input.id,
      version: input.version,
      createdAt: input.createdAt,
      inputSnapshot: input.inputSnapshot,
      productBlueprint: input.productBlueprint,
      references: input.references.map((reference) => ({
        role: reference.role,
        isPrimary: reference.isPrimary,
        sortOrder: reference.sortOrder,
        asset: reference.asset
          ? { publicUrl: assetUrl(reference.asset), mimeType: reference.asset.mimeType, width: reference.asset.width, height: reference.asset.height }
          : null
      }))
    })),
    strategyRuns: workspace.strategyRuns.map((run) => ({
      id: run.id,
      status: run.status,
      model: run.model,
      requestId: run.requestId,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
      imagePlans: run.imagePlans.map((plan) => ({
        id: plan.id,
        taskKey: plan.taskKey,
        taskType: plan.taskType,
        name: plan.name,
        sortOrder: plan.sortOrder,
        versions: plan.versions.map((version) => ({
          id: version.id,
          version: version.version,
          source: version.source,
          imageRole: version.imageRole,
          sellingFocus: version.sellingFocus,
          strategyContent: version.strategyContent,
          promptEn: version.promptEn,
          copy: version.copy,
          executionRules: version.executionRules,
          usage: version.usage,
          createdAt: version.createdAt
        }))
      }))
    })),
    generationRuns: workspace.generationRuns.map((run) => ({
      id: run.id,
      status: run.status,
      model: run.model,
      resolution: run.resolution,
      complexity: run.complexity,
      promptEnSnapshot: run.promptEnSnapshot,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
      imagePlan: run.imagePlan ? { id: run.imagePlan.id, name: run.imagePlan.name, taskType: run.imagePlan.taskType } : null,
      generatedImages: run.generatedImages.map((image) => ({
        id: image.id,
        imageUrl: assetUrl(image.asset) || image.imageUrlSnapshot,
        width: image.width,
        height: image.height,
        actualResolution: image.actualResolution,
        createdAt: image.createdAt
      })),
      modelRequests: run.modelRequests.map((request) => ({
        id: request.id,
        status: request.status,
        inputTokens: request.inputTokens,
        outputTokens: request.outputTokens,
        costUsd: request.costUsd,
        durationMs: request.durationMs,
        errorCode: request.errorCode,
        errorMessage: request.errorMessage,
        createdAt: request.createdAt
      }))
    })),
    feedbackThreads: workspace.feedbackThreads.map((thread) => ({
      id: thread.id,
      imagePlanId: thread.imagePlanId,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      messageCount: thread._count?.messages || 0
    }))
  }
}

router.get('/', async (req, res, next) => {
  if (!isAuthEnabled()) return unavailable(res)
  try {
    const db = await getDatabaseClient()
    const query = String(req.query?.q || '').trim()
    const stage = String(req.query?.stage || '').trim()
    const from = parseDate(req.query?.from)
    const to = parseDate(req.query?.to, true)
    const where = {
      ...getWorkspaceScope(req.auth, req.query?.memberId),
      ...(query ? { title: { contains: query, mode: 'insensitive' } } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {})
    }

    if (stage === 'strategy') where.strategyRuns = { some: {} }
    if (stage === 'generated') where.generationRuns = { some: { status: 'SUCCEEDED' } }
    if (stage === 'failed') where.generationRuns = { some: { status: 'FAILED' } }

    const workspaces = await db.productWorkspace.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        createdBy: { select: { id: true, loginName: true, displayName: true } },
        inputVersions: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, version: true, createdAt: true, inputSnapshot: true } },
        strategyRuns: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, model: true, completedAt: true, _count: { select: { imagePlans: true } } }
        },
        generationRuns: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, model: true, resolution: true, completedAt: true, _count: { select: { generatedImages: true } } }
        },
        _count: { select: { inputVersions: true, strategyRuns: true, generationRuns: true, feedbackThreads: true } }
      }
    })

    res.json({ success: true, canReadAll: canReadAll(req.auth), records: workspaces.map(serializeWorkspaceSummary) })
  } catch (error) {
    next(error)
  }
})

router.get('/:workspaceId', async (req, res, next) => {
  if (!isAuthEnabled()) return unavailable(res)
  try {
    const db = await getDatabaseClient()
    const workspace = await db.productWorkspace.findFirst({
      where: { id: req.params.workspaceId, ...getWorkspaceScope(req.auth) },
      include: {
        createdBy: { select: { id: true, loginName: true, displayName: true } },
        inputVersions: {
          orderBy: { version: 'desc' },
          include: {
            references: {
              orderBy: { sortOrder: 'asc' },
              include: { asset: { select: { publicUrl: true, mimeType: true, width: true, height: true } } }
            }
          }
        },
        strategyRuns: {
          orderBy: { createdAt: 'desc' },
          include: { imagePlans: { orderBy: { sortOrder: 'asc' }, include: { versions: { orderBy: { version: 'desc' } } } } }
        },
        generationRuns: {
          orderBy: { createdAt: 'desc' },
          include: {
            imagePlan: { select: { id: true, name: true, taskType: true } },
            generatedImages: { include: { asset: { select: { publicUrl: true } } } },
            modelRequests: { orderBy: { createdAt: 'desc' } }
          }
        },
        feedbackThreads: { include: { _count: { select: { messages: true } } }, orderBy: { updatedAt: 'desc' } }
      }
    })
    if (!workspace) return res.status(404).json({ success: false, message: '没有找到该产品记录，或你没有查看权限。' })

    res.json({ success: true, record: serializeDetail(workspace) })
  } catch (error) {
    next(error)
  }
})

export default router
