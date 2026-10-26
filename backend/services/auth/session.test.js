import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setSessionCookie, clearSessionCookie } from './session.js'

test('session cookies use the same security flag for login and logout', () => {
  const previousMode = process.env.NODE_ENV
  const previousFlag = process.env.AUTH_COOKIE_SECURE
  try {
    for (const [mode, flag, expected] of [
      ['production', undefined, true],
      ['production', 'false', false],
      ['production', 'true', true],
      ['production', 'invalid', true],
      ['development', undefined, false],
      ['development', 'true', true]
    ]) {
      process.env.NODE_ENV = mode
      if (flag === undefined) delete process.env.AUTH_COOKIE_SECURE
      else process.env.AUTH_COOKIE_SECURE = flag
      const headers = []
      const res = { append: (name, value) => {
        assert.equal(name, 'Set-Cookie')
        headers.push(value)
      } }
      setSessionCookie(res, 'test-token', new Date('2030-01-01T00:00:00Z'))
      clearSessionCookie(res)
      assert.equal(headers.length, 2)
      for (const header of headers) {
        assert.equal(header.split('; ').includes('Secure'), expected, `${mode}/${flag}`)
        assert.ok(header.includes('HttpOnly; SameSite=Lax'))
        assert.ok(header.includes('Path=/'))
      }
      assert.ok(headers[1].includes('Expires=Thu, 01 Jan 1970'))
    }
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousMode
    if (previousFlag === undefined) delete process.env.AUTH_COOKIE_SECURE
    else process.env.AUTH_COOKIE_SECURE = previousFlag
  }
})
