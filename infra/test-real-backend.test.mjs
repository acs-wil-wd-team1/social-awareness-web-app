import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const runner = fileURLToPath(new URL('./test-real-backend.mjs', import.meta.url))

test('browser mode refuses a closed/noninteractive terminal before starting Docker', () => {
  const result = spawnSync(process.execPath, [runner, '--browser'], { encoding: 'utf8', input: '', timeout: 5000 })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /require an interactive terminal/)
  assert.doesNotMatch(result.stdout, /Starting isolated|Browser fixture ready/)
})

test('unknown runner flags are rejected before any database setup', () => {
  const result = spawnSync(process.execPath, [runner, '--remote', 'example.test'], { encoding: 'utf8', input: '', timeout: 5000 })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Only --browser is accepted/)
  assert.doesNotMatch(result.stdout, /Starting isolated|Browser fixture ready/)
})
