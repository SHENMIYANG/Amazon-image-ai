import 'dotenv/config'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import FormData from 'form-data'

const apiKey = process.env.IMAGE_GEN_API_KEY || process.env.OPENAI_API_KEY
const baseUrl = process.env.IMAGE_GEN_BASE_URL || process.env.OPENAI_BASE_URL
const model = process.env.IMAGE_GENERATION_MODEL || process.env.OPENAI_MODEL || 'gpt-image-2'
const requestedSize = '2048x2048'

const prompt = [
  'Create a clean Amazon-style product hero image.',
  'Show a modern insulated stainless steel water bottle centered on a pure white background.',
  'The bottle should be fully visible, sharp, realistic, evenly lit, and suitable for ecommerce.',
  'No extra props, no text, no logo, no watermark, no cropping.'
].join(' ')

if (!apiKey || !baseUrl) {
  console.error('Missing image generation config in backend/.env')
  process.exit(1)
}

const outputDir = path.join(process.cwd(), 'test-output')
fs.mkdirSync(outputDir, { recursive: true })

function readImageDimensions(buffer) {
  const png = readPngDimensions(buffer)
  if (png.width && png.height) return png

  const jpeg = readJpegDimensions(buffer)
  if (jpeg.width && jpeg.height) return jpeg

  const webp = readWebpDimensions(buffer)
  if (webp.width && webp.height) return webp

  return { width: null, height: null, format: 'unknown' }
}

function readPngDimensions(buffer) {
  const pngSignature = '89504e470d0a1a0a'
  const isPng = buffer.length >= 24 && buffer.subarray(0, 8).toString('hex') === pngSignature
  if (!isPng) return { width: null, height: null, format: null }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    format: 'png'
  }
}

function readJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return { width: null, height: null, format: null }
  }

  let offset = 2
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }

    const marker = buffer[offset + 1]
    const segmentLength = buffer.readUInt16BE(offset + 2)
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)

    if (isStartOfFrame) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
        format: 'jpeg'
      }
    }

    offset += 2 + segmentLength
  }

  return { width: null, height: null, format: null }
}

function readWebpDimensions(buffer) {
  const isWebp =
    buffer.length >= 16 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'

  if (!isWebp) return { width: null, height: null, format: null }

  const chunkType = buffer.subarray(12, 16).toString('ascii')

  if (chunkType === 'VP8X' && buffer.length >= 30) {
    const width = 1 + buffer.readUIntLE(24, 3)
    const height = 1 + buffer.readUIntLE(27, 3)
    return { width, height, format: 'webp' }
  }

  return { width: null, height: null, format: 'webp' }
}

async function main() {
  console.log('Testing text-only 2K generation...')
  console.log(`Base URL: ${baseUrl}`)
  console.log(`Model: ${model}`)
  console.log(`Requested size: ${requestedSize}`)

  const form = new FormData()
  form.append('model', model)
  form.append('prompt', prompt)
  form.append('size', requestedSize)
  form.append('n', '1')
  form.append('response_format', 'b64_json')

  const startedAt = Date.now()
  const response = await axios.post(`${baseUrl}/images/generations`, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${apiKey}`
    },
    timeout: Number(process.env.IMAGE_GEN_TIMEOUT_MS || 300000)
  })

  const elapsedMs = Date.now() - startedAt
  const item = response.data?.data?.[0]
  const b64 = item?.b64_json

  if (!b64) {
    throw new Error('No b64_json found in response')
  }

  const imageBuffer = Buffer.from(b64, 'base64')
  const dims = readImageDimensions(imageBuffer)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const imageName = `text-2k-${stamp}.${dims.format === 'jpeg' ? 'jpg' : dims.format || 'png'}`
  const imagePath = path.join(outputDir, imageName)
  fs.writeFileSync(imagePath, imageBuffer)

  const report = {
    endpoint: `${baseUrl}/images/generations`,
    model,
    requestedSize,
    actualSize: dims.width && dims.height ? `${dims.width}x${dims.height}` : null,
    format: dims.format,
    elapsedMs,
    createdAt: new Date().toISOString(),
    prompt
  }

  const reportPath = path.join(outputDir, `text-2k-${stamp}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log('Done.')
  console.log(`Actual size: ${report.actualSize || 'unknown'}`)
  console.log(`Image saved to: ${imagePath}`)
  console.log(`Report saved to: ${reportPath}`)
}

main().catch((error) => {
  console.error('2K text generation test failed.')
  console.error(error.response?.data || error.message)
  process.exit(1)
})
