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
  await context.route('**/api/assets/local/reference/recovery-product.png', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="384" height="384"/>' }))
  await context.route('**/api/auth/me', (route) => json(route, { success: true, user }))
  await context.route('**/api/members', (route) => json(route, { success: true, members: [] }))
  await context.route('**/api/activity**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/activity/workspace-1') return json(route, { success: true, record: recordDetail })
    return json(route, { success: true, canReadAll: true, records })
  })
}

function strategyRecoveryFixture() {
  const requestId = 'analysis-browser-recovery-001'
  const referenceImages = ['/api/assets/local/reference/recovery-product.png']
  const listing = {
    productName: '策略恢复测试产品', listingInfo: '策略恢复测试产品', complexity: 'L2', marketplace: 'UK',
    selectedImageTasks: { main: 1, feature: 0, scenario: 0, detail: 0, dimensions: 0, steps: 0, comparison: 0, package: 0, summary: 0 },
    layoutTemplates: [], _meta: { analysisRevision: 1 }
  }
  const data = {
    productBlueprint: {},
    _meta: { requestId, analysisRevision: 1, generatedAt: new Date().toISOString(), persistence: { workspaceId: 'workspace-recovered' } },
    imagePlans: [{ id: 1, taskKey: 'main-1', taskType: 'main', name: '恢复主图', strategyContent: '找回的中文策略，保留产品结构。', promptEn: 'Recovered main image strategy.', databasePlanId: 'plan-recovered', databasePlanVersionId: 'version-recovered' }]
  }
  return { pending: { requestId, listing, referenceImages, primaryReferenceImageUrl: referenceImages[0], requestedAnalysisRevision: 1 }, data }
}

test('模板列表可滚动到底部，卡片与确认按钮在小窗口中完整可用', async ({ page, context }) => {
  await mockApi(context)
  const templates = Array.from({ length: 30 }, (_, index) => ({
    id: `scroll-template-${index}`, name: `滚动模板 ${index + 1}`, scope: 'PUBLIC', canManage: true,
    imageUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"/>'
  }))
  await context.route('**/api/templates?scope=*', (route) => json(route, { success: true, templates }))
  await page.goto('/')
  await page.getByRole('button', { name: /选择卖点排版/ }).click()
  const dialog = page.getByRole('dialog', { name: '设置卖点图排版参考' })
  const grid = dialog.locator('.layout-template-grid')
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 600 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await grid.evaluate((element) => { element.scrollTop = 0 })
    await grid.hover()
    await page.mouse.wheel(0, 20000)
    await expect.poll(() => grid.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    const lastCard = dialog.getByRole('button', { name: '滚动模板 30', exact: true })
    await expect(lastCard).toBeInViewport()
    await expect(dialog.locator('.layout-template-grid article').last().getByRole('button', { name: '删除', exact: true })).toBeInViewport()
    await expect(dialog.getByRole('button', { name: '确认', exact: true })).toBeInViewport()
  }
  await dialog.getByRole('button', { name: '滚动模板 30', exact: true }).click()
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(page.getByRole('button', { name: /已选 1 张，卖点图数量已锁定/ })).toBeVisible()
})

test('退出后换账号不带入上一位成员的产品和策略', async ({ page, context }) => {
  await mockApi(context)
  const { pending, data } = strategyRecoveryFixture()
  await page.addInitScript(({ key, pending }) => window.localStorage.setItem(key, JSON.stringify(pending)), { key: `amazon-image-analysis:v1:${user.id}`, pending })
  let activeUser = user
  await context.route('**/api/auth/me', (route) => activeUser ? json(route, { success: true, user: activeUser }) : json(route, { success: false }, 401))
  await context.route('**/api/auth/logout', (route) => { activeUser = null; return json(route, { success: true }) })
  await context.route('**/api/auth/login', (route) => { activeUser = { ...user, id: 'other-member', displayName: '另一位成员' }; return json(route, { success: true, user: activeUser }) })
  await context.route('**/api/agent-analyze/status/*', (route) => json(route, { success: true, status: 'SUCCEEDED', result: { success: true, data }, pendingPersistence: false }))
  await page.goto('/')
  await expect(page.locator('textarea').first()).toHaveValue(pending.listing.listingInfo)
  await expect(page.locator('.image-plan-group textarea').first()).toHaveValue(data.imagePlans[0].strategyContent)
  await page.getByRole('button', { name: '退出', exact: true }).click()
  await page.getByLabel('账号或邮箱').fill('other-member')
  await page.getByLabel('密码').fill('test-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByText('另一位成员', { exact: true })).toBeVisible()
  await expect(page.locator('textarea').first()).toHaveValue('')
  await expect(page.locator('.image-plan-group textarea').first()).toHaveValue('')
  await expect(page.getByAltText('已恢复的产品参考图 1')).toHaveCount(0)
})

test('主图策略修改后可单独保存版本，再生成图片', async ({ page, context }) => {
  await mockApi(context)
  const { pending, data } = strategyRecoveryFixture()
  await page.addInitScript(({ key, pending }) => window.localStorage.setItem(key, JSON.stringify(pending)), { key: `amazon-image-analysis:v1:${user.id}`, pending })
  await context.route('**/api/agent-analyze/status/*', (route) => json(route, { success: true, status: 'SUCCEEDED', result: { success: true, data }, pendingPersistence: false }))
  let saved
  let generated
  await context.route('**/api/prompt-preview', (route) => {
    saved = route.request().postDataJSON()
    return json(route, { success: true, data: { promptEn: '', persistence: { imagePlanVersionId: 'operator-main-version' } } })
  })
  await context.route('**/api/generate', (route) => {
    generated = route.request().postDataJSON()
    return json(route, { success: true, images: [{ status: 'completed', imageUrl: pending.referenceImages[0] }] })
  })
  await page.goto('/')
  const strategy = page.locator('.image-plan-group textarea').first()
  await expect(strategy).toHaveValue(data.imagePlans[0].strategyContent)
  await strategy.fill('保留白底，按我修改的角度展示产品。')
  await page.getByRole('button', { name: '保存主图策略', exact: true }).click()
  await expect(page.getByText('主图策略已保存', { exact: true })).toBeVisible()
  expect(saved.plan.strategyContent).toBe('保留白底，按我修改的角度展示产品。')
  await page.getByRole('button', { name: /开始生成/ }).click()
  await expect.poll(() => generated?.executionContext?.persistence?.imagePlanVersionId).toBe('operator-main-version')
})

test('上传期间退出账号后，旧任务不能借新账号继续分析', async ({ page, context }) => {
  await mockApi(context)
  let activeUser = user
  let releaseUpload
  const uploaded = new Promise((resolve) => { releaseUpload = resolve })
  let uploadStarted = false
  let modelCalls = 0
  await context.route('**/api/auth/me', (route) => activeUser ? json(route, { success: true, user: activeUser }) : json(route, { success: false }, 401))
  await context.route('**/api/auth/logout', (route) => { activeUser = null; return json(route, { success: true }) })
  await context.route('**/api/auth/login', (route) => { activeUser = { ...user, id: 'other-member' }; return json(route, { success: true, user: activeUser }) })
  await context.route('**/api/upload', async (route) => {
    uploadStarted = true
    await uploaded
    return json(route, { success: true, images: [{ url: '/api/assets/local/reference/recovery-product.png' }] })
  })
  await context.route('**/api/assets/local/reference/recovery-product.png?probe=*', (route) => route.fulfill({ status: 200 }))
  await context.route('**/api/agent-analyze', (route) => { modelCalls += 1; return route.abort() })
  await page.goto('/')
  await page.locator('textarea').first().fill('上一位成员的资料')
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'product.png', mimeType: 'image/png', buffer: Buffer.from('mock') })
  await page.getByRole('button', { name: '一键生成出图方案' }).click()
  await expect.poll(() => uploadStarted).toBe(true)
  await page.getByRole('button', { name: '退出', exact: true }).click()
  await page.getByLabel('账号或邮箱').fill('other-member')
  await page.getByLabel('密码').fill('test-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.locator('textarea').first()).toHaveValue('')
  const settled = page.waitForResponse((response) => response.url().endsWith('/api/upload'))
  releaseUpload()
  await settled
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('amazon-image-analysis:v1:other-member'))).toBeNull()
  await page.waitForTimeout(500)
  expect(modelCalls).toBe(0)
  await expect(page.locator('textarea').first()).toHaveValue('')
})

test('使用记录分页并在筛选时回到第一页', async ({ page, context }) => {
  await mockApi(context)
  const requests = []
  await context.route('**/api/activity?*', (route) => {
    const params = new URL(route.request().url()).searchParams
    requests.push({ page: params.get('page'), q: params.get('q') })
    const current = Number(params.get('page'))
    return json(route, { success: true, records: [{ ...records[0], title: current === 2 ? '第二页产品' : records[0].title }], pagination: { page: current, total: 21, hasNext: current === 1 } })
  })
  await page.goto('/activity')
  await expect(page.getByText('21 条记录')).toBeVisible()
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(page.getByText('第二页产品')).toBeVisible()
  await expect(page.getByRole('button', { name: '下一页' })).toBeDisabled()
  await page.getByPlaceholder('搜索产品名称').fill('恢复')
  await expect(page.getByText('第 1 页')).toBeVisible()
  await expect.poll(() => requests.at(-1)).toEqual({ page: '1', q: '恢复' })
})

test('刷新后的策略请求恢复产品资料、参考图和策略，不再调用模型', async ({ page, context }) => {
  await mockApi(context)
  const { pending, data } = strategyRecoveryFixture()
  await page.addInitScript(({ key, pending }) => window.localStorage.setItem(key, JSON.stringify(pending)), { key: `amazon-image-analysis:v1:${user.id}`, pending })
  let modelCalls = 0
  await context.route('**/api/agent-analyze', (route) => { modelCalls += 1; return route.abort() })
  await context.route('**/api/agent-analyze/status/*', (route) => json(route, { success: true, status: 'SUCCEEDED', result: { success: true, data }, pendingPersistence: false }))
  await page.goto('/')
  await expect(page.locator('textarea').first()).toHaveValue(pending.listing.listingInfo)
  await expect(page.locator('.image-plan-group textarea').first()).toHaveValue(data.imagePlans[0].strategyContent)
  await expect(page.getByAltText('已恢复的产品参考图 1')).toBeVisible()
  await expect(page.getByRole('button', { name: /开始生成/ })).toBeEnabled()
  await expect(page.getByText('策略已找回并保存，可以继续编辑和生图。')).toBeVisible()
  expect(modelCalls).toBe(0)
})

test('数据库补存后保留用户正在修改的策略', async ({ page, context }) => {
  await mockApi(context)
  const { pending, data } = strategyRecoveryFixture()
  await page.addInitScript(({ key, pending }) => window.localStorage.setItem(key, JSON.stringify(pending)), { key: `amazon-image-analysis:v1:${user.id}`, pending })
  let releaseRepair
  const repaired = new Promise((resolve) => { releaseRepair = resolve })
  let checks = 0
  await context.route('**/api/agent-analyze/status/*', async (route) => {
    checks += 1
    if (checks > 1) {
      await repaired
      return json(route, { success: true, status: 'SUCCEEDED', result: { success: true, data }, pendingPersistence: false })
    }
    return json(route, { success: true, status: 'SUCCEEDED', result: { success: true, data: { ...data, _meta: { ...data._meta, persistence: undefined, persistenceWarning: '等待补存' }, imagePlans: data.imagePlans.map((plan) => ({ ...plan, databasePlanId: undefined, databasePlanVersionId: undefined })) } }, pendingPersistence: true })
  })
  await page.goto('/')
  const strategy = page.locator('.image-plan-group textarea').first()
  await expect(strategy).toHaveValue(data.imagePlans[0].strategyContent)
  await strategy.fill('我自己改的主图策略，不许替换。')
  releaseRepair()
  await expect(page.getByText('策略已找回并保存，可以继续编辑和生图。')).toBeVisible()
  await expect(strategy).toHaveValue('我自己改的主图策略，不许替换。')
})

test('策略响应断开后只查询原请求，不重复分析', async ({ page, context }) => {
  await mockApi(context)
  let modelCalls = 0
  let returnedData
  let requestId
  await context.route('**/api/upload', (route) => json(route, { success: true, images: [{ url: '/api/assets/local/reference/disconnected-product.png' }] }))
  await context.route('**/api/assets/local/reference/disconnected-product.png?probe=*', (route) => route.fulfill({ status: 200 }))
  await context.route('**/api/agent-analyze', (route) => {
    modelCalls += 1
    const input = route.request().postDataJSON()
    requestId = route.request().headers()['x-analysis-request-id']
    returnedData = {
      productBlueprint: {}, _meta: { requestId, analysisRevision: input.analysisRevision, generatedAt: new Date().toISOString() },
      imagePlans: input.selectedImageTasks.flatMap(({ type, count }) => Array.from({ length: count }, (_, index) => ({ id: index + 1, taskKey: `${type}-${index + 1}`, taskType: type, strategyContent: `找回的中文策略 ${type}`, promptEn: `Recovered ${type} strategy` })))
    }
    return route.abort('failed')
  })
  await context.route('**/api/agent-analyze/status/*', (route) => {
    expect(route.request().url().endsWith(requestId)).toBe(true)
    return json(route, { success: true, status: 'SUCCEEDED', result: { success: true, data: returnedData }, pendingPersistence: false })
  })
  await page.goto('/')
  await page.locator('textarea').first().fill('断线恢复测试产品')
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'product.png', mimeType: 'image/png', buffer: Buffer.from('mock-product') })
  await page.getByRole('button', { name: '一键生成出图方案' }).click()
  await expect(page.getByText('策略已找回并保存，可以继续编辑和生图。')).toBeVisible()
  await expect(page.locator('.image-plan-group textarea').first()).toHaveValue('找回的中文策略 main')
  expect(modelCalls).toBe(1)
  expect(requestId).toMatch(/^analysis-[a-f0-9]{32}$/)
})

test('选择模板且有八张产品图时，在分析前拦截', async ({ page, context }) => {
  await mockApi(context)
  const template = { id: 'layout-limit', name: '数量限制模板', scope: 'PUBLIC', imageUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' }
  await context.route('**/api/templates?scope=*', (route) => json(route, { success: true, templates: [template] }))
  let analysisCalls = 0
  await context.route('**/api/agent-analyze', (route) => { analysisCalls += 1; return route.abort() })
  await page.goto('/')
  await page.locator('textarea').first().fill('参考图数量限制产品')
  await page.locator('input[type="file"]').first().setInputFiles(Array.from({ length: 8 }, (_, index) => ({
    name: `product-${index}.svg`, mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="384" height="384"><rect width="384" height="384" fill="pink"/></svg>')
  })))
  await expect(page.getByText(/已上传 8/)).toBeVisible()
  await page.getByRole('button', { name: /选择卖点排版/ }).click()
  const dialog = page.getByRole('dialog', { name: '设置卖点图排版参考' })
  await dialog.getByRole('button', { name: template.name, exact: true }).click()
  await dialog.getByRole('button', { name: '确认' }).click()
  await page.getByRole('button', { name: '一键生成出图方案' }).click()
  await expect(page.getByText(/选择模板后最多使用 7 张产品图/)).toBeVisible()
  expect(analysisCalls).toBe(0)
})

test('恢复期间修改产品资料时，旧策略不覆盖新资料', async ({ page, context }) => {
  await mockApi(context)
  const { pending, data } = strategyRecoveryFixture()
  await page.addInitScript(({ key, pending }) => window.localStorage.setItem(key, JSON.stringify(pending)), { key: `amazon-image-analysis:v1:${user.id}`, pending })
  let releaseResult
  const resultHeld = new Promise((resolve) => { releaseResult = resolve })
  await context.route('**/api/agent-analyze/status/*', async (route) => {
    await resultHeld
    return json(route, { success: true, status: 'SUCCEEDED', result: { success: true, data }, pendingPersistence: false })
  })
  await page.goto('/')
  await page.locator('textarea').first().fill('这是用户新填写的产品资料')
  releaseResult()
  await expect(page.getByText('原策略已找回，当前资料已变化，未替换页面内容。')).toBeVisible()
  await expect(page.locator('textarea').first()).toHaveValue('这是用户新填写的产品资料')
  await expect(page.locator('.image-plan-group textarea').first()).toHaveValue('')
})

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
  await dialog.getByRole('button', { name: '预览 三段卖点证明', exact: true }).click()
  const preview = page.getByRole('dialog', { name: '模板大图预览' })
  await expect(preview.getByAltText('三段卖点证明 原图')).toBeVisible()
  await preview.getByRole('button', { name: '放大', exact: true }).click()
  await expect(preview.locator('output')).toHaveText('125%')
  await preview.getByRole('button', { name: '适应窗口' }).click()
  await expect(preview.locator('output')).toHaveText('100%')
  await page.screenshot({ path: `${process.env.TEMP}/template-preview-desktop.png` })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(preview.getByRole('button', { name: '关闭预览' })).toBeVisible()
  await page.screenshot({ path: `${process.env.TEMP}/template-preview-mobile.png` })
  await page.keyboard.press('Escape')
  await expect(preview).toHaveCount(0)
  await page.setViewportSize({ width: 1280, height: 720 })
  await expect(dialog.getByRole('heading', { name: '已选模板 0/8' })).toBeVisible()
  await dialog.getByRole('button', { name: '三段卖点证明', exact: true }).click()
  await dialog.getByRole('button', { name: '预览已选 三段卖点证明' }).click()
  await expect(preview).toBeVisible()
  await preview.getByRole('button', { name: '关闭预览' }).click()
  await dialog.getByRole('button', { name: '确认' }).click()

  await expect(page.getByRole('button', { name: /已选 1 张，卖点图数量已锁定/ })).toBeVisible()
  const featureRow = page.locator('.image-task-row').filter({ hasText: '卖点图' })
  await expect(featureRow.locator('.image-task-stepper span')).toHaveText('1')
  await expect(featureRow.locator('.image-task-stepper button').first()).toBeDisabled()
  await expect(featureRow.locator('.image-task-stepper button').last()).toBeDisabled()
})

test('选择模板后生成策略并展示可编辑结果', async ({ page, context }) => {
  await mockApi(context)
  const template = {
    id: 'template-feature-1',
    name: '卖点证明版式',
    scope: 'PUBLIC',
    imageUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"/>'
  }
  await context.route('**/api/templates?scope=*', (route) => json(route, { success: true, templates: [template] }))
  await context.route('**/api/upload', (route) => json(route, {
    success: true,
    images: [{ url: '/api/assets/local/reference/product-template-test.png' }]
  }))
  await context.route('**/api/assets/local/reference/product-template-test.png?probe=*', (route) => route.fulfill({ status: 200 }))
  let analysisRequest
  await context.route('**/api/agent-analyze', (route) => {
    analysisRequest = route.request().postDataJSON()
    const imagePlans = analysisRequest.selectedImageTasks.flatMap(({ type, count }) =>
      Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        taskKey: `${type}-${index + 1}`,
        taskType: type,
        name: `${type} ${index + 1}`,
        strategyContent: `中文策略 ${type}-${index + 1}`,
        promptEn: `English prompt ${type}-${index + 1}`,
        ...(type === 'feature' ? {
          layoutTemplateId: template.id,
          layoutTemplateName: template.name,
          layoutTemplateUrl: template.imageUrl
        } : {})
      }))
    )
    return json(route, {
      success: true,
      data: {
        productBlueprint: {},
        _meta: { analysisRevision: analysisRequest.analysisRevision },
        imagePlans
      }
    })
  })

  await page.goto('/')
  await page.locator('textarea').first().fill('测试卖点产品资料')
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'product.png', mimeType: 'image/png', buffer: Buffer.from('mocked-product-image')
  })
  await page.getByRole('button', { name: /选择卖点排版/ }).click()
  const dialog = page.getByRole('dialog', { name: '设置卖点图排版参考' })
  await dialog.getByRole('button', { name: template.name, exact: true }).click()
  await dialog.getByRole('button', { name: '确认' }).click()
  await page.getByRole('button', { name: '一键生成出图方案' }).click()

  await expect(page.getByText(/策略生成成功/)).toBeVisible()
  expect(analysisRequest.layoutTemplateIds).toEqual([template.id])
  expect(analysisRequest.selectedImageTasks.find(({ type }) => type === 'feature').count).toBe(1)
  await expect(page.locator('.image-plan-group').filter({ hasText: `参考版式：${template.name}` }).locator('textarea').first()).toHaveValue('中文策略 feature-1')
})

test('卖点模板支持批量上传并报告部分失败', async ({ page, context }) => {
  await mockApi(context)
  const publicTemplates = []
  let uploadCount = 0
  await context.route('**/api/templates**', async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      uploadCount += 1
      const body = request.postData() || ''
      const name = body.match(/name="name"\r?\n\r?\n([^\r\n]+)/)?.[1] || `模板 ${uploadCount}`
      if (uploadCount === 2) return json(route, { message: '图片格式不支持。' }, 400)
      publicTemplates.push({
        id: `template-upload-${uploadCount}`,
        name,
        scope: 'PUBLIC',
        canManage: true,
        imageUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="%23dcfce7"/></svg>'
      })
      return json(route, { success: true, template: publicTemplates.at(-1) })
    }
    const scope = new URL(request.url()).searchParams.get('scope')
    return json(route, { success: true, templates: scope === 'public' ? publicTemplates : [] })
  })

  await page.goto('/')
  await page.getByRole('button', { name: /选择卖点排版/ }).click()
  const dialog = page.getByRole('dialog', { name: '设置卖点图排版参考' })
  await dialog.locator('input[type="file"]').setInputFiles([
    { name: 'layout-a.png', mimeType: 'image/png', buffer: Buffer.from('a') },
    { name: 'layout-b.png', mimeType: 'image/png', buffer: Buffer.from('b') }
  ])

  await expect.poll(() => uploadCount).toBe(2)
  await expect(dialog.getByText(/已上传 1\/2 张/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'layout-a', exact: true })).toBeVisible()
})

test('模板列表晚到的响应不会覆盖当前范围', async ({ page, context }) => {
  await mockApi(context)
  let releasePublic
  const publicHeld = new Promise((resolve) => { releasePublic = resolve })
  await context.route('**/api/templates?scope=*', async (route) => {
    const scope = new URL(route.request().url()).searchParams.get('scope')
    if (scope === 'public') await publicHeld
    await json(route, {
      success: true,
      templates: [{ id: scope, name: scope === 'public' ? '公用旧结果' : '我的新结果', imageUrl: 'data:image/svg+xml,<svg/>' }]
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: /选择卖点排版/ }).click()
  const dialog = page.getByRole('dialog', { name: '设置卖点图排版参考' })
  await dialog.getByRole('button', { name: '我的模板', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '我的新结果', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '我的模板', exact: true }).click()
  await expect(dialog.getByText('正在读取模板...')).toHaveCount(0)
  releasePublic()
  await expect(dialog.getByRole('button', { name: '公用旧结果' })).toHaveCount(0)
})

test('生图响应断开后用原请求编号找回结果', async ({ page, context }) => {
  await mockApi(context)
  const storageKey = `amazon-image-studio:tasks:${user.id}`
  await page.addInitScript(({ key, task }) => window.localStorage.setItem(key, JSON.stringify([task])), {
    key: storageKey,
    task: {
      id: 2011, status: 'stopped', resolution: '2k', createdAt: '2026-09-17T08:00:00.000Z',
      listing: { productName: '断线测试', complexity: 'L2' }, referenceImages: [],
      images: [{
        imageId: 1, name: 'Feature Image 1', taskType: 'feature', status: 'pending',
        strategyContent: '展示已确认的卖点。', promptEn: 'Show the confirmed selling point.',
        promptDirty: false, versions: []
      }]
    }
  })
  let requestId
  let statusChecks = 0
  await context.route('**/api/generate', async (route) => {
    requestId = route.request().headers()['x-generation-request-id']
    await route.abort('failed')
  })
  await context.route('**/api/generate/status/*', (route) => {
    expect(new URL(route.request().url()).pathname.endsWith(requestId)).toBe(true)
    statusChecks += 1
    return json(route, {
      success: true,
      run: statusChecks === 1
        ? { status: 'RUNNING', images: [] }
        : { status: 'SUCCEEDED', images: [{ imageUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', status: 'completed' }] }
    })
  })

  await page.goto('/')
  await expect(page.getByText('已停止')).toBeVisible()
  await page.getByRole('button', { name: /继续/ }).click()
  await expect(page.getByAltText('生成图片 1')).toBeVisible()
  expect(requestId).toMatch(/^generation_[a-f0-9]{32}$/)
  expect(statusChecks).toBeGreaterThanOrEqual(2)
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
