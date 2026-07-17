import 'dotenv/config'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import FormData from 'form-data'
import zlib from 'zlib'

const apiKey = process.env.IMAGE_GEN_API_KEY || process.env.OPENAI_API_KEY
const baseUrl = process.env.IMAGE_GEN_BASE_URL || process.env.OPENAI_BASE_URL
const model = process.env.IMAGE_GENERATION_MODEL || process.env.OPENAI_MODEL || 'gpt-image-2'
const requestedSize = '2048x2048'

const prompt = [
  'Create a refined Amazon product hero image based on the reference image.',
  'Keep the product identity, shape, proportions, and key appearance consistent with the reference.',
  'Place the product on a clean pure white background with bright ecommerce lighting.',
  'Keep the full product visible, sharp, realistic, and centered.',
  'No text, no logo, no watermark, no extra props, no cropping.'
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

function createTransparentMaskPng(width, height) {
  const bytesPerPixel = 4
  const stride = width * bytesPerPixel
  const raw = Buffer.alloc((stride + 1) * height, 0)

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
  }

  const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex')
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const idat = zlib.deflateSync(raw)

  return Buffer.concat([
    pngSignature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const lengthBuffer = Buffer.alloc(4)
  lengthBuffer.writeUInt32BE(data.length, 0)

  const crcBuffer = Buffer.alloc(4)
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer])
}

let crcTable = null

function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
      }
      crcTable[n] = c >>> 0
    }
  }

  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
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

function findReferenceImage() {
  const uploadsDir = path.join(process.cwd(), 'uploads')
  const candidates = fs.readdirSync(uploadsDir)
    .map((name) => path.join(uploadsDir, name))
    .filter((filePath) => fs.statSync(filePath).isFile())

  for (const filePath of candidates) {
    const buffer = fs.readFileSync(filePath)
    const dims = readImageDimensions(buffer)
    if (dims.width === 2048 && dims.height === 2048) {
      return { filePath, ...dims }
    }
  }

  throw new Error('No 2048x2048 reference image found in backend/uploads')
}

async function main() {
  const ref = findReferenceImage()

  console.log('Testing image-to-image 2K generation...')
  console.log(`Base URL: ${baseUrl}`)
  console.log(`Model: ${model}`)
  console.log(`Requested size: ${requestedSize}`)
  console.log(`Reference image: ${ref.filePath}`)
  console.log(`Reference size: ${ref.width}x${ref.height}`)

  const form = new FormData()
  form.append('model', model)
  form.append('image', fs.createReadStream(ref.filePath), {
    filename: path.basename(ref.filePath),
    contentType: 'image/png'
  })
  form.append('mask', createTransparentMaskPng(ref.width, ref.height), {
    filename: 'mask.png',
    contentType: 'image/png'
  })
  form.append('prompt', prompt)
  form.append('size', requestedSize)
  form.append('quality', 'high')
  form.append('n', '1')
  form.append('response_format', 'b64_json')
  form.append('output_format', 'png')

  const startedAt = Date.now()
  const response = await axios.post(`${baseUrl}/images/edits`, form, {
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
  const imageName = `edit-2k-${stamp}.${dims.format === 'jpeg' ? 'jpg' : dims.format || 'png'}`
  const imagePath = path.join(outputDir, imageName)
  fs.writeFileSync(imagePath, imageBuffer)

  const report = {
    endpoint: `${baseUrl}/images/edits`,
    model,
    requestedSize,
    actualSize: dims.width && dims.height ? `${dims.width}x${dims.height}` : null,
    format: dims.format,
    elapsedMs,
    createdAt: new Date().toISOString(),
    referenceImage: path.basename(ref.filePath),
    referenceSize: `${ref.width}x${ref.height}`,
    prompt
  }

  const reportPath = path.join(outputDir, `edit-2k-${stamp}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log('Done.')
  console.log(`Actual size: ${report.actualSize || 'unknown'}`)
  console.log(`Image saved to: ${imagePath}`)
  console.log(`Report saved to: ${reportPath}`)
}

main().catch((error) => {
  console.error('2K image edit test failed.')
  console.error(error.response?.data || error.message)
  process.exit(1)
})
