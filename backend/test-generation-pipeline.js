import assert from 'node:assert/strict'
import sharp from 'sharp'
import {
  assertGeneratedImageDimensions,
  buildAmazonPrompt,
  normalizeAmazonMainImage
} from './routes/generate.js'
import {
  getDistinctSellingPoints,
  getIncompleteStrategyPlanIds
} from './routes/agent-analyze.js'
import { normalizeExecutionRules } from './services/agent/executionRules.js'
import { normalizeStrategyPlans } from './services/agent/planNormalizer.js'
import { normalizeProductBlueprint } from './services/agent/productBlueprint.js'

async function testMainImageNormalization() {
  const source = await sharp({
    create: {
      width: 1000,
      height: 1000,
      channels: 3,
      background: { r: 246, g: 246, b: 246 }
    }
  })
    .composite([{
      input: {
        create: {
          width: 240,
          height: 520,
          channels: 3,
          background: { r: 40, g: 60, b: 90 }
        }
      },
      left: 80,
      top: 210
    }])
    .png()
    .toBuffer()

  const output = await normalizeAmazonMainImage(source, '2048x2048')
  const metadata = await sharp(output).metadata()
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })
  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels
      if (Math.max(255 - data[offset], 255 - data[offset + 1], 255 - data[offset + 2]) < 10) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  const subjectWidth = maxX - minX + 1
  const subjectHeight = maxY - minY + 1
  const longestRatio = Math.max(subjectWidth / metadata.width, subjectHeight / metadata.height)
  const horizontalCenter = minX + (subjectWidth / 2)
  const verticalCenter = minY + (subjectHeight / 2)

  assert.equal(metadata.width, 2048)
  assert.equal(metadata.height, 2048)
  assert.ok(longestRatio >= 0.84 && longestRatio <= 0.86, `expected 85% subject ratio, got ${longestRatio}`)
  assert.ok(Math.abs(horizontalCenter - 1024) <= 2, `subject is not horizontally centered: ${horizontalCenter}`)
  assert.ok(Math.abs(verticalCenter - 1024) <= 2, `subject is not vertically centered: ${verticalCenter}`)
}

function testScenarioUsageContract() {
  const listing = {
    productName: 'Clamp reptile heat lamp',
    marketplace: 'UK',
    imageLanguage: 'English',
    listingInfo: 'RAW LISTING TEXT SHOULD NOT DRIVE FINAL PROMPT',
    additionalInfo: 'RAW ADDITIONAL INFO SHOULD NOT DRIVE FINAL PROMPT',
    productBlueprint: {
      identity: {
        productType: 'Clamp reptile heat lamp',
        corePurpose: 'provide directed basking heat and UV light',
        archetype: 'Clamp Mounted Device'
      },
      appearance: { primaryColor: ['black', 'silver'] },
      structure: {
        mainParts: ['lamp head', 'gooseneck', 'clamp'],
        importantRelationships: ['lamp head connected to gooseneck', 'gooseneck connected to clamp']
      },
      usage: {
        usageScenario: 'mounted outside a terrarium',
        userInteraction: 'user clamps the product to the tank edge and aims the lamp downward',
        supportObject: ['vertical glass wall edge'],
        contactPoint: ['glass edge held between both clamp jaws'],
        spatialRelationship: ['clamp and lamp remain outside the tank'],
        effectDirection: ['lamp head points down toward the basking platform inside'],
        requiredVisibleEvidence: ['both jaws contact opposite sides of the glass edge'],
        forbiddenSpatialRelations: ['clamp penetrating glass', 'clamp parallel to glass without gripping']
      },
      installationRules: {
        mountType: 'clamp',
        supportSurface: ['vertical glass wall edge'],
        relationship: ['support edge visibly sandwiched between two clamp jaws'],
        forbidden: ['floating clamp']
      }
    }
  }
  const plan = {
    taskType: 'scenario',
    strategyContent: '中文策略不应在已有英文执行稿时重新翻译或改写。',
    promptEn: 'Create a three-quarter terrarium corner image that demonstrates the clamp gripping the outer glass edge correctly.',
    executionRules: [
      'Both clamp jaws must visibly grip opposite sides of the glass edge.',
      'The lamp and clamp must stay outside the tank.',
      'No part of the product may penetrate, float, or fuse with the glass.'
    ]
  }
  const prompt = buildAmazonPrompt(
    listing,
    plan,
    'L1',
    '2048x2048',
    '/uploads/main.png',
    [{ index: 1, role: 'primary_product' }, { index: 2, role: 'supporting_product' }]
  )

  assert.match(prompt, /Both clamp jaws must visibly grip opposite sides of the glass edge/)
  assert.match(prompt, /The lamp and clamp must stay outside the tank/)
  assert.match(prompt, /No part of the product may penetrate, float, or fuse with the glass/)
  assert.match(prompt, /Create a three-quarter terrarium corner image/)
  assert.match(prompt, /Reference image order: image 1: primary product truth reference/)
  assert.doesNotMatch(prompt, /RAW LISTING TEXT SHOULD NOT DRIVE FINAL PROMPT/)
  assert.doesNotMatch(prompt, /RAW ADDITIONAL INFO SHOULD NOT DRIVE FINAL PROMPT/)
  assert.doesNotMatch(prompt, /support edge visibly sandwiched between two clamp jaws/)
  assert.ok(prompt.length < 6500, `scenario prompt is too long: ${prompt.length}`)
}

function testGeneratedImageSizeContract() {
  assert.doesNotThrow(() => assertGeneratedImageDimensions({ width: 2048, height: 2048 }, '2048x2048'))
  assert.throws(
    () => assertGeneratedImageDimensions({ width: 1774, height: 887 }, '2048x2048'),
    /要求 2048x2048 方图/
  )
  assert.throws(
    () => assertGeneratedImageDimensions({ width: null, height: null }, '2048x2048'),
    /无法识别尺寸/
  )
}

function testStrategyContractAndInputDeduplication() {
  const listingSource = '【产品名称】: Test Product\n【卖点描述】: 卖点 A\n卖点 B'
  assert.equal(getDistinctSellingPoints('卖点 A\n卖点 B', listingSource), '')
  assert.equal(getDistinctSellingPoints('独立补充卖点', listingSource), '独立补充卖点')

  assert.deepEqual(
    getIncompleteStrategyPlanIds([
      { id: 1, taskType: 'main', strategyContent: 'fixed', promptEn: 'fixed' },
      { id: 2, taskType: 'feature', strategyContent: '中文策略', promptEn: '' },
      { id: 3, taskType: 'detail', strategyContent: '', promptEn: 'English prompt' }
    ]),
    [2, 3]
  )

}

function testExecutionRulesRemainVisibleWhenTheyReinforceStrategy() {
  const strategyContent = '必须保留真实产品结构。不得新增不存在的配件。'
  const rules = normalizeExecutionRules(
    {
      executionRules: [
        '必须保留真实产品结构',
        '不得新增不存在的配件'
      ]
    },
    strategyContent,
    { productRules: { forbidden: [] } },
    'feature',
    { displayMode: 'selected_items' }
  )

  assert.deepEqual(rules, [
    '必须保留真实产品结构',
    '不得新增不存在的配件'
  ])
}

function testEnglishExecutionRulesUseChineseFallback() {
  const rules = normalizeExecutionRules(
    {
      executionRules: [
        'Do not alter the confirmed product structure.',
        'Do not add unconfirmed accessories.'
      ]
    },
    '中文策略。',
    { productRules: { forbidden: [] } },
    'feature',
    { displayMode: 'selected_items' }
  )

  assert.deepEqual(rules, [
    '不得改变参考图中确认的产品结构、颜色、比例、数量和标配配件。'
  ])
}

function testExecutionRulesKeepModelSpecificQuantityAndContactRules() {
  const rules = normalizeExecutionRules({
    executionRules: [
      '完整套装必须展示 6 个沙漏，不得多于或少于 6 个。',
      '扳手开口必须对准脚踏轴螺母。',
      '文案用短句说明厨房计时。',
      '扳手开口必须对准脚踏轴螺母。'
    ]
  })

  assert.deepEqual(rules, [
    '完整套装必须展示 6 个沙漏，不得多于或少于 6 个。',
    '扳手开口必须对准脚踏轴螺母。'
  ])
}

function testExplicitBundleItemsAndDimensionsWin() {
  const blueprint = normalizeProductBlueprint(
    {
      bundleRules: {
        includedItems: Array.from({ length: 10 }, () => 'Pink Bow Gift Box')
      }
    },
    {
      productName: 'Pink Bow Gift Box',
      listingInfo: '产品包含：礼盒 (1) | 玻璃杯及吸管 (1套) | 发带 (1) | 化妆包 (1) | 化妆刷 (8)',
      dimensions: '包装盒：28 x 20 x 9cm',
      signals: {},
      referenceImages: []
    }
  )

  assert.deepEqual(blueprint.bundleRules.includedItems, [
    '礼盒',
    '玻璃杯及吸管',
    '发带',
    '化妆包',
    '化妆刷'
  ])
  assert.equal(blueprint.confirmedDimensions, '包装盒：28 x 20 x 9cm')
}

function testCurrentImageUsageDoesNotInventBundleExclusions() {
  const detailUsage = normalizeExecutionRules(
    {
      executionRules: ['不得改变产品结构。']
    },
    '展示玻璃杯局部细节。',
    { bundleRules: { includedItems: ['玻璃杯', '吸管', '礼盒'] } },
    'detail',
    { displayMode: 'detail_part' }
  )

  assert.deepEqual(detailUsage, ['不得改变产品结构。'])
}

function testConfirmedDimensionsProtectGeneration() {
  const prompt = buildAmazonPrompt(
    {
      productName: 'Gift set',
      productBlueprint: {
        identity: { productType: 'Gift set' },
        confirmedDimensions: '包装盒：28 x 20 x 9 cm'
      }
    },
    {
      taskType: 'dimensions',
      strategyContent: '展示包装盒尺寸。',
      promptEn: 'Show the package dimensions.',
      executionRules: ['不得标注未确认尺寸。']
    },
    'L2',
    '2048x2048'
  )

  assert.match(prompt, /Only render numeric measurements that are explicitly present in confirmed dimensions/)
  assert.match(prompt, /包装盒：28 x 20 x 9 cm/)
}

function testNonMainPromptDoesNotAddSpecificParts() {
  const prompt = buildAmazonPrompt(
    { productName: 'Test product', productBlueprint: { identity: { productType: 'Test product' } } },
    {
      taskType: 'feature',
      strategyContent: '展示产品真实使用方式。',
      promptEn: 'Show the product in its real use context.',
      currentImageProductUsage: { displayMode: 'single_item' }
    },
    'L2',
    '2048x2048',
    '/uploads/main.png',
    [{ index: 1, role: 'primary_product' }, { index: 2, role: 'layout_style_reference' }]
  )

  assert.match(prompt, /layout or style reference only/)
  assert.doesNotMatch(prompt, /controller, cable, clamp, base/)
}

function testMainImageStrategyUsesAiPlanAndKeepsCompliance() {
  const [plan] = normalizeStrategyPlans({
    requestedTasks: [{ taskType: 'main', taskKey: 'main-1', name: 'Main Image' }],
    strategyPlans: [{
      taskKey: 'main-1',
      imageRole: '45-degree studio packshot',
      sellingFocus: 'Show the product shape clearly.',
      strategyContent: '用 45 度棚拍角度展示产品轮廓，不使用文字。',
      promptEn: 'Use a 45-degree studio packshot to show the product silhouette.',
      copy: ['Not allowed']
    }]
  })
  const prompt = buildAmazonPrompt({ productName: 'Test product' }, plan, 'L2', '2048x2048')

  assert.equal(plan.strategyContent, '用 45 度棚拍角度展示产品轮廓，不使用文字。')
  assert.deepEqual(plan.copy, [])
  assert.ok(plan.executionRules.includes('纯白背景 RGB 255,255,255'))
  assert.match(prompt, /Main image strategy: Use a 45-degree studio packshot/)
  assert.match(prompt, /pure white RGB 255,255,255 background/)
}

await testMainImageNormalization()
testScenarioUsageContract()
testGeneratedImageSizeContract()
testStrategyContractAndInputDeduplication()
testExecutionRulesRemainVisibleWhenTheyReinforceStrategy()
testEnglishExecutionRulesUseChineseFallback()
testExecutionRulesKeepModelSpecificQuantityAndContactRules()
testExplicitBundleItemsAndDimensionsWin()
testCurrentImageUsageDoesNotInventBundleExclusions()
testConfirmedDimensionsProtectGeneration()
testNonMainPromptDoesNotAddSpecificParts()
testMainImageStrategyUsesAiPlanAndKeepsCompliance()
console.log('generation pipeline tests passed')
