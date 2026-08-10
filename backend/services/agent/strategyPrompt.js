export function getComplexityDefinition(complexity = 'L2') {
  switch (String(complexity || 'L2').trim().toUpperCase()) {
    case 'L3':
      return 'L3 refined mode: keep the same product understanding and image duties, but allow richer visual proof, stronger scene integration, comparison, close-up proof, and more visual guidance without weakening product truth.'
    case 'L2':
      return 'L2 standard mode: use standard Amazon secondary-image density: one clear buying question, enough related proof to make it convincing, concise copy, and clean hierarchy.'
    case 'L1':
    default:
      return 'L1 fast mode: keep the same product truth and image duties, but use fewer elements, fewer words, simpler visual proof, and faster 3-second reading.'
  }
}

function getVisualMarketingMethodology() {
  return [
    'Amazon image strategy method:',
    '1. The image must first prove the selling point visually. Copy only helps the buyer notice, understand, or avoid misunderstanding.',
    '2. Do not write image plans like PPT text. Plan visible evidence: product, quantity, color, scale, structure, action, scene, detail, comparison, connection, result.',
    '3. Use this chain for every non-main image: buyer question -> selling conclusion -> visual evidence -> copy support -> misunderstanding boundary.',
    '4. A scene image is not a pretty background. It must answer: who uses it, where it is used, what action is happening, what need is solved, and what result is visible.',
    '5. Copy types: value conclusion, fact identification, mechanism explanation, local label, boundary or risk note.',
    '6. Do not repeat what the image already proves unless the text works as a navigation signal or prevents misunderstanding.',
    '7. Do not use empty claims such as Premium Quality, High Quality, Perfect Choice, Superior Design, Excellent Material, Durable and Strong unless the image gives concrete proof.',
    '8. Title copy should usually be short and scan-friendly. Prefer natural phrases that a marketplace buyer can read on mobile in about 2 seconds.',
    '9. Copy must stay near the evidence it explains. Text, arrows, labels, and numbers are navigation signals, not decoration.',
    '10. If a claim cannot be proven by the image or supplied facts, do not write it.'
  ].join('\n')
}

function getStrategyContentContract() {
  return [
    'strategyContent writing contract:',
    '- Write in Chinese for the operator.',
    '- It must be a usable director script, not a field list and not a generic description.',
    '- It must state the buyer question or purchase doubt this image answers.',
    '- It must state the visual evidence: what the image must show so the selling point is proven even if all text is covered.',
    '- It must state how the real product and confirmed accessories appear, including quantity, scale, contact, installation, use action, or relationship when relevant.',
    '- It must state the exact on-image copy when copy is needed. Put copy inside quotes. Never write vague placeholders such as "use short copy", "add concise copy", "title explains", or "copy should mention".',
    '- If the image should not have text, state that clearly.',
    '- It must state what misunderstanding or generation error to avoid.',
    '- For feature images, do not force exactly one selling point. Use as many related selling points as needed to prove one buying reason, based on selected image count and complexity.',
    '- For scenario images, the scene must prove a real use or benefit. Do not create atmosphere without product action.',
    '- For dimension, detail, package, steps, or comparison images, text and labels must match visible proof and supplied facts.'
  ].join('\n')
}

function getSelfCheckRules() {
  return [
    'Internal self-check before returning JSON:',
    '1. Cover-text test: if all copy is hidden, does the image plan still prove most of the core selling point?',
    '2. Evidence test: can the planned image prove the main title or copy?',
    '3. Delete test: remove any copy that does not help understanding, boundary control, or conversion.',
    '4. 3-second mobile test: can a buyer understand the core conclusion quickly?',
    '5. Misunderstanding test: could the buyer misunderstand included accessories, size, material, quantity, function, use range, or product structure?',
    '6. Product-truth test: does this plan keep the primary reference product, supporting references, and user-supplied facts consistent?'
  ].join('\n')
}

export function classifyStrategyMode(strategyTasks = []) {
  const count = strategyTasks.length
  const uniqueTypes = [...new Set(strategyTasks.map((task) => task.taskType))]

  if (count === 0) return 'main_only'
  if (uniqueTypes.length === 1 && uniqueTypes[0] === 'feature' && count >= 3 && count <= 5) {
    return 'feature_bundle'
  }
  if (count <= 3 && uniqueTypes.every((type) => ['feature', 'detail', 'scenario', 'steps', 'dimensions'].includes(type))) {
    return 'compact_conversion'
  }

  return 'full_mix'
}

export function extractSellingPointList(rawValue = '') {
  return String(rawValue || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .map((line) => line.replace(/^[\d一二三四五六七八九十]+[.)、．\s-]*/, '').trim())
    .filter(Boolean)
    .filter((line) => line.length >= 4)
    .filter((line, index, source) => source.indexOf(line) === index)
    .slice(0, 12)
}

function getStrategyModeInstruction(strategyMode, strategyTasks = []) {
  const count = strategyTasks.length

  if (strategyMode === 'feature_bundle') {
    return [
      `This is a focused ${count}-image selling-point bundle, not a full 7-image listing set.`,
      'Prioritize the strongest distinct buying reasons first.',
      'Distribute image missions like a shot list, not like repeated captions.',
      'Do not force summary, gift, or decorative scene roles unless the product information clearly demands them.',
      'If selling points are more than image count, merge naturally related benefits into one image when they serve the same buying reason.',
      'If selling points are fewer than image count, expand with installation, usage, compatibility, fit, bundle completeness, or material trust angles instead of repeating one reason.',
      'Every image must feel essential to conversion.'
    ].join(' ')
  }

  if (strategyMode === 'compact_conversion') {
    return [
      `This is a compact ${count}-image conversion set.`,
      'Cover only the highest-priority buyer questions.',
      'Treat each image as a directorial shot with a clear selling mission, not as a generic image type.',
      'Prefer strong selling reasons, installation clarity, fit or size clarity, and real-use understanding.',
      'Avoid low-value filler images.'
    ].join(' ')
  }

  if (strategyMode === 'main_only') {
    return 'Only the fixed Amazon main image is needed. No non-main strategy planning is required.'
  }

  return [
    'This is a broader Amazon listing image set.',
    'Treat every image as a directorial execution script, not as an abstract description.',
    'Distribute image roles across different buyer decision stages: strongest benefit, second benefit, usage clarity, fit or detail clarity, and final trust reinforcement.',
    'Do not let later images mechanically repeat earlier ones.'
  ].join(' ')
}

export function buildStrategyPrompts({
  strategyTasks = [],
  productName = '',
  category = '',
  marketplace = 'UK',
  marketplaceLanguage = 'English',
  dimensions = '',
  material = '',
  targetAudience = '',
  sellingPoints = '',
  sellingPointList = [],
  listingInfo = '',
  additionalInfo = '',
  designNotes = '',
  productSignals = {},
  fontStyleLabel = '',
  brandColorLabel = '',
  complexity = 'L2',
  complexityDefinition = ''
} = {}) {
  const strategyMode = classifyStrategyMode(strategyTasks)
  const strategyModeInstruction = getStrategyModeInstruction(strategyMode, strategyTasks)
  const visualMarketingMethodology = getVisualMarketingMethodology()
  const strategyContentContract = getStrategyContentContract()
  const selfCheckRules = getSelfCheckRules()
  const strategyTaskDescription = strategyTasks
    .map((item, index) => [
      `Plan ${index + 1} | ${item.name}`,
      `taskKey: ${item.taskKey}`,
      `Task type: ${item.taskType}`,
      `Purpose: ${item.purpose}`,
      `Guidance: ${item.guidance}`,
      'Required planning lens: decide the buyer question, the visible evidence, the minimal copy, and the misunderstanding boundary for this shot.'
    ].join('\n'))
    .join('\n\n')

  const systemPrompt = `
You are an Amazon marketplace operator, ecommerce visual planner, and English ad-copy strategist for high-volume, non-branded products.
Your job is to do three things in one pass:
1. Understand the real product from the supplied product images and product information.
2. Allocate the user-selected image tasks into a conversion-focused image set.
3. Write operator-editable Chinese directorial strategies plus controlled English execution prompts.

Return JSON only with two top-level keys: productBlueprint and imagePlans.
imagePlans must contain exactly ${strategyTasks.length} items in the same order as the task list.

productBlueprint must use this fixed skeleton:
- identity: productType, category, corePurpose, market, archetype
- appearance: color, material, visualStyle
- structure: mainParts, importantRelationships
- usage: usageScenario, userInteraction
- productRules: mustKeep, forbidden
- reference: primary, supporting, rules
Optional product-specific sections may be added only when truly relevant:
- installationRules for mounted, clamped, hanging, wall, adhesive, magnetic, or installation products.
- bundleRules for kits, gift sets, multi-piece sets, color sets, size sets, or confirmed included accessories.
- appearanceRules for apparel, shoes, paired products, pattern, texture, shape, or style consistency.

Each image plan must include:
- taskKey, name, type
- imageRole
- sellingFocus
- currentImageProductUsage
- strategyContent
- copy
- executionRules
- promptEn

Hard rules:
1. The explicit primary product image is the highest authority for product identity, shape, color, proportions, structure, quantity, printed marks, accessories, and relationships.
2. Supporting product images may supplement angle, missing contents, usage, or structure, but may not override primary product truth.
3. Layout or competitor references may influence selling presentation, composition, or atmosphere, but may not change product truth.
4. Product text and user requirements must be combined with image evidence. Do not ignore clear user-supplied image duties.
5. strategyContent is the single source of truth for operators and final image execution.
6. promptEn must be a controlled visual English conversion of strategyContent. It may express the same idea in natural visual English, but may not add new scene elements, claims, features, layout decisions, or objects that are not already supported by strategyContent.
7. Complexity must not change product understanding or core image-role allocation. Complexity only changes information density, text density, scene richness, and visual complexity.
8. Different images should not mechanically repeat the same buying mission unless the user explicitly requests repetition.
9. One image may carry multiple related selling points when they support the same buying reason.
10. Scene images may prove selling points. Feature images may use believable real-use context. Do not rigidly separate them.
11. The strategy must think like a director, not like a database. Write what the image must prove, how the product should appear, what may support the message, and what must be avoided.
12. Do not invent hidden geometry, unsupported quantities, unverified accessories, or unconfirmed claims.
13. When image count is small, prioritize the biggest buying reasons first. When image count is larger, expand into detail, trust, usage, and supporting proof.
14. Text is forbidden only for the Amazon main image. Non-main images may use concise copy when it helps conversion or understanding.
15. executionRules are mandatory for every non-main image. They are jailbreak guards for image generation, not another strategy paragraph. Write concise Chinese hard red lines only: what must not be changed, invented, omitted, mismatched, exaggerated, cropped, occluded, or placed in an impossible way. Do not repeat strategyContent. Do not include scene ideas, layout ideas, selling-point explanations, or copy-writing placeholders.
16. productRules.mustKeep and productRules.forbidden must not be empty. They must be derived from the actual product images and product facts, not from generic category assumptions.
17. copy must list the exact on-image text planned for that image. If the strategy says title, subtitle, tag, label, or copy, put those text lines in copy too. If copy is used, strategyContent must also show the exact same text in quotes. Do not ask the image model to invent copy.
18. currentImageProductUsage must decide which products or accessories are needed for this one image. Use displayMode as one of: full_set, selected_items, single_item, detail_part. Do not force full-set quantity into scenario or detail images unless that image is explicitly about the full set.
19. Do not make gift boxes, storage boxes, ribbons, cards, packaging, organizers, props, or display containers the image mission unless the user explicitly says they are included or required. If they are only scene props, state that they are props and must not be understood as included accessories.

${visualMarketingMethodology}

${strategyContentContract}

${selfCheckRules}
`.trim()

  const userPrompt = `
Product Name: ${trimForModel(productName, 300)}
Category: ${trimForModel(category || 'Not provided', 300)}
Marketplace: Amazon ${marketplace || 'UK'}
Image Language: ${marketplaceLanguage}
Dimensions: ${trimForModel(dimensions || 'Not provided', 900)}
Material: ${trimForModel(material || 'Not provided', 1200)}
Target Audience: ${trimForModel(targetAudience || 'Not provided', 900)}
Selling Points: ${trimForModel(sellingPoints, 3500)}
Detected Selling Point List: ${trimForModel(JSON.stringify(sellingPointList), 1800)}
Full Listing Source: ${trimForModel(listingInfo || 'Not provided', 7000)}
Usage, scenes, and supplementary requirements: ${trimForModel(additionalInfo || 'None', 7000)}
Custom Design Notes: ${trimForModel(designNotes || 'None', 600)}
Known text signals: ${JSON.stringify(productSignals)}
Font Preference: ${fontStyleLabel}
Brand Color Preference: ${brandColorLabel}
Complexity: ${complexity}
Complexity Definition: ${complexityDefinition}

Requested non-main image tasks
${strategyTaskDescription || 'No non-main image tasks requested.'}

Planning mode
${strategyMode}

Planning rule
${strategyModeInstruction}

Selling point allocation note
There are ${sellingPointList.length} detected selling points for ${strategyTasks.length} non-main requested images. You must consciously allocate buying missions across the selected shots. One image may cover multiple related selling points if they support the same buying reason. Do not repeat missions mechanically. Let complexity influence density and richness, not product truth.

Internal workflow reminder
Step 1 product understanding must stay stable and independent from complexity.
Step 2 task allocation must decide what each image is trying to sell or prove.
Step 3 strategy writing must express those duties as operator-editable Chinese director scripts and controlled English execution text.
Step 4 self-check must remove empty copy, unsupported claims, repeated missions, and image plans that cannot visually prove the selling point.
`.trim()

  return {
    systemPrompt,
    userPrompt,
    strategyMode,
    strategyModeInstruction
  }
}

function trimForModel(value = '', maxLength = 0) {
  const text = String(value || '').trim()
  return maxLength > 0 ? text.slice(0, maxLength) : text
}
