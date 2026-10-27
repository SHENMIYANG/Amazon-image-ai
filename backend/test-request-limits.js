import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import { concurrencyLimit, rateLimit } from './services/security/requestLimits.js'

function response() {
  const res = new EventEmitter()
  res.statusCode = 200
  res.headers = {}
  res.set = (name, value) => { res.headers[name] = value }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; res.emit('finish'); return res }
  return res
}

function invoke(middleware, req = {}) {
  const res = response()
  let nextCalled = false
  middleware(req, res, () => { nextCalled = true })
  return { res, nextCalled }
}

const loginLimit = rateLimit({ name: 'test-login', max: 2, windowMs: 60_000, key: () => 'user' })
assert.equal(invoke(loginLimit).nextCalled, true)
assert.equal(invoke(loginLimit).nextCalled, true)
const rejectedLogin = invoke(loginLimit)
assert.equal(rejectedLogin.res.statusCode, 429)

const requestLimit = concurrencyLimit({ name: 'test-model', max: 1, key: () => 'user' })
const firstRequest = invoke(requestLimit)
assert.equal(firstRequest.nextCalled, true)
const rejectedRequest = invoke(requestLimit)
assert.equal(rejectedRequest.res.statusCode, 429)
firstRequest.res.emit('finish')
assert.equal(invoke(requestLimit).nextCalled, true)

const disconnected = invoke(concurrencyLimit({ name: 'test-disconnect', max: 1, key: () => 'user' }))
disconnected.res.emit('close')
assert.equal(invoke(concurrencyLimit({ name: 'test-disconnect', max: 1, key: () => 'user' })).res.statusCode, 429)
disconnected.res.locals.releaseModelRequest()
assert.equal(invoke(concurrencyLimit({ name: 'test-disconnect', max: 1, key: () => 'user' })).nextCalled, true)

const deploy = fs.readFileSync(new URL('../scripts/server-deploy.sh', import.meta.url), 'utf8')
const statusLocations = [...deploy.matchAll(/location ~ \^\/api\/\(agent-analyze\|generate\)\/status\/ \{([\s\S]*?)\n    \}/g)]
assert.equal(statusLocations.length, 2, 'HTTP and HTTPS must both separate status polling from paid requests')
for (const match of statusLocations) {
  assert.match(match[1], /zone=amazon_status_limit/)
  assert.doesNotMatch(match[1], /zone=amazon_api_limit/)
  assert.ok(deploy.indexOf('location ~ ^/api/(upload|', match.index) > match.index, 'Polling must match before the broad model location')
}
assert.match(deploy, /zone=amazon_status_limit:10m rate=600r\/m/)

console.log('request limit tests passed')
