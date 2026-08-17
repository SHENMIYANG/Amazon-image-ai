import {
  inferArchetype,
  normalizeStringArray
} from '../../utils/productModel.js'

export function normalizeLineList(value = '', maxItems = 6, maxItemLength = 160) {
  return String(value || '')
    .split('\n')
    .map((item) => item.replace(/^[\s\d\-*\.\[\]\(\)（）【】•·:：、]+/, '').trim())
    .filter(Boolean)
    .filter((item, index, source) => source.findIndex((candidate) => candidate === item) === index)
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxItemLength))
}

export function compactObject(source = {}) {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => {
      if (value === undefined || value === null) return false
      if (typeof value === 'string') return value.trim() !== ''
      if (Array.isArray(value)) return value.length > 0
      if (typeof value === 'object') return Object.keys(value).length > 0
      return true
    })
  )
}

function isMountedArchetype(archetype = '') {
  return [
    'Clamp Mounted Device',
    'Hanging Device',
    'Adhesive Mounted Device',
    'Magnetic Mounted Device',
    'Wall Mounted Device'
  ].includes(archetype)
}

export function splitProductItems(value = '', maxItems = 16) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split(/[|,，、;；\n]/)
    .map((item) => item.replace(/^[\s\d\-*.(（【]+/, '').trim())
    .map((item) => item
      .replace(/\s*[（(]\s*\d+(?:\s*(?:套|个|件|双|支|只|片))?\s*[）)]\s*$/g, '')
      .replace(/[)）】]\s*$/, '')
      .trim()
    )
    .filter((item) => item.length >= 2)
    .filter((item, index, source) => source.findIndex((candidate) => candidate === item) === index)
    .slice(0, maxItems)
}

function extractIncludedItems(sourceText = '') {
  const text = String(sourceText || '')
  const matches = [
    text.match(/产品包含[:：]\s*([^\n]+)/),
    text.match(/包含[:：]\s*([^\n]+)/),
    text.match(/included items?[:：]\s*([^\n]+)/i),
    text.match(/contents?[:：]\s*([^\n]+)/i)
  ].filter(Boolean)

  if (matches.length === 0) return []

  const contents = matches[0][1]
    .replace(/\s*(?:【)?(?:尺寸规格|尺寸|包装盒|材质描述|卖点描述|目标受众|使用方式|场景图要求|图片要求)\s*[:：].*$/i, '')

  return splitProductItems(contents)
}

function hasExplicitGiftBundle(sourceText = '', includedItems = []) {
  const text = String(sourceText || '').toLowerCase()
  return (
    /(gift box|gift set|geschenkset|礼盒|礼品盒|礼物盒)/.test(text) ||
    includedItems.some((item) => /(gift box|geschenkbox|礼盒|礼品盒|包装盒)/i.test(item))
  )
}

function inferFallbackParts({ context = '', listingText = '', materialItems = [], signals = {} } = {}) {
  const text = String(context || '').toLowerCase()
  const parts = []
  const add = (part) => {
    if (part && !parts.includes(part)) parts.push(part)
  }

  const explicitIncludedItems = extractIncludedItems(context)
  explicitIncludedItems.forEach(add)

  if (/(hourglass|sandglass|sanduhr|sanduhren|sand timer|沙漏)/.test(text)) {
    add('hourglass timer body')
    add('transparent glass')
    add('top and bottom caps')
    add('colored sand')
    add('printed time marks')
  }

  if (hasExplicitGiftBundle(listingText, explicitIncludedItems)) {
    add('gift box')
    add('included gift items')
  }

  if (/(wrench|spanner|扳手)/.test(text)) {
    add('tool body')
    add('working openings')
    add('handle')
  }

  if (/(glove|gloves|手套)/.test(text)) {
    add('included gloves')
  }

  if (/(lamp|light|head|灯头|灯)/.test(text)) add('lamp head')
  if (signals?.hasFlexibleArm) add('flexible arm')
  if (signals?.archetype === 'Clamp Mounted Device') add('clamp')
  if (signals?.hasCable) add('power cable')
  if (signals?.hasController) add('controller')
  if (signals?.hasBulb) add('light source')

  materialItems.forEach((materialItem) => {
    if (/(handle|握把|手柄)/i.test(materialItem)) add('handle')
    if (/(glass|玻璃)/i.test(materialItem)) add('glass part')
    if (/(wood|木|holz)/i.test(materialItem)) add('wood part')
  })

  return parts.slice(0, 12)
}

function inferBundleItems({ context = '', parts = [], explicitIncludedItems = [] } = {}) {
  const rawContext = String(context || '')

  if (explicitIncludedItems.length > 0) return explicitIncludedItems

  const quantityMatch = rawContext.match(/(?:^|[\s【(（])(\d{1,2})\s*(?:stück|stuck|pcs?|pieces?|piece|pack|set|件套|件|个|只|支|片|双|套)\b/i) ||
    rawContext.match(/(\d{1,2})\s*(?:er|er-set|er set|teilig|teiliges|teiliges set)/i)
  const quantity = quantityMatch ? Number(quantityMatch[1]) : 0
  const title =
    rawContext.match(/(?:产品名称|Product Name)[:：]\s*([^\n]+)/i)?.[1]?.trim() ||
    rawContext.match(/^([^\n。；;]{6,160})/)?.[1]?.trim() ||
    ''
  const productType = title
    .replace(/^\s*\d{1,2}\s*(?:stück|stuck|pcs?|pieces?|piece|pack|set|件套|件|个|只|支|片|双|套|er|teilig|teiliges)\s*/i, '')
    .replace(/^(bunte|colorful|multi[-\s]?color|complete|komplettes|完整|彩色|多色|一套|套装)\s*/i, '')
    .replace(/[，,].*$/, '')
    .trim() || '已确认套装单品'

  if (quantity > 1 && quantity <= 20 && /(set|kit|pack|bundle|套装|组合|件套|stück|teilig|geschenkset|gift set)/i.test(rawContext)) {
    return Array.from({ length: quantity }, (_, index) => `第${index + 1}件：${productType}`)
  }

  if (parts.includes('tool body') && parts.includes('included gloves')) {
    return ['扳手', '手套']
  }
  if (parts.includes('gift box') || parts.includes('included gift items')) {
    return ['礼盒', '已确认套装单品']
  }

  return []
}

function inferBundleQuantity(context = '', explicitIncludedItems = []) {
  if (explicitIncludedItems.length > 1) return String(explicitIncludedItems.length)

  const rawContext = String(context || '')
  const quantityMatch = rawContext.match(/(?:^|[\s【(（])(\d{1,2})\s*(?:stück|stuck|pcs?|pieces?|piece|pack|set|件套|件|个|只|支|片|双|套)\b/i) ||
    rawContext.match(/(\d{1,2})\s*(?:er|er-set|er set|teilig|teiliges|teiliges set)/i)
  const quantity = quantityMatch ? Number(quantityMatch[1]) : 0

  if (quantity > 1 && quantity <= 20 && /(set|kit|pack|bundle|套装|组合|件套|stück|teilig|geschenkset|gift set)/i.test(rawContext)) {
    return String(quantity)
  }

  return ''
}

function sanitizeBundleItems(items = [], fallbackItems = [], context = '') {
  const explicitIncludedItems = extractIncludedItems(context)
  const allowGift = hasExplicitGiftBundle(context, explicitIncludedItems)
  const structuralNoise = /(transparent glass|top and bottom caps|colored sand|printed time marks|glass part|wood part|hourglass timer body|透明玻璃|木盖|底座|细沙|印刷文字|瓶身|流沙通道)/i
  const giftNoise = /(gift box|included gift items|geschenkbox|礼盒|礼物|礼品盒|包装盒)/i
  // A user-supplied contents list is product truth. The model may describe it,
  // but it must not replace named included items with repeated product titles.
  const source = explicitIncludedItems.length > 1
    ? explicitIncludedItems
    : normalizeStringArray(items, 16, 100).length > 0
    ? normalizeStringArray(items, 16, 100)
    : fallbackItems

  return source
    .filter((item) => !structuralNoise.test(item))
    .filter((item) => allowGift || !giftNoise.test(item))
    .filter((item, index, list) => list.findIndex((candidate) => candidate === item) === index)
    .slice(0, 16)
}

function buildFallbackProductRules({ parts = [], signals = {}, context = '' } = {}) {
  const text = String(context || '').toLowerCase()
  const mustKeep = []
  const forbidden = [
    '不得新增未确认配件、结构、品牌Logo、认证或绝对性承诺',
    '不得改变产品颜色、比例、材质外观和已确认数量'
  ]

  if (parts.length > 0) {
    mustKeep.push(`必须保留真实产品部件：${parts.slice(0, 8).join('、')}`)
  }

  if (/(hourglass|sandglass|sanduhr|sanduhren|sand timer|沙漏)/.test(text)) {
    mustKeep.push('必须保持沙漏的玻璃、上下盖、彩色细沙和分钟印字真实一致')
    forbidden.push('不得添加电子屏、按钮、电池、线缆或未确认收纳盒')
  }

  if (parts.includes('gift box') || parts.includes('included gift items')) {
    mustKeep.push('套装产品必须保持已确认件数、配件和包装关系')
    forbidden.push('不得少件、换件或新增未确认礼品')
  }

  if (/(wrench|spanner|扳手)/.test(text)) {
    mustKeep.push('工具开口、握把、厚度、印字和配件必须与参考图一致')
    forbidden.push('不得把工具开口画变形，不得让工具与螺丝或车架穿模')
  }

  if (signals?.archetype === 'Clamp Mounted Device') {
    mustKeep.push('夹持结构、受力接触点和内外位置关系必须清楚可见')
    forbidden.push('不得悬空、穿透、融合到支撑面里')
  }

  return {
    mustKeep: [...new Set(mustKeep)].slice(0, 8),
    forbidden: [...new Set(forbidden)].slice(0, 8)
  }
}

function sanitizeMainParts(parts = [], fallbackParts = [], signals = {}) {
  const normalized = normalizeStringArray(parts, 12, 80)
    .filter((part) => !(part.toLowerCase() === 'controller' && !signals?.hasController))
    .filter((part) => !/^product$/i.test(part))

  if (normalized.length === 0) return fallbackParts
  if (normalized.length === 1 && normalized[0].toLowerCase() === 'controller') return fallbackParts
  return normalized
}

export function buildProductSignals(sourceText = '') {
  const text = String(sourceText || '').toLowerCase()

  return {
    archetype: inferArchetype(text),
    hasFlexibleArm: /(gooseneck|flexible neck|flexible arm|adjustable arm)/.test(text),
    hasCable: /(cable|wire|cord|usb)/.test(text),
    hasController: /(controller|dimmer|switch|remote|control box|inline control|line control|调光|控制盒|控制器|线控|开关)/.test(text),
    hasTimingFunction: /(timer|countdown|hourglass|sandglass|sanduhr|sanduhren|sand timer|计时|倒计时|沙漏)/.test(text),
    hasBulb: /(bulb|uva|uvb|led|lamp head|light head)/.test(text),
    hasInteriorTarget: /(tank|terrarium|aquarium|enclosure|inside)/.test(text)
  }
}

function buildFallbackProductBlueprint({
  productName,
  listingInfo,
  category,
  marketplace,
  dimensions,
  material,
  sellingPoints,
  additionalInfo,
  referenceImages = [],
  signals
} = {}) {
  const materialItems = String(material || '')
    .split(/[\n,;|]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6)

  const context = [
    productName,
    listingInfo,
    category,
    dimensions,
    sellingPoints,
    additionalInfo,
    material
  ].join(' ')
  const explicitIncludedItems = extractIncludedItems(context)
  const listingText = [
    productName,
    listingInfo,
    category
  ].join(' ')

  const parts = inferFallbackParts({ context, listingText, materialItems, signals })
  const bundleItems = inferBundleItems({ context, parts, explicitIncludedItems })
  const bundleQuantity = inferBundleQuantity(context, explicitIncludedItems)
  const productRuleFallback = buildFallbackProductRules({ parts, signals, context })

  const connections = []
  if (parts.includes('lamp head') && parts.includes('flexible arm')) {
    connections.push('lamp head connected to flexible arm')
  }
  if (parts.includes('flexible arm') && parts.includes('clamp')) {
    connections.push('flexible arm connected to clamp')
  }
  if (parts.includes('controller') && parts.includes('power cable')) {
    connections.push('controller connected by cable')
  }

  const mountTypeMap = {
    'Clamp Mounted Device': 'Clamp Mount',
    'Hanging Device': 'Hook or Hanging Mount',
    'Adhesive Mounted Device': 'Adhesive Mount',
    'Magnetic Mounted Device': 'Magnetic Mount',
    'Wall Mounted Device': 'Wall Mount',
    'Wearable Product': 'Wearable Placement',
    'Handheld Product': 'Handheld Use',
    'Standing Product': 'Freestanding Placement'
  }

  const mountType = mountTypeMap[signals?.archetype] || 'Freestanding Placement'
  const supportSurface = []
  const placement = []
  const relationship = []
  const allowed = []
  const forbidden = []

  if (signals?.archetype === 'Clamp Mounted Device') {
    supportSurface.push('support edge')
    placement.push('outside support surface')
    relationship.push('clamp touches support edge')
    allowed.push('clamp grips real support edge')
    forbidden.push('floating clamp', 'clamp passing through support surface')
  }

  if (signals?.hasInteriorTarget) {
    relationship.push('device stays outside enclosure while effect points toward interior')
  }

  return {
    identity: {
      productType: String(productName || '').trim() || 'Unknown product',
      category: String(category || '').trim() || 'General',
      corePurpose: normalizeLineList(sellingPoints, 1, 140)[0] || 'Help buyers understand and purchase the product',
      market: `Amazon ${marketplace || 'UK'}`,
      archetype: signals?.archetype || 'Standing Product'
    },
    appearance: {
      color: '',
      material: materialItems.join(', '),
      visualStyle: ''
    },
    structure: {
      mainParts: parts,
      importantRelationships: connections
    },
    usage: {
      usageScenario: signals?.archetype === 'Standing Product' ? 'freestanding use' : 'mounted or guided use',
      userInteraction: [
        ...supportSurface,
        ...(signals?.archetype === 'Clamp Mounted Device' ? ['support edge held between both clamp jaws'] : []),
        ...(signals?.hasInteriorTarget ? ['device remains outside while its effect points inward'] : [])
      ].filter(Boolean).join('; ')
    },
    productRules: {
      mustKeep: [...new Set([...productRuleFallback.mustKeep, ...connections])].slice(0, 8),
      forbidden: [...new Set([...productRuleFallback.forbidden, ...forbidden])].slice(0, 8)
    },
    installationRules: isMountedArchetype(signals?.archetype)
      ? {
          mountType,
          supportSurface,
          placement,
          allowed,
          relationship
        }
      : {},
    bundleRules: bundleItems.length > 0
      ? {
          includedItems: bundleItems,
          quantity: bundleQuantity,
          arrangement: referenceImages.length > 1 ? 'Supporting references may reveal additional included contents.' : ''
        }
      : {},
    appearanceRules: compactObject({
      shape: '',
      texture: '',
      pairMustMatch: false
    }),
    reference: {
      primary: 'Primary product image',
      supporting: referenceImages.length > 1 ? ['Supporting product images'] : [],
      rules: [
        'Primary reference controls appearance, structure, and accessories.',
        'Supporting references may supplement angle and detail only.'
      ]
    }
  }
}

export function normalizeProductBlueprint(value, fallbackInput) {
  const fallback = buildFallbackProductBlueprint(fallbackInput)
  const signals = fallbackInput?.signals || {}
  const candidate = value && typeof value === 'object' ? value : {}
  const getSection = (key) => (candidate[key] && typeof candidate[key] === 'object' ? candidate[key] : {})

  const identity = getSection('identity')
  const appearance = getSection('appearance')
  const structure = getSection('structure')
  const usage = getSection('usage')
  const productRules = getSection('productRules')
  const installationRules = getSection('installationRules')
  const bundleRules = getSection('bundleRules')
  const appearanceRules = getSection('appearanceRules')
  const reference = getSection('reference')
  const legacyMounting = getSection('mounting')
  const legacyRelationships = getSection('relationships')
  const normalizedArchetype = String(identity.archetype || fallback.identity.archetype).trim()
  const normalizedMainParts = sanitizeMainParts(
    structure.mainParts || structure.parts,
    fallback.structure.mainParts,
    signals
  )
  const normalizedMustKeep = normalizeStringArray(productRules.mustKeep || legacyRelationships.mustKeep, 12, 140)
  const normalizedForbidden = normalizeStringArray(productRules.forbidden || legacyMounting.forbidden, 12, 140)
  const normalizedMountType = String(
    installationRules.mountType || legacyMounting.mountType || fallback.installationRules.mountType || ''
  ).trim()
  const normalizedBundleItems = sanitizeBundleItems(
    bundleRules.includedItems,
    fallback.bundleRules.includedItems || [],
    [
      fallbackInput?.productName,
      fallbackInput?.listingInfo,
      fallbackInput?.category,
      fallbackInput?.dimensions,
      fallbackInput?.sellingPoints,
      fallbackInput?.additionalInfo,
      fallbackInput?.material
    ].join(' ')
  )
  const shouldIncludeInstallationRules =
    isMountedArchetype(normalizedArchetype) ||
    Boolean(normalizedMountType && normalizedMountType !== 'Freestanding Placement')

  return {
    identity: {
      productType: String(identity.productType || fallback.identity.productType).trim(),
      category: String(identity.category || fallback.identity.category).trim(),
      corePurpose: String(identity.corePurpose || fallback.identity.corePurpose).trim(),
      market: String(identity.market || fallback.identity.market).trim(),
      archetype: normalizedArchetype
    },
    confirmedDimensions: String(fallbackInput?.dimensions || '').trim(),
    appearance: {
      color: String(appearance.color || normalizeStringArray(appearance.primaryColor, 6).join(', ') || fallback.appearance.color).trim(),
      material: String(appearance.material || normalizeStringArray(appearance.material, 6).join(', ') || fallback.appearance.material).trim(),
      visualStyle: String(appearance.visualStyle || normalizeStringArray(appearance.distinctiveFeatures, 10).join(', ') || fallback.appearance.visualStyle).trim()
    },
    structure: {
      mainParts: normalizedMainParts,
      importantRelationships:
        normalizeStringArray(structure.importantRelationships || structure.connections, 12, 140).length > 0
          ? normalizeStringArray(structure.importantRelationships || structure.connections, 12, 140)
          : fallback.structure.importantRelationships
    },
    usage: {
      usageScenario: String(usage.usageScenario || usage.useMode || fallback.usage.usageScenario).trim(),
      userInteraction: String(
        usage.userInteraction ||
          [
            ...normalizeStringArray(usage.supportObject, 8),
            ...normalizeStringArray(usage.contactPoint, 8),
            ...normalizeStringArray(usage.spatialRelationship, 10),
            ...normalizeStringArray(usage.effectDirection, 8),
            ...normalizeStringArray(usage.requiredVisibleEvidence, 8)
          ].join('; ') ||
          fallback.usage.userInteraction
      ).trim()
    },
    productRules: {
      mustKeep: normalizedMustKeep.length > 0 ? normalizedMustKeep : fallback.productRules.mustKeep,
      forbidden: normalizedForbidden.length > 0 ? normalizedForbidden : fallback.productRules.forbidden
    },
    installationRules: shouldIncludeInstallationRules
      ? compactObject({
          mountType: normalizedMountType,
          supportSurface:
            normalizeStringArray(installationRules.supportSurface || legacyMounting.supportSurface, 8, 120).length > 0
              ? normalizeStringArray(installationRules.supportSurface || legacyMounting.supportSurface, 8, 120)
              : fallback.installationRules.supportSurface,
          placement:
            normalizeStringArray(installationRules.placement || legacyMounting.placement, 8, 120).length > 0
              ? normalizeStringArray(installationRules.placement || legacyMounting.placement, 8, 120)
              : fallback.installationRules.placement,
          allowed:
            normalizeStringArray(installationRules.allowed || legacyMounting.allowed, 10, 120).length > 0
              ? normalizeStringArray(installationRules.allowed || legacyMounting.allowed, 10, 120)
              : fallback.installationRules.allowed,
          relationship:
            normalizeStringArray(installationRules.relationship || legacyMounting.relationship, 10, 120).length > 0
              ? normalizeStringArray(installationRules.relationship || legacyMounting.relationship, 10, 120)
              : fallback.installationRules.relationship
        })
      : {},
    bundleRules: compactObject({
      includedItems: normalizedBundleItems,
      quantity: String(bundleRules.quantity || fallback.bundleRules.quantity || '').trim(),
      arrangement: String(bundleRules.arrangement || fallback.bundleRules.arrangement || '').trim()
    }),
    appearanceRules: compactObject({
      pairMustMatch: Boolean(appearanceRules.pairMustMatch),
      texture: String(appearanceRules.texture || '').trim(),
      shape: String(appearanceRules.shape || '').trim()
    }),
    reference: {
      primary: String(reference.primary || reference.primaryReference || fallback.reference.primary).trim(),
      supporting:
        normalizeStringArray(reference.supporting, 8).length > 0
          ? normalizeStringArray(reference.supporting, 8)
          : fallback.reference.supporting,
      rules:
        normalizeStringArray(reference.rules, 8).length > 0
          ? normalizeStringArray(reference.rules, 8)
          : fallback.reference.rules
    }
  }
}
