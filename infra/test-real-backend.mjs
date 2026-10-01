#!/usr/bin/env node
// Opt-in integration check. Creates and removes only its own disposable MySQL container.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createInterface } from 'node:readline'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const backend = path.join(root, 'backend')
const frontend = path.join(root, 'frontend')
const backendRequire = createRequire(path.join(backend, 'package.json'))
const frontendRequire = createRequire(path.join(frontend, 'package.json'))
const tag = randomBytes(6).toString('hex')
const name = `causeconnect-regression-${tag}`
const password = randomBytes(24).toString('hex')
const database = `cc_frontend_${tag}_test`
let containerId
let server
let db
let cleaning
let dockerEndpoint
let vite
let input
const browserMode = process.argv.length === 3 && process.argv[2] === '--browser'

function command(program, args, { cwd = root, env = process.env, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd, env, stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'] })
    let output = ''
    let error = ''
    if (capture) {
      child.stdout.on('data', chunk => { output += chunk })
      child.stderr.on('data', chunk => { error += chunk })
    }
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error(`${program} exited ${code}${error ? `: ${error.trim()}` : ''}`)))
  })
}

async function resolveLocalDockerEndpoint() {
  // DOCKER_CONTEXT takes precedence over DOCKER_HOST in the Docker CLI.
  const context = process.env.DOCKER_CONTEXT
  const endpoint = !context && process.env.DOCKER_HOST
    ? process.env.DOCKER_HOST
    : await command('docker', ['context', 'inspect', ...(context ? [context] : []), '--format', '{{.Endpoints.docker.Host}}'], { capture: true })
  // A remote daemon's loopback binding would not be local to this machine.
  // Permit only local Unix sockets and Windows local named pipes, never TCP/SSH.
  if (!/^unix:\/\/\/[^?#\x00-\x1f]+$/.test(endpoint)
    && !/^npipe:\/\/\/\/\.\/pipe\/[^/\\?#\x00-\x1f]+$/i.test(endpoint)) {
    throw new Error('Real-backend regression requires a local Docker Unix socket or local Windows named pipe. Remote/TCP/SSH Docker endpoints are refused.')
  }
  return endpoint
}

function docker(args, options = {}) {
  if (!dockerEndpoint) throw new Error('Docker endpoint has not passed the local-only check.')
  const env = { ...(options.env || process.env) }
  // Pin all operations, including cleanup, to the endpoint checked above. Do not
  // let a context/environment switch later in the run redirect container work.
  for (const key of ['DOCKER_CONTEXT', 'DOCKER_HOST', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'DOCKER_TLS']) delete env[key]
  return command('docker', ['--host', dockerEndpoint, ...args], { ...options, env })
}

async function cleanup() {
  if (cleaning) return cleaning
  cleaning = (async () => {
    const failures = []
    async function attempt(label, close) {
      try { await close() }
      catch (error) { failures.push(`${label}: ${String(error?.message || error).replaceAll(password, '[redacted]')}`) }
    }
    if (input) await attempt('terminal input', () => input.close())
    if (vite) await attempt('Vite server', () => vite.close())
    if (server) {
      await attempt('Express connections', () => server.closeAllConnections())
      await attempt('Express server', () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
    }
    if (db) await attempt('Sequelize connection', () => db.sequelize.close())
    if (containerId) {
      await attempt('disposable database container', async () => {
        if (!/^[a-f0-9]{64}$/.test(containerId)) throw new Error('Invalid container ID; refusing removal. Check this run’s printed name and ownership label manually.')
        const label = await docker(['inspect', '--format', '{{ index .Config.Labels "causeconnect.regression.run" }}', containerId], { capture: true })
        if (label !== tag) throw new Error('Container ownership check failed; refusing removal.')
        await docker(['rm', '--force', '--volumes', containerId], { capture: true })
        console.log('Removed this run’s disposable database container. Existing databases were not touched.')
      })
    }
    if (failures.length) throw new Error(failures.join('\n'))
  })()
  return cleaning
}

async function stop(signal) {
  try {
    await cleanup()
    process.exit(signal === 'SIGINT' ? 130 : 143)
  } catch (error) {
    console.error(`Cleanup needs attention: ${error.message}`)
    process.exit(1)
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop(signal))

async function browserFixture(env) {
  const fixturePassword = `Browser-${randomBytes(10).toString('hex')}!`
  const bcrypt = backendRequire('bcrypt')
  const passwordHash = await bcrypt.hash(fixturePassword, 10)
  const accounts = []
  for (const role of ['public', 'business_owner', 'admin']) {
    const user = await db.User.create({ fullName: `Browser ${role}`, email: `${role}-${tag}@example.test`, passwordHash, role, status: 'active' })
    accounts.push({ id: user.userId, email: user.email, role: user.role })
  }
  const category = await db.Category.create({ categoryName: `Browser Education ${tag}` })
  const campaigns = []
  for (const status of ['approved', 'pending']) {
    const campaign = await db.Campaign.create({ title: `Browser ${status} ${tag}`, description: `Disposable ${status} campaign for browser regression.`, categoryId: category.categoryId, createdBy: accounts[0].id, status })
    campaigns.push({ id: campaign.campaignId, title: campaign.title, status })
  }
  const { createServer } = await import(pathToFileURL(frontendRequire.resolve('vite')).href)
  const { default: react } = await import(pathToFileURL(frontendRequire.resolve('@vitejs/plugin-react')).href)
  // Ignore project config and .env files: this browser must never use demo mode,
  // the usual backend on port 3000, or a previously configured remote API.
  env.VITE_API_BASE_URL = '/api'
  process.env.VITE_API_BASE_URL = '/api'
  vite = await createServer({
    root: frontend,
    configFile: false,
    envDir: false,
    plugins: [react()],
    define: {
      'import.meta.env.VITE_DEMO_MODE': JSON.stringify('false'),
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api'),
    },
    cacheDir: path.join(frontend, 'node_modules', '.vite-browser-regression', tag),
    server: {
      host: '127.0.0.1', port: 0, strictPort: true,
      proxy: { '/api': { target: `http://127.0.0.1:${server.address().port}`, changeOrigin: true } },
    },
  })
  await vite.listen()
  const address = vite.httpServer.address()
  if (!address || typeof address === 'string' || address.address !== '127.0.0.1') throw new Error('Browser fixture did not bind to loopback.')
  console.log('Browser fixture ready. These accounts exist only in this disposable database:')
  console.log(JSON.stringify({ frontendUrl: `http://127.0.0.1:${address.port}`, run: tag, password: fixturePassword, accounts, category: { id: category.categoryId, name: category.categoryName }, campaigns }, null, 2))
  console.log('Actual frontend and Express/MySQL are running. Missing Stage 3 APIs are still missing; this is not sample mode.')
  console.log('Enter inspect for a safe database readback, or press Ctrl+C to stop and remove this run’s fixture.')
  input = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) })
  input.on('SIGINT', () => stop('SIGINT'))
  let inspecting = false
  input.on('line', async line => {
    if (line.trim() !== 'inspect') {
      if (line.trim()) console.log('Only the read-only inspect command is supported. Press Ctrl+C to stop.')
      return
    }
    if (inspecting || cleaning) return
    inspecting = true
    try {
      if (db.sequelize.config.database !== database || db.sequelize.config.host !== '127.0.0.1' || env.CAUSECONNECT_TEST_RUN !== tag) throw new Error('Disposable database readback guard failed.')
      const users = await db.User.scope('withPassword').findAll({ order: [['userId', 'ASC']] })
      const records = await db.Campaign.findAll({ order: [['campaignId', 'ASC']] })
      const sessions = await db.UserSession.findAll({ attributes: ['userId', 'status'] })
      console.log(JSON.stringify({
        run: tag,
        users: users.map(user => ({ id: user.userId, role: user.role, status: user.status, passwordHashed: /^\$2[aby]\$\d\d\$/.test(user.passwordHash) })),
        campaigns: records.map(record => ({ id: record.campaignId, title: record.title, status: record.status, userId: record.createdBy })),
        sessions: sessions.map(session => ({ userId: session.userId, status: session.status })),
      }, null, 2))
    } catch (error) { console.error(`Fixture readback failed: ${error.message.replaceAll(password, '[redacted]')}`) }
    finally { inspecting = false }
  })
  // Signal handlers own cleanup. Keeping the same process alive retains the
  // endpoint pin and the ownership label needed for safe container removal.
  await new Promise(() => {})
}

try {
  if (process.argv.length > 2 && !browserMode) throw new Error('Only --browser is accepted. This runner accepts no remote database, credentials, host or API arguments.')
  dockerEndpoint = await resolveLocalDockerEndpoint()
  await docker(['info', '--format', '{{.ServerVersion}}'], { capture: true })
  try {
    await docker(['image', 'inspect', 'mysql:8', '--format', '{{.Id}}'], { capture: true })
  } catch {
    throw new Error('Official mysql:8 is not cached. Run docker pull mysql:8 yourself, then retry. The runner does not download images.')
  }
  const dockerEnv = { ...process.env, MYSQL_ROOT_PASSWORD: randomBytes(24).toString('hex'), MYSQL_PASSWORD: password }
  console.log(`Starting isolated MySQL test container ${name} (loopback only; temporary storage).`)
  containerId = await docker([
    'run', '--detach', '--pull=never', '--name', name,
    '--label', `causeconnect.regression.run=${tag}`,
    '--publish', '127.0.0.1::3306', '--tmpfs', '/var/lib/mysql:rw,size=512m',
    '--env', 'MYSQL_ROOT_PASSWORD', '--env', 'MYSQL_PASSWORD',
    '--env', 'MYSQL_USER=cc_test', '--env', `MYSQL_DATABASE=${database}`, 'mysql:8',
  ], { env: dockerEnv, capture: true })
  if (!/^[a-f0-9]{64}$/.test(containerId)) throw new Error('Docker did not return a container ID.')
  const binding = await docker(['port', containerId, '3306/tcp'], { capture: true })
  const port = /^127\.0\.0\.1:(\d+)$/.exec(binding)?.[1]
  if (!port) throw new Error('Refusing a database port that is not bound only to 127.0.0.1.')
  const env = {
    ...process.env, NODE_ENV: 'test', RUN_DB_INTEGRATION: '1', RUN_REAL_BACKEND_TESTS: '1',
    CAUSECONNECT_TEST_RUN: tag, DB_HOST: '127.0.0.1', DB_PORT: port,
    DB_USER: 'cc_test', DB_PASSWORD: password, DB_NAME: `cc_frontend_${tag}_unused`,
    DB_NAME_TEST: database, JWT_SECRET: randomBytes(48).toString('hex'),
    VITE_DEMO_MODE: 'false',
  }
  const mysql = backendRequire('mysql2/promise')
  let ready = false
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const connection = await mysql.createConnection({ host: env.DB_HOST, port: Number(port), user: env.DB_USER, password, database, connectTimeout: 1000 })
      await connection.query('SELECT 1')
      await connection.end()
      ready = true
      break
    } catch { await new Promise(resolve => setTimeout(resolve, 1000)) }
  }
  if (!ready) throw new Error('Disposable MySQL did not become ready within 90 seconds.')
  console.log('Applying repository migrations to the empty test database.')
  await command(process.execPath, [backendRequire.resolve('sequelize-cli/lib/sequelize'), 'db:migrate'], { cwd: backend, env })
  if (!browserMode) {
    await command(process.execPath, ['--test', 'test/unit/*.test.js'], { cwd: backend, env })
    await command(process.execPath, ['--test', 'test/integration/*.test.js'], { cwd: backend, env })
  }
  Object.assign(process.env, env)
  db = backendRequire('./src/database/models')
  db.sequelize.options.logging = false
  const app = backendRequire('./src/app')
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve) })
  if (browserMode) await browserFixture(env)
  env.VITE_API_BASE_URL = `http://127.0.0.1:${server.address().port}/api`
  console.log('Testing actual frontend components and services against Express and MySQL (jsdom, native HTTP fetch; no API mocks).')
  await command(process.execPath, [path.join(frontend, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.real-backend.config.js'], { cwd: frontend, env })
  console.log('Real-backend regression passed. Missing Stage 3 endpoints are not implemented or certified by this check.')
} catch (error) {
  console.error(error.message.replaceAll(password, '[redacted]'))
  process.exitCode = 1
} finally {
  try { await cleanup() } catch (error) { console.error(`Cleanup needs attention: ${error.message}`); process.exitCode = 1 }
}
