import crypto from 'crypto'

const KEY_LENGTH = 64

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

export async function hashPassword(password) {
  const value = String(password || '')
  if (value.length < 8) {
    const error = new Error('密码至少需要 8 个字符。')
    error.status = 400
    throw error
  }

  const salt = crypto.randomBytes(16).toString('hex')
  const derivedKey = await scryptAsync(value, salt)
  return `scrypt$${salt}$${derivedKey.toString('hex')}`
}

export async function verifyPassword(password, passwordHash) {
  const [algorithm, salt, storedKey] = String(passwordHash || '').split('$')
  if (algorithm !== 'scrypt' || !salt || !storedKey) return false

  const derivedKey = await scryptAsync(String(password || ''), salt)
  const expected = Buffer.from(storedKey, 'hex')
  return expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey)
}
