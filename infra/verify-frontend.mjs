#!/usr/bin/env node
// Read-only checks: no sign-in, submissions, uploads or database changes.
const args = process.argv.slice(2)
const usage = 'Usage: node infra/verify-frontend.mjs https://SITE --api unavailable|available [--api-base-url https://API/api]'
let site
try { site = new URL(args.shift()) } catch { console.error(usage); process.exit(1) }
if (!['http:', 'https:'].includes(site.protocol) || site.username || site.password || site.search || site.hash) {
  console.error(usage); process.exit(1)
}
let expectation
let apiBase = new URL('/api', site)
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--api') expectation = args[++i]
  else if (args[i] === '--api-base-url') {
    try { apiBase = new URL(args[++i]) } catch { console.error(usage); process.exit(1) }
  } else { console.error(usage); process.exit(1) }
}
if (!['unavailable', 'available'].includes(expectation)
  || !['https:', 'http:'].includes(apiBase.protocol) || apiBase.username || apiBase.password
  || apiBase.search || apiBase.hash) {
  console.error(usage); process.exit(1)
}

let failures = 0
async function check(path, predicate, description, binary = false) {
  const url = new URL(path, site)
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' })
    const body = binary ? new Uint8Array(await response.arrayBuffer()) : await response.text()
    if (!predicate(response, body)) throw new Error(`unexpected HTTP ${response.status} or response content`)
    console.log(`PASS ${description}`)
    return body
  } catch (error) {
    failures += 1
    console.error(`FAIL ${description}: ${error.message}`)
    return ''
  }
}

const routes = [
  '/', '/login', '/register', '/logout', '/campaigns/1', '/campaigns/new',
  '/business/campaigns/new', '/business/profile', '/my-campaigns', '/my-campaigns/1/edit',
  '/my-participation', '/business/enquiries', '/admin/campaigns', '/admin/campaigns/5', '/admin/users',
]
let homepage = ''
for (const path of routes) {
  const body = await check(path, (response, html) => response.status === 200
    && response.headers.get('content-type')?.includes('text/html') && html.includes('id="root"'), `SPA entry ${path}`)
  if (path === '/') homepage = body
}
const assets = [...homepage.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)].map((match) => match[1])
if (!assets.length) { failures += 1; console.error('FAIL No JavaScript or CSS references found in the homepage.') }
for (const asset of [...new Set(assets)]) {
  await check(asset, (response, body) => response.status === 200
    && !response.headers.get('content-type')?.includes('text/html') && body.length > 0, `Asset ${asset}`)
}
await check('/images/brand/causeconnect-logo.png', (response, bytes) => response.status === 200
  && response.headers.get('content-type')?.includes('image/png') && bytes.length > 8
  && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte), 'Team logo PNG', true)
await check(`${apiBase.href.replace(/\/$/, '')}/campaigns?page=1&pageSize=1`, (response, body) => {
  if (!response.headers.get('content-type')?.includes('application/json')) return false
  let json
  try { json = JSON.parse(body) } catch { return false }
  return expectation === 'unavailable'
    ? response.status === 503 && json.code === 'API_NOT_READY'
    : response.status === 200 && Array.isArray(json.campaigns)
}, `Public campaign API: ${expectation}`)

if (failures) { console.error(`\n${failures} check(s) failed.`); process.exitCode = 1 }
else console.log('\nHosting checks passed. Complete browser and API integration checks before release.')
