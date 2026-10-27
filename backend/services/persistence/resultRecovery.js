import { readRequest, updateRequest, pendingRequests } from './requestJournal.js'
import { persistStrategyResult, persistGenerationResult } from './workbenchRepository.js'
import { isPersistenceEnabled } from './client.js'

const repairs = new Map()

export function attachStrategyPersistence(output, persistence) {
  if (!persistence) return {
    ...output,
    _meta: { ...output._meta, persistenceWarning: '策略已保存到恢复记录，正在等待数据库补存。请勿重复生成。' }
  }
  const plansByKey = new Map(persistence.imagePlans.map((plan) => [plan.taskKey, plan]))
  const { persistenceWarning, ...meta } = output._meta || {}
  return {
    ...output,
    imagePlans: output.imagePlans.map((plan) => ({
      ...plan,
      databasePlanId: plansByKey.get(plan.taskKey)?.imagePlanId,
      databasePlanVersionId: plansByKey.get(plan.taskKey)?.imagePlanVersionId
    })),
    _meta: { ...meta, persistence }
  }
}

export async function repairRecordedResult(entry) {
  const key = `${entry.kind}:${entry.requestId}`
  if (repairs.has(key)) return repairs.get(key)
  const repair = (async () => {
    const current = readRequest(entry.kind, entry.requestId, entry.actor)
    if (!current?.pendingPersistence) return current
    const persistence = current.kind === 'strategy'
      ? await persistStrategyResult(current.payload)
      : await persistGenerationResult(current.payload)
    if (!persistence) return current
    const result = current.kind === 'strategy'
      ? { ...current.result, data: attachStrategyPersistence(current.payload.output, persistence), persistenceWarning: undefined }
      : { ...current.result, persistence, persistenceWarning: undefined }
    return updateRequest(current, { pendingPersistence: false, result })
  })()
  repairs.set(key, repair)
  try {
    return await repair
  } finally {
    repairs.delete(key)
  }
}

export async function recordCompletedResult(entry, payload, result) {
  const completed = updateRequest(entry, {
    status: 'SUCCEEDED', payload: { ...payload, actor: entry.actor }, result,
    pendingPersistence: isPersistenceEnabled()
  })
  if (completed.pendingPersistence) {
    try {
      return await repairRecordedResult(completed)
    } catch (error) {
      console.error('[recovery] result recorded; repair deferred', { requestId: entry.requestId, message: error.message })
    }
  }
  return completed
}

let repairing = false
export async function repairPendingResults() {
  if (repairing) return
  repairing = true
  try {
    for (const entry of pendingRequests()) {
      try {
        await repairRecordedResult(entry)
      } catch (error) {
        console.error('[recovery] repair deferred', { requestId: entry.requestId, message: error.message })
      }
    }
  } finally {
    repairing = false
  }
}
