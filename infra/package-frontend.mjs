#!/usr/bin/env node
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const usage = 'Usage: node infra/package-frontend.mjs --mode demo|live [--api-base-url https://api.example.com/api]'
function fail(message) { console.error(message); process.exit(1) }

let mode
let apiBaseUrl = ''
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--mode') mode = args[++i]
  else if (args[i] === '--api-base-url') apiBaseUrl = args[++i]
  else fail(usage)
}
if (!['demo', 'live'].includes(mode) || typeof apiBaseUrl !== 'string') fail(usage)
if (mode === 'demo' && apiBaseUrl) fail('A demo release uses sample data. Omit --api-base-url.')
if (apiBaseUrl) {
  let url
  try { url = new URL(apiBaseUrl) } catch { fail('Use an absolute HTTPS API URL ending in /api.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || url.pathname.replace(/\/$/, '') !== '/api') {
    fail('The API URL must be HTTPS, end in /api and contain no credentials, query or fragment.')
  }
  apiBaseUrl = apiBaseUrl.replace(/\/$/, '')
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const build = spawnSync(npm, ['run', 'build'], {
  cwd: join(repo, 'frontend'),
  env: { ...process.env, VITE_DEMO_MODE: String(mode === 'demo'), VITE_API_BASE_URL: apiBaseUrl },
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
if (build.error || build.status !== 0) fail('Frontend build failed. No release was packaged.')

const source = join(repo, 'frontend', 'dist')
await readFile(join(source, 'index.html'), 'utf8')
const output = join(repo, 'infra', 'dist')
await mkdir(output, { recursive: true })
const release = await mkdtemp(join(output, `causeconnect-${mode}-`))
const site = join(release, 'site')
await cp(source, site, { recursive: true })
const git = (...gitArgs) => {
  const result = spawnSync('git', gitArgs, { cwd: repo, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}
await writeFile(join(site, 'release.json'), `${JSON.stringify({
  application: 'CauseConnect',
  mode,
  apiBaseUrl: apiBaseUrl || '/api',
  builtAt: new Date().toISOString(),
  commit: git('rev-parse', 'HEAD'),
  includesLocalChanges: Boolean(git('status', '--porcelain', '--untracked-files=normal')),
}, null, 2)}\n`)

const archive = join(release, 'causeconnect-frontend.zip')
const zip = spawnSync('zip', ['-qr', archive, '.'], { cwd: site, encoding: 'utf8' })
console.log(`\nRelease mode: ${mode}\nSite folder: ${site}`)
if (zip.status === 0) console.log(`Archive: ${archive}`)
else console.log('No zip tool was available. Compress the contents of the site folder, keeping index.html at the archive root.')
console.log('Local files created only; this command did not deploy to AWS.')
