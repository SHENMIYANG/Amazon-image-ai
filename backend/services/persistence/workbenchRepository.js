import path from 'path'
import { getDatabaseClient, isPersistenceEnabled } from './client.js'
import { buildAssetUrl, getAssetReferenceFromUrl, getStorageProvider } from '../storage.js'

const DEFAULT_ORGANIZATION_SLUG = 'default'
const DEFAULT_ORGANIZATION_NAME = 'Default Organization'

function getDefaultOrganizationSlug() {
  return String(process.env.DATABASE_DEFAULT_ORGANIZATION_SLUG || DEFAULT_ORGANIZATION_SLUG)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || DEFAULT_ORGANIZATION_SLUG
}

function assetReference(url = '') {
  return getAssetReferenceFromUrl(url)
}

function assetUrl(asset) {
  return asset ? buildAssetUrl(asset.storageProvider, asset.objectKey) : ''
}

function toJson(value) {
  return value === undefined ? null : value
}

async function getDefaultOrganization(db) {
  const slug = getDefaultOrganizationSlug()
  return await db.organization.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      name: process.env.DATABASE_DEFAULT_ORGANIZATION_NAME || DEFAULT_ORGANIZATION_NAME
    }
  })
}

function canAccessAllWorkspaces(actor = null) {
  return actor?.role === 'ADMIN'
}

function workspaceAccessScope(organizationId, actor = null) {
  return {
    organizationId,
    deletedAt: null,
    ...(actor?.userId && !canAccessAllWorkspaces(actor) ? { createdById: actor.userId } : {})
  }
}

export async function createUploadedAsset({ storageProvider = getStorageProvider(), objectKey, mimeType = null, byteSize = null, role = 'PRODUCT_REFERENCE', actor = null }) {
  if (!isPersistenceEnabled() || !actor?.organizationId || !actor?.userId || !objectKey) return null

  const db = await getDatabaseClient()
  if (!db) return null

  const publicUrl = buildAssetUrl(storageProvider, objectKey)
  return await db.asset.upsert({
    where: { storageProvider_objectKey: { storageProvider, objectKey } },
    update: { publicUrl, mimeType, byteSize, role, organizationId: actor.organizationId, createdById: actor.userId },
    create: {
      organizationId: actor.organizationId,
      storageProvider,
      objectKey,
      publicUrl,
      mimeType,
      byteSize,
      role,
      createdById: actor.userId
    }
  })
}

export async function getAccessibleAsset({ storageProvider, objectKey, actor = null }) {
  if (!isPersistenceEnabled() || !actor?.organizationId || !objectKey) return null

  const db = await getDatabaseClient()
  if (!db) return null

  return await db.asset.findFirst({
    where: {
      organizationId: actor.organizationId,
      storageProvider,
      objectKey,
      ...(canAccessAllWorkspaces(actor)
        ? {}
        : {
            OR: [
              { createdById: actor.userId },
              { workspace: { createdById: actor.userId, deletedAt: null } }
            ]
          })
    }
  })
}

async function resolveWorkspace(db, organizationId, input = {}, actor = null) {
  const workspaceId = String(input.workspaceId || '').trim()
  if (workspaceId) {
    const workspace = await db.productWorkspace.findFirst({
      where: { id: workspaceId, ...workspaceAccessScope(organizationId, actor) }
    })
    if (workspace) return workspace
  }

  const sourceSystem = String(input.sourceSystem || '').trim() || null
  const externalProductId = String(input.externalProductId || '').trim() || null
  const title = String(input.productName || '').trim() || null

  if (sourceSystem && externalProductId) {
    const workspace = await db.productWorkspace.findFirst({
      where: {
        ...workspaceAccessScope(organizationId, actor),
        sourceSystem,
        externalProductId
      }
    })
    if (workspace) {
      return await db.productWorkspace.update({
        where: { id: workspace.id },
        data: { title, status: 'ACTIVE', deletedAt: null }
      })
    }
  }

  return await db.productWorkspace.create({
    data: {
      organizationId,
      sourceSystem,
      externalProductId,
      title,
      createdById: actor?.userId || null
    }
  })
}

async function createInputVersion(db, workspaceId, input, productBlueprint = null, createdById = null) {
  const previous = await db.productInputVersion.findFirst({
    where: { workspaceId },
    orderBy: { version: 'desc' },
    select: { version: true }
  })

  return await db.productInputVersion.create({
    data: {
      workspaceId,
      version: (previous?.version || 0) + 1,
      inputSnapshot: toJson(input),
      productBlueprint: toJson(productBlueprint),
      createdById
    }
  })
}

async function upsertReferenceAssets(db, { organizationId, workspaceId, inputVersionId, input, createdById = null }) {
  const urls = Array.isArray(input.referenceImages) ? input.referenceImages.filter(Boolean) : []
  const primaryUrl = String(input.primaryReferenceImageUrl || urls[0] || '')
  const roleByUrl = new Map(
    (Array.isArray(input.referenceImageRoles) ? input.referenceImageRoles : [])
      .filter((item) => item?.url)
      .map((item) => [item.url, item.role])
  )

  const roleMap = {
    primary_product: 'PRIMARY_PRODUCT',
    supporting_product: 'SUPPORTING_PRODUCT',
    layout_style_reference: 'LAYOUT_STYLE_REFERENCE',
    regeneration_reference: 'REGENERATION_REFERENCE'
  }

  const assetIds = []
  for (const [sortOrder, url] of urls.entries()) {
    const reference = assetReference(url)
    if (!reference) continue

    const asset = await db.asset.upsert({
      where: { storageProvider_objectKey: reference },
      update: { publicUrl: buildAssetUrl(reference.storageProvider, reference.objectKey), workspaceId, organizationId },
      create: {
        organizationId,
        workspaceId,
        storageProvider: reference.storageProvider,
        objectKey: reference.objectKey,
        publicUrl: buildAssetUrl(reference.storageProvider, reference.objectKey),
        mimeType: getMimeType(reference.objectKey),
        role: 'PRODUCT_REFERENCE',
        createdById
      }
    })

    const role = url === primaryUrl
      ? 'PRIMARY_PRODUCT'
      : roleMap[roleByUrl.get(url)] || 'SUPPORTING_PRODUCT'

    await db.workspaceReference.create({
      data: {
        workspaceId,
        inputVersionId,
        assetId: asset.id,
        role,
        sortOrder,
        isPrimary: role === 'PRIMARY_PRODUCT'
      }
    })
    assetIds.push(asset.id)
  }

  return assetIds
}

function getMimeType(objectKey = '') {
  const extension = path.extname(objectKey).toLowerCase()
  if (extension === '.png') return 'image/png'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.gif') return 'image/gif'
  return 'image/jpeg'
}

function mapPlanVersion(plan = {}) {
  return {
    imageRole: String(plan.imageRole || ''),
    sellingFocus: String(plan.sellingFocus || plan.primarySellingPoint || ''),
    strategyContent: String(plan.strategyContent || ''),
    promptEn: String(plan.promptEn || ''),
    copy: toJson(Array.isArray(plan.copy) ? plan.copy : []),
    executionRules: toJson(Array.isArray(plan.executionRules) ? plan.executionRules : []),
    usage: toJson(plan.currentImageProductUsage || null),
    source: 'AI'
  }
}

export async function persistStrategyResult({ input, output, requestId, model, durationMs, actor = null }) {
  if (!isPersistenceEnabled()) return null

  try {
    const db = await getDatabaseClient()
    if (!db) return null

    return await db.$transaction(async (tx) => {
      const organization = actor?.organizationId
        ? await tx.organization.findUnique({ where: { id: actor.organizationId } })
        : await getDefaultOrganization(tx)
      if (!organization) return null
      const workspace = await resolveWorkspace(tx, organization.id, input, actor)
      const inputVersion = await createInputVersion(tx, workspace.id, input, output.productBlueprint, actor?.userId || null)
      const referenceAssetIds = await upsertReferenceAssets(tx, {
        organizationId: organization.id,
        workspaceId: workspace.id,
        inputVersionId: inputVersion.id,
        input,
        createdById: actor?.userId || null
      })

      const strategyRun = await tx.strategyRun.create({
        data: {
          workspaceId: workspace.id,
          inputVersionId: inputVersion.id,
          status: 'SUCCEEDED',
          model: model || null,
          requestId,
          productBlueprint: toJson(output.productBlueprint),
          rawResponse: toJson({ imagePlans: output.imagePlans }),
          startedAt: new Date(Date.now() - Math.max(0, Number(durationMs || 0))),
          completedAt: new Date()
        }
      })

      const persistedPlans = []
      for (const [sortOrder, plan] of (output.imagePlans || []).entries()) {
        const imagePlan = await tx.imagePlan.create({
          data: {
            strategyRunId: strategyRun.id,
            taskKey: String(plan.taskKey || `${plan.taskType || plan.type || 'image'}-${sortOrder + 1}`),
            taskType: String(plan.taskType || plan.type || 'feature'),
            name: String(plan.name || `Image ${sortOrder + 1}`),
            sortOrder
          }
        })
        const version = await tx.imagePlanVersion.create({
          data: {
            imagePlanId: imagePlan.id,
            version: 1,
            ...mapPlanVersion(plan),
            createdById: actor?.userId || null
          }
        })
        persistedPlans.push({ taskKey: plan.taskKey, imagePlanId: imagePlan.id, imagePlanVersionId: version.id })
      }

      await tx.modelRequest.create({
        data: {
          organizationId: organization.id,
          workspaceId: workspace.id,
          strategyRunId: strategyRun.id,
          type: 'STRATEGY',
          actorId: actor?.userId || null,
          model: model || null,
          requestId,
          status: 'SUCCEEDED',
          durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : null,
          requestSnapshot: toJson(input),
          responseSnapshot: toJson({ productBlueprint: output.productBlueprint, imagePlanCount: output.imagePlans?.length || 0 })
        }
      })

      await tx.auditEvent.create({
        data: {
          organizationId: organization.id,
          workspaceId: workspace.id,
          action: 'strategy.generated',
          actorId: actor?.userId || null,
          entityType: 'strategy_run',
          entityId: strategyRun.id,
          metadata: { inputVersionId: inputVersion.id, referenceAssetIds, imagePlanCount: persistedPlans.length }
        }
      })

      return {
        workspaceId: workspace.id,
        inputVersionId: inputVersion.id,
        strategyRunId: strategyRun.id,
        referenceAssetIds,
        imagePlans: persistedPlans
      }
    })
  } catch (error) {
    console.error('[persistence] failed to save strategy result', { requestId, message: error.message })
    return null
  }
}

export async function persistImagePlanVersion({ workspaceId, imagePlanId, plan, actor = null }) {
  if (!isPersistenceEnabled() || !workspaceId || !imagePlanId) return null

  try {
    const db = await getDatabaseClient()
    if (!db) return null

    return await db.$transaction(async (tx) => {
      const imagePlan = await tx.imagePlan.findFirst({
        where: {
          id: imagePlanId,
          strategyRun: {
            workspaceId,
            workspace: actor?.organizationId
              ? workspaceAccessScope(actor.organizationId, actor)
              : undefined
          }
        },
        select: { id: true }
      })
      if (!imagePlan) return null

      const previous = await tx.imagePlanVersion.findFirst({
        where: { imagePlanId },
        orderBy: { version: 'desc' },
        select: { version: true }
      })
      const version = await tx.imagePlanVersion.create({
        data: {
          imagePlanId,
          version: (previous?.version || 0) + 1,
          ...mapPlanVersion(plan),
          source: 'OPERATOR',
          createdById: actor?.userId || null
        }
      })

      return { imagePlanVersionId: version.id, version: version.version }
    })
  } catch (error) {
    console.error('[persistence] failed to save image plan version', { workspaceId, imagePlanId, message: error.message })
    return null
  }
}

async function getFeedbackContext(db, { workspaceId, imagePlanId, actor = null }) {
  const workspace = await db.productWorkspace.findFirst({
    where: { id: workspaceId, ...workspaceAccessScope(actor?.organizationId, actor) },
    select: { id: true, organizationId: true }
  })
  if (!workspace) {
    const error = new Error('当前账号不能访问该工作区。')
    error.statusCode = 404
    throw error
  }

  const imagePlan = await db.imagePlan.findFirst({
    where: { id: imagePlanId, strategyRun: { workspaceId } },
    include: {
      strategyRun: { select: { productBlueprint: true } },
      versions: { orderBy: { version: 'desc' }, take: 1 },
      generationRuns: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { generatedImages: { orderBy: { createdAt: 'desc' }, take: 1, include: { asset: true } } }
      }
    }
  })
  if (!imagePlan) {
    const error = new Error('图片计划不存在或不属于当前工作区。')
    error.statusCode = 404
    throw error
  }

  let thread = await db.feedbackThread.findFirst({
    where: { workspaceId, imagePlanId },
    orderBy: { updatedAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { planVersion: true, attachments: { include: { asset: true } } }
      }
    }
  })
  if (!thread) {
    thread = await db.feedbackThread.create({
      data: { workspaceId, imagePlanId, generatedImageId: imagePlan.generationRuns[0]?.generatedImages[0]?.id || null },
      include: {
        messages: { include: { planVersion: true, attachments: { include: { asset: true } } } }
      }
    })
  }

  return { workspace, imagePlan, thread }
}

function serializeFeedbackThread({ imagePlan, thread }) {
  const fallbackVersion = imagePlan.versions[0] || {}
  const latestRevision = [...thread.messages]
    .reverse()
    .find((message) => message.planVersion)?.planVersion || fallbackVersion
  const latestGeneratedImage = imagePlan.generationRuns[0]?.generatedImages[0] || null

  return {
    threadId: thread.id,
    imagePlan: {
      id: imagePlan.id,
      name: imagePlan.name,
      taskType: imagePlan.taskType,
      imageRole: latestRevision.imageRole || '',
      sellingFocus: latestRevision.sellingFocus || '',
      strategyContent: latestRevision.strategyContent || '',
      promptEn: latestRevision.promptEn || '',
      executionRules: latestRevision.executionRules || [],
      databasePlanId: imagePlan.id,
      databasePlanVersionId: latestRevision.id || null
    },
    productBlueprint: imagePlan.strategyRun.productBlueprint || {},
    generatedImage: latestGeneratedImage
      ? {
          id: latestGeneratedImage.id,
          imageUrl: latestGeneratedImage.asset
            ? assetUrl(latestGeneratedImage.asset)
            : latestGeneratedImage.imageUrlSnapshot || ''
        }
      : null,
    messages: thread.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      intent: message.intent || undefined,
      createdAt: message.createdAt,
      attachments: message.attachments.map((attachment) => ({
        url: assetUrl(attachment.asset),
        filename: attachment.asset?.objectKey?.split('/').pop() || '',
        mimetype: attachment.asset?.mimeType || ''
      })).filter((attachment) => attachment.url)
    })),
    revision: {
      strategyContent: latestRevision.strategyContent || '',
      promptEn: latestRevision.promptEn || '',
      executionRules: latestRevision.executionRules || [],
      databasePlanId: imagePlan.id,
      databasePlanVersionId: latestRevision.id || null
    }
  }
}

export async function loadImageFeedbackThread({ workspaceId, imagePlanId, actor = null }) {
  if (!isPersistenceEnabled()) {
    const error = new Error('图片反馈记录需要 PostgreSQL。')
    error.statusCode = 503
    throw error
  }

  const db = await getDatabaseClient()
  if (!db) throw new Error('图片反馈记录不可用。')
  return serializeFeedbackThread(await getFeedbackContext(db, { workspaceId, imagePlanId, actor }))
}

export async function persistImageFeedbackExchange({ workspaceId, imagePlanId, userMessage, attachmentUrls = [], assistantContent, intent, revision, model, actor = null }) {
  if (!isPersistenceEnabled()) {
    const error = new Error('图片反馈记录需要 PostgreSQL。')
    error.statusCode = 503
    throw error
  }

  const db = await getDatabaseClient()
  if (!db) throw new Error('图片反馈记录不可用。')

  return await db.$transaction(async (tx) => {
    const context = await getFeedbackContext(tx, { workspaceId, imagePlanId, actor })
    const references = [...new Map(attachmentUrls.map(assetReference).filter(Boolean).map((item) => [`${item.storageProvider}:${item.objectKey}`, item])).values()]
    const attachments = await Promise.all(references.map(async (reference) => await tx.asset.findFirst({
      where: {
        organizationId: context.workspace.organizationId,
        ...reference,
        ...(canAccessAllWorkspaces(actor)
          ? {}
          : { OR: [{ createdById: actor?.userId }, { workspace: { createdById: actor?.userId, deletedAt: null } }] })
      }
    })))
    if (attachments.some((asset) => !asset)) {
      const error = new Error('反馈参考图不存在或当前账号无权使用。')
      error.statusCode = 403
      throw error
    }

    const userRecord = await tx.feedbackMessage.create({
      data: {
        threadId: context.thread.id,
        role: 'user',
        content: userMessage,
        createdById: actor?.userId || null,
        attachments: {
          create: attachments.map((asset) => ({ assetId: asset.id }))
        }
      }
    })

    const currentVersion = context.imagePlan.versions[0]
    const nextVersion = await tx.imagePlanVersion.create({
      data: {
        imagePlanId,
        version: (currentVersion?.version || 0) + 1,
        imageRole: currentVersion?.imageRole || null,
        sellingFocus: currentVersion?.sellingFocus || null,
        strategyContent: revision.strategyContent || currentVersion?.strategyContent || '',
        promptEn: revision.promptEn || currentVersion?.promptEn || '',
        copy: currentVersion?.copy || null,
        executionRules: toJson(revision.executionRules || currentVersion?.executionRules || []),
        usage: currentVersion?.usage || null,
        source: 'FEEDBACK',
        createdById: actor?.userId || null
      }
    })

    await tx.feedbackMessage.create({
      data: {
        threadId: context.thread.id,
        role: 'assistant',
        content: assistantContent,
        intent,
        planVersionId: nextVersion.id,
        createdById: actor?.userId || null
      }
    })
    await tx.auditEvent.create({
      data: {
        organizationId: context.workspace.organizationId,
        workspaceId,
        actorId: actor?.userId || null,
        action: 'image.feedback',
        entityType: 'feedback_thread',
        entityId: context.thread.id,
        metadata: { imagePlanId, userMessageId: userRecord.id, intent }
      }
    })

    return serializeFeedbackThread(await getFeedbackContext(tx, { workspaceId, imagePlanId, actor }))
  })
}

export async function persistGenerationResult({ executionContext, images, model, requestId, durationMs, actor = null }) {
  const persistence = executionContext?.persistence || {}
  const workspaceId = String(persistence.workspaceId || '').trim()
  const imagePlanId = String(persistence.imagePlanId || '').trim()
  const imagePlanVersionId = String(persistence.imagePlanVersionId || '').trim()

  if (!isPersistenceEnabled() || !workspaceId || !imagePlanId || !imagePlanVersionId) return null

  try {
    const db = await getDatabaseClient()
    if (!db) return null

    return await db.$transaction(async (tx) => {
      const workspace = await tx.productWorkspace.findFirst({
        where: actor?.organizationId
          ? { id: workspaceId, ...workspaceAccessScope(actor.organizationId, actor) }
          : { id: workspaceId, deletedAt: null },
        select: { id: true, organizationId: true }
      })
      if (!workspace) return null

      const imagePlan = await tx.imagePlan.findFirst({
        where: { id: imagePlanId, strategyRun: { workspaceId } },
        select: { id: true }
      })
      if (!imagePlan) return null

      const imagePlanVersion = await tx.imagePlanVersion.findFirst({
        where: { id: imagePlanVersionId, imagePlanId },
        select: { id: true }
      })
      if (!imagePlanVersion) return null

      const completedImages = (Array.isArray(images) ? images : []).filter((image) => image?.status === 'completed')
      const generationRun = await tx.generationRun.create({
        data: {
          workspaceId,
          imagePlanId,
          imagePlanVersionId,
          status: completedImages.length > 0 ? 'SUCCEEDED' : 'FAILED',
          model: model || null,
          resolution: executionContext?.output?.resolution || null,
          complexity: executionContext?.output?.complexity || null,
          promptEnSnapshot: String(executionContext?.strategy?.promptEn || ''),
          executionSnapshot: toJson(executionContext),
          referenceAssetIds: toJson(persistence.referenceAssetIds || []),
          requestId,
          startedAt: new Date(Date.now() - Math.max(0, Number(durationMs || 0))),
          completedAt: new Date(),
          errorMessage: completedImages.length > 0
            ? null
            : String((images || []).find((image) => image?.error)?.error || 'Image generation failed'),
          createdById: actor?.userId || null
        }
      })

      for (const image of completedImages) {
        const reference = assetReference(image.imageUrl)
        const asset = reference
          ? await tx.asset.upsert({
              where: { storageProvider_objectKey: reference },
              update: { publicUrl: buildAssetUrl(reference.storageProvider, reference.objectKey), workspaceId, organizationId: workspace.organizationId },
              create: {
                organizationId: workspace.organizationId,
                workspaceId,
                storageProvider: reference.storageProvider,
                objectKey: reference.objectKey,
                publicUrl: buildAssetUrl(reference.storageProvider, reference.objectKey),
                mimeType: 'image/png',
                width: image.actualWidth || image.width || null,
                height: image.actualHeight || image.height || null,
                role: 'GENERATED_IMAGE',
                createdById: actor?.userId || null
              }
            })
          : null

        await tx.generatedImage.create({
          data: {
            generationRunId: generationRun.id,
            assetId: asset?.id || null,
            imageUrlSnapshot: image.imageUrl || null,
            width: image.actualWidth || image.width || null,
            height: image.actualHeight || image.height || null,
            requestResolution: image.resolution || executionContext?.output?.resolution || null,
            actualResolution: image.actualResolution || null
          }
        })
      }

      await tx.modelRequest.create({
        data: {
          organizationId: workspace.organizationId,
          workspaceId,
          generationRunId: generationRun.id,
          type: 'IMAGE_GENERATION',
          actorId: actor?.userId || null,
          model: model || null,
          requestId,
          status: generationRun.status,
          imageCount: completedImages.length,
          durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : null,
          errorMessage: generationRun.errorMessage,
          requestSnapshot: toJson(executionContext),
          responseSnapshot: toJson(images)
        }
      })

      await tx.auditEvent.create({
        data: {
          organizationId: workspace.organizationId,
          workspaceId,
          action: 'image.generated',
          actorId: actor?.userId || null,
          entityType: 'generation_run',
          entityId: generationRun.id,
          metadata: { imagePlanId, imagePlanVersionId, imageCount: completedImages.length }
        }
      })

      return { generationRunId: generationRun.id }
    })
  } catch (error) {
    console.error('[persistence] failed to save generation result', { workspaceId, imagePlanId, message: error.message })
    return null
  }
}
