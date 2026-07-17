import assert from 'node:assert/strict'
import sharp from 'sharp'
import { buildAmazonPrompt, normalizeAmazonMainImage } from './routes/generate.js'

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
    productBlueprint: {
      identity: {
        productType: 'Clamp reptile heat lamp',
        archetype: 'Clamp Mounted Device'
      },
      appearance: { primaryColor: ['black', 'silver'] },
      structure: {
        parts: ['lamp head', 'gooseneck', 'clamp'],
        connections: ['lamp head connected to gooseneck', 'gooseneck connected to clamp']
      },
      mounting: {
        mountType: 'clamp',
        supportSurface: ['vertical glass wall edge'],
        connectionType: 'mechanical grip'
      },
      usage: {
        useMode: 'mounted outside a terrarium',
        supportObject: ['vertical glass wall edge'],
        contactPoint: ['glass edge held between both clamp jaws'],
        spatialRelationship: ['clamp and lamp remain outside the tank'],
        effectDirection: ['lamp head points down toward the basking platform inside'],
        requiredVisibleEvidence: ['both jaws contact opposite sides of the glass edge'],
        forbiddenSpatialRelations: ['clamp penetrating glass', 'clamp parallel to glass without gripping']
      }
    }
  }
  const plan = {
    taskType: 'scenario',
    goal: 'Explain correct installation',
    layout: 'Three-quarter tank corner with the mounting contact fully visible',
    focus: 'mounting contact',
    constraints: ['show the contact point'],
    successCriteria: ['the complete grip is readable without obstruction'],
    failureCriteria: ['the support edge disappears inside the clamp body'],
    promptHint: 'STALE SHORT HINT',
    executionPrompt: 'Use the translated detailed installation direction'
  }
  const prompt = buildAmazonPrompt(listing, plan, 'L1', '2048x2048', '/uploads/main.png')

  assert.match(prompt, /glass edge held between both clamp jaws/)
  assert.match(prompt, /clamp and lamp remain outside the tank/)
  assert.match(prompt, /clamp penetrating glass/)
  assert.match(prompt, /Required scene layout: Three-quarter tank corner/)
  assert.match(prompt, /image is valid only if all success criteria/)
  assert.match(prompt, /Use the translated detailed installation direction/)
  assert.doesNotMatch(prompt, /STALE SHORT HINT/)
  assert.ok(prompt.length < 4000, `scenario prompt is too long: ${prompt.length}`)
}

await testMainImageNormalization()
testScenarioUsageContract()
console.log('generation pipeline tests passed')
