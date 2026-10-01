import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const scope = {}
runInNewContext(readFileSync(new URL('./preview-routing.js', import.meta.url), 'utf8'), scope)
const route = (uri, method = 'GET') => scope.handler({ request: { uri, method } })

test('all application links and refreshes receive the SPA', () => {
  for (const uri of ['/', '/login', '/register/', '/logout', '/campaigns/1', '/campaigns/new', '/my-campaigns', '/my-campaigns/4/edit', '/my-participation', '/business/profile', '/business/enquiries', '/business/campaigns/new', '/admin/users', '/admin/campaigns', '/admin/campaigns/4']) {
    assert.equal(route(uri).uri, '/index.html', uri)
    assert.equal(route(uri, 'HEAD').uri, '/index.html', uri)
  }
})
test('API paths return explicit JSON 503, never SPA HTML', () => {
  for (const uri of ['/api', '/api/campaigns', '/api/auth/login']) {
    for (const method of ['GET', 'POST']) {
      const result = route(uri, method)
      assert.equal(result.statusCode, 503)
      assert.equal(JSON.parse(result.body).code, 'API_NOT_READY')
      assert.equal(result.headers['cache-control'].value, 'no-store')
    }
  }
})
test('asset and unknown paths remain origin requests', () => {
  for (const uri of ['/assets/app.js', '/images/brand/causeconnect-logo.png', '/missing', '/admin/campaigns/4/extra', '/apiculture']) assert.equal(route(uri).uri, uri)
})
test('non-API writes cannot reach the static origin', () => {
  assert.equal(route('/campaigns/new', 'POST').statusCode, 405)
})
