import { expect, test } from '@playwright/test'

const user = {
  id: 'user-admin',
  loginName: 'admin',
  displayName: '管理员',
  role: 'ADMIN',
  organizationId: 'organization-1'
}

const records = [{
  id: 'workspace-1',
  title: '粉色礼品套装',
  lastActivityAt: '2026-08-18T06:00:00.000Z',
  owner: { id: user.id, loginName: user.loginName, displayName: user.displayName },
  latestInput: { id: 'input-1', version: 1, productName: '粉色礼品套装' },
  latestStrategy: { id: 'strategy-1', status: 'SUCCEEDED', imagePlanCount: 2 },
  latestGeneration: { id: 'generation-1', status: 'SUCCEEDED', imageCount: 1 },
  counts: { strategyRuns: 1, generationRuns: 1, inputVersions: 1, feedbackThreads: 0 }
}]

const recordDetail = {
  id: 'workspace-1',
  title: '粉色礼品套装',
  updatedAt: '2026-08-18T06:00:00.000Z',
  owner: records[0].owner,
  inputVersions: [{
    id: 'input-1',
    version: 1,
    inputSnapshot: { productName: '粉色礼品套装', category: '礼品' },
    references: []
  }],
  strategyRuns: [],
  generationRuns: [],
  feedbackThreads: []
}

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockApi(context) {
  await context.route('**/api/auth/me', (route) => json(route, { success: true, user }))
  await context.route('**/api/members', (route) => json(route, { success: true, members: [] }))
  await context.route('**/api/activity**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/activity/workspace-1') return json(route, { success: true, record: recordDetail })
    return json(route, { success: true, canReadAll: true, records })
  })
}

test('使用记录在当前列表中打开详情抽屉', async ({ page, context }) => {
  await mockApi(context)
  await page.goto('/activity')

  await expect(page.getByRole('columnheader', { name: '产品名称' })).toBeVisible()
  await expect(page.getByText('粉色礼品套装').first()).toBeVisible()
  const initialUrl = page.url()

  await page.getByRole('button', { name: '查看详情' }).click()

  await expect(page.getByRole('dialog', { name: '产品使用记录详情' })).toBeVisible()
  await expect(page.getByRole('dialog').getByText('产品资料')).toBeVisible()
  expect(page.url()).toBe(initialUrl)

  await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('策略生成期间锁定成员入口，但可在新页签打开使用记录', async ({ page, context }) => {
  await mockApi(context)

  let releaseUpload
  const uploadHeld = new Promise((resolve) => { releaseUpload = resolve })
  await context.route('**/api/upload', async (route) => {
    await uploadHeld
    await json(route, { success: true, images: [{ url: '/api/assets/local/temp/test-product.png' }] })
  })

  await page.goto('/')
  await page.locator('textarea').first().fill('粉色礼品套装，适合儿童使用。')
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'product.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="384" height="384"><rect width="384" height="384" fill="#f8b4c8"/></svg>')
  })
  await expect(page.getByText(/已上传 1/)).toBeVisible()

  await page.getByRole('button', { name: '一键生成出图方案' }).click()
  await expect(page.getByText('正在生成出图策略')).toBeVisible()
  await expect(page.getByRole('button', { name: '成员与权限' })).toBeDisabled()

  const activityPagePromise = context.waitForEvent('page')
  await page.getByRole('link', { name: '在新页面打开使用记录' }).click()
  const activityPage = await activityPagePromise
  await activityPage.waitForLoadState()
  await expect(activityPage).toHaveURL(/\/activity$/)

  releaseUpload()
})
