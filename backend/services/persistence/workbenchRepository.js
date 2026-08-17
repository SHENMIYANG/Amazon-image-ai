import path from 'path'
import { getDatabaseClient, isPersistenceEnabled } from './client.js'

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

function localObjectKey(url = '') {
  return String(url || '').replace(/^\/?uploads\//, '').trim()
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

async function resolveWorkspace(db, organizationId, input = {}) {
  const workspaceId = String(input.workspaceId || '').trim()
  if (workspaceId) {
    const workspace = await db.productWorkspace.findFirst({
      where: { id: workspaceId, organizationId, deletedAt: null }
    })
    if (workspace) return workspace
  }

  const sourceSystem = String(input.sourceSystem || '').trim() || null
  const externalProductId = String(input.externalProductId || '').trim() || null
  const title = String(input.productName || '').trim() || null

  if (sourceSystem && externalProductId) {
    return await db.productWorkspace.upsert({
      where: {
        organizationId_sourceSystem_externalProductId: {
          organizationId,
          sourceSystem,
          externalProductId
        }
      },
      update: { title, status: 'ACTIVE', deletedAt: null },
      create: { organizationId, sourceSystem, externalProductId, title }
    })
  }

  return await db.productWorkspace.create({
    data: { organizationId, title }
  })
}

async function createInputVersion(db, workspaceId, input, productBlueprint = null) {
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
      productBlueprint: toJson(productBlueprint)
    }
  })
}

async function upsertReferenceAssets(db, { organizationId, workspaceId, inputVersionId, input }) {
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
    const objectKey = localObjectKey(url)
    if (!objectKey) continue

    const asset = await db.asset.upsert({
      where: { storageProvider_objectKey: { storageProvider: 'local', objectKey } },
      update: { publicUrl: url, workspaceId, organizationId },
      create: {
        organizationId,
        workspaceId,
        storageProvider: 'local',
        objectKey,
        publicUrl: url,
        mimeType: getMimeType(objectKey),
        role: 'PRODUCT_REFERENCE'
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

export async function persistStrategyResult({ input, output, requestId, model, durationMs }) {
  if (!isPersistenceEnabled()) return null

  try {
    const db = await getDatabaseClient()
    if (!db) return null

    return await db.$transaction(async (tx) => {
      const organization = await getDefaultOrganization(tx)
      const workspace = await resolveWorkspace(tx, organization.id, input)
      const inputVersion = await createInputVersion(tx, workspace.id, input, output.productBlueprint)
      const referenceAssetIds = await upsertReferenceAssets(tx, {
        organizationId: organization.id,
        workspaceId: workspace.id,
        inputVersionId: inputVersion.id,
        input
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
            ...mapPlanVersion(plan)
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

export async function persistImagePlanVersion({ workspaceId, imagePlanId, plan }) {
  if (!isPersistenceEnabled() || !workspaceId || !imagePlanId) return null

  try {
    const db = await getDatabaseClient()
    if (!db) return null

    return await db.$transaction(async (tx) => {
      const imagePlan = await tx.imagePlan.findFirst({
        where: {
          id: imagePlanId,
          strategyRun: { workspaceId }
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
          source: 'OPERATOR'
        }
      })

      return { imagePlanVersionId: version.id, version: version.version }
    })
  } catch (error) {
    console.error('[persistence] failed to save image plan version', { workspaceId, imagePlanId, message: error.message })
    return null
  }
}

export async function persistGenerationResult({ executionContext, images, model, requestId, durationMs }) {
  const persistence = executionContext?.persistence || {}
  const workspaceId = String(persistence.workspaceId || '').trim()
  const imagePlanId = String(persistence.imagePlanId || '').trim()
  const imagePlanVersionId = String(persistence.imagePlanVersionId || '').trim()

  if (!isPersistenceEnabled() || !workspaceId || !imagePlanId || !imagePlanVersionId) return null

  try {
    const db = await getDatabaseClient()
    if (!db) return null

    return await db.$transaction(async (tx) => {
      const workspace = await tx.productWorkspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, organizationId: true }
      })
      if (!workspace) return null

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
            : String((images || []).find((image) => image?.error)?.error || 'Image generation failed')
        }
      })

      for (const image of completedImages) {
        const objectKey = localObjectKey(image.imageUrl)
        const asset = objectKey
          ? await tx.asset.upsert({
              where: { storageProvider_objectKey: { storageProvider: 'local', objectKey } },
              update: { publicUrl: image.imageUrl, workspaceId, organizationId: workspace.organizationId },
              create: {
                organizationId: workspace.organizationId,
                workspaceId,
                storageProvider: 'local',
                objectKey,
                publicUrl: image.imageUrl,
                mimeType: 'image/png',
                width: image.actualWidth || image.width || null,
                height: image.actualHeight || image.height || null,
                role: 'GENERATED_IMAGE'
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
