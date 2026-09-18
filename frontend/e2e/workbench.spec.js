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

test('策略生成期间可切换页面且请求继续完成', async ({ page, context }) => {
  await mockApi(context)

  let releaseUpload
  const uploadHeld = new Promise((resolve) => { releaseUpload = resolve })
  let finishAnalysis
  const analysisFinished = new Promise((resolve) => { finishAnalysis = resolve })
  await context.route('**/api/upload', async (route) => {
    await uploadHeld
    await json(route, { success: true, images: [{ url: '/api/assets/local/temp/test-product.png' }] })
  })
  await context.route('**/api/assets/local/temp/test-product.png?probe=*', (route) => route.fulfill({ status: 200 }))
  await context.route('**/api/agent-analyze', async (route) => {
    await json(route, {
      success: true,
      data: {
        productBlueprint: {},
        imagePlans: [{
          id: 1,
          taskKey: 'main-1',
          taskType: 'main',
          name: 'Main Image',
          strategyContent: '中文主图策略。',
          promptEn: 'English main image prompt.'
        }]
      }
    })
    finishAnalysis()
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
  await expect(page.getByRole('button', { name: '成员与权限' })).toBeEnabled()
  await page.getByRole('button', { name: '成员与权限' }).click()
  await expect(page).toHaveURL(/\/members$/)

  releaseUpload()
  await analysisFinished
})

test('卖点模板按确认结果锁定卖点图数量', async ({ page, context }) => {
  await mockApi(context)
  const publicTemplates = [{
    id: 'template-public-1',
    name: '三段卖点证明',
    scope: 'PUBLIC',
    canManage: true,
    imageUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="%23dbeafe"/></svg>'
  }]
  await context.route('**/api/templates?scope=*', (route) => {
    const scope = new URL(route.request().url()).searchParams.get('scope')
    return json(route, { success: true, templates: scope === 'public' ? publicTemplates : [] })
  })

  await page.goto('/')
  await page.getByRole('button', { name: /选择卖点排版/ }).click()
  const dialog = page.getByRole('dialog', { name: '设置卖点图排版参考' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '公用模板', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '我的模板', exact: true })).toBeVisible()

  await page.locator('.layout-template-modal').click({ position: { x: 3, y: 3 } })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /三段卖点证明/ }).click()
  await dialog.getByRole('button', { name: '确认' }).click()

  await expect(page.getByRole('button', { name: /已选 1 张，卖点图数量已锁定/ })).toBeVisible()
  const featureRow = page.locator('.image-task-row').filter({ hasText: '卖点图' })
  await expect(featureRow.locator('.image-task-stepper span')).toHaveText('1')
  await expect(featureRow.locator('.image-task-stepper button').first()).toBeDisabled()
  await expect(featureRow.locator('.image-task-stepper button').last()).toBeDisabled()
})

test('刷新后恢复任务并在续做和重新生成时保留模板', async ({ page, context }) => {
  await mockApi(context)
  const templateUrl = '/api/assets/local/template/layout-1.png'
  const productUrl = '/api/assets/local/reference/product-1.png'
  const generationRequests = []

  await page.addInitScript(({ storageKey, task }) => {
    window.localStorage.setItem(storageKey, JSON.stringify([task]))
  }, {
    storageKey: `amazon-image-studio:tasks:${user.id}`,
    task: {
      id: 1001,
      status: 'generating',
      createdAt: '2026-09-17T08:00:00.000Z',
      resolution: '2k',
      listing: { productName: '模板恢复测试产品', complexity: 'L2' },
      referenceImages: [productUrl],
      primaryReferenceImageUrl: productUrl,
      images: [{
        imageId: 1,
        name: 'Feature Image 1',
        taskType: 'feature',
        status: 'generating',
        generationRequestId: 'generation_recovery_test_1001',
        strategyContent: '按模板展示一个已确认卖点。',
        promptEn: 'Show one confirmed selling point using the selected layout.',
        promptDirty: false,
        layoutTemplateId: 'layout-1',
        layoutTemplateName: '信息卡模板',
        layoutTemplateUrl: templateUrl,
        executionRules: [],
        copy: [],
        versions: []
      }]
    }
  })

  await context.route('**/api/generate/status/generation_recovery_test_1001', (route) => json(route, {
    success: true,
    run: { requestId: 'generation_recovery_test_1001', status: 'FAILED', errorMessage: '连接中断前的请求已经失败。', images: [] }
  }))

  await context.route('**/api/generate', async (route) => {
    generationRequests.push({
      body: route.request().postDataJSON(),
      requestId: route.request().headers()['x-generation-request-id']
    })
    await json(route, {
      success: true,
      images: [{
        imageId: 1,
        name: 'Feature Image 1',
        taskType: 'feature',
        status: 'completed',
        imageUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048"/>',
        resolution: '2048x2048',
        actualResolution: '2048x2048',
        sizeMatchesRequest: true
      }]
    })
  })

  await page.goto('/')
  await expect(page.getByText('已停止')).toBeVisible()
  await page.getByRole('button', { name: /继续/ }).click()
  await expect.poll(() => generationRequests.length).toBe(1)
  expect(generationRequests[0].requestId).toMatch(/^generation_[a-f0-9]{32}$/)
  expect(generationRequests[0].requestId).not.toBe('generation_recovery_test_1001')
  expect(generationRequests[0].body.executionContext.strategy.layoutTemplateId).toBe('layout-1')
  expect(generationRequests[0].body.executionContext.references.referenceImages).toContain(templateUrl)
  await expect(page.getByRole('button', { name: /开始生成/ })).toBeVisible()

  await page.getByRole('button', { name: '重新生成' }).click()
  await page.getByRole('button', { name: '开始重新生成' }).click()
  await expect.poll(() => generationRequests.length).toBe(2)
  expect(generationRequests[1].requestId).toMatch(/^generation_[a-f0-9]{32}$/)
  expect(generationRequests[1].requestId).not.toBe(generationRequests[0].requestId)
  expect(generationRequests[1].body.executionContext.strategy.layoutTemplateId).toBe('layout-1')
  expect(generationRequests[1].body.executionContext.references.referenceImages).toContain(templateUrl)
})

test('产品资料变化后必须重新生成策略', async ({ page, context }) => {
  await mockApi(context)
  await context.route('**/api/upload', (route) => json(route, {
    success: true,
    images: [{ url: '/api/assets/local/reference/stale-product.png' }]
  }))
  await context.route('**/api/assets/local/reference/stale-product.png?probe=*', (route) => route.fulfill({ status: 200 }))
  await context.route('**/api/agent-analyze', (route) => json(route, {
    success: true,
    data: {
      productBlueprint: {},
      _meta: {
        analysisRevision: route.request().postDataJSON().analysisRevision,
        persistence: { workspaceId: 'workspace-1' }
      },
      imagePlans: [
        ['main-1', 'main'],
        ['feature-1', 'feature'],
        ['feature-2', 'feature'],
        ['scenario-1', 'scenario'],
        ['detail-1', 'detail'],
        ['dimensions-1', 'dimensions'],
        ['summary-1', 'summary']
      ].map(([taskKey, taskType], index) => ({
        id: index + 1,
        taskKey,
        taskType,
        name: taskKey,
        strategyContent: `中文策略 ${taskKey}`,
        promptEn: `English prompt ${taskKey}`
      }))
    }
  }))

  await page.goto('/')
  const listingInput = page.locator('textarea').first()
  await listingInput.fill('初始产品资料')
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'product.png',
    mimeType: 'image/png',
    buffer: Buffer.from('fake-image-for-mocked-upload')
  })
  await page.getByRole('button', { name: '一键生成出图方案' }).click()
  await expect(page.getByText(/策略生成成功/)).toBeVisible()

  await listingInput.fill('修改后的产品资料')
  await expect(page.getByText('产品资料、产品图、任务或模板已变化，请重新生成策略。')).toBeVisible()
  await expect(page.getByRole('button', { name: /开始生成/ })).toBeDisabled()
})

test('分析期间修改资料时忽略旧策略响应', async ({ page, context }) => {
  await mockApi(context)
  await context.route('**/api/upload', (route) => json(route, {
    success: true,
    images: [{ url: '/api/assets/local/reference/race-product.png' }]
  }))
  await context.route('**/api/assets/local/reference/race-product.png?probe=*', (route) => route.fulfill({ status: 200 }))
  let finishAnalysis
  await context.route('**/api/agent-analyze', async (route) => {
    await new Promise((resolve) => { finishAnalysis = resolve })
    const revision = route.request().postDataJSON().analysisRevision
    await json(route, {
      success: true,
      data: {
        _meta: { analysisRevision: revision },
        imagePlans: [
          ['main-1', 'main'], ['feature-1', 'feature'], ['feature-2', 'feature'],
          ['scenario-1', 'scenario'], ['detail-1', 'detail'], ['dimensions-1', 'dimensions'], ['summary-1', 'summary']
        ].map(([taskKey, taskType], index) => ({
          id: index + 1,
          taskKey,
          taskType,
          name: taskKey,
          strategyContent: `中文策略 ${taskKey}`,
          promptEn: `English prompt ${taskKey}`
        }))
      }
    })
  })

  await page.goto('/')
  const listingInput = page.locator('textarea').first()
  await listingInput.fill('开始分析的产品资料')
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'product.png',
    mimeType: 'image/png',
    buffer: Buffer.from('fake-image-for-analysis-race')
  })
  await page.getByRole('button', { name: '一键生成出图方案' }).click()
  await expect.poll(() => typeof finishAnalysis).toBe('function')
  await listingInput.fill('分析期间修改后的资料')
  finishAnalysis()

  await expect(page.getByText(/旧策略未写入页面/)).toBeVisible()
  await expect(page.getByRole('button', { name: /开始生成/ })).toBeDisabled()
})
