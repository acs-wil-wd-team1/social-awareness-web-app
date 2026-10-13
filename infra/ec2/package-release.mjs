#!/usr/bin/env node
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { basename, dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options })
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.error || result.status}`)
  return result.stdout?.trim() || ''
}
const git = (...args) => run('git', args)
if (git('status', '--porcelain', '--untracked-files=normal')) throw new Error('Commit reviewed changes before packaging a release. No dirty or untracked source is accepted.')
const commit = git('rev-parse', 'HEAD')
const releaseId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${commit.slice(0, 12)}`
const output = join(root, 'infra/dist')
await mkdir(output, { recursive: true })
const folder = await mkdtemp(join(output, 'ec2-release-'))
const source = join(folder, 'source')
await mkdir(source)
run('node', ['infra/package-frontend.mjs', '--mode', 'live'], { stdio: 'inherit' })
// Explicit allowlist: never package environment files, dependencies, private keys,
// test credentials or unrelated local material.
const files = git('ls-files', '-z', '--', 'backend', 'infra/ec2/host').split('\0').filter(Boolean)
for (const file of files) {
  const allowed = /^(backend\/(package(-lock)?\.json|server\.js|\.sequelizerc|src\/)|infra\/ec2\/host\/)/.test(file)
  if (!allowed) continue
  if (/(^|\/)(\.env($|\.)|node_modules\/)|\.(pem|key|p12|pfx)$/.test(file)) throw new Error(`Private file refused: ${file}`)
  const target = join(source, file)
  await mkdir(dirname(target), { recursive: true })
  await cp(join(root, file), target)
}
await cp(join(root, 'frontend/dist'), join(source, 'frontend/dist'), { recursive: true })
async function checksums(directory) {
  const result = {}
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) Object.assign(result, await checksums(file))
    else if (entry.isFile()) result[relative(source, file)] = createHash('sha256').update(await readFile(file)).digest('hex')
    else throw new Error(`Unexpected non-file in release: ${file}`)
  }
  return result
}
const metadata = { application: 'CauseConnect', mode: 'live', commit, releaseId, builtAt: new Date().toISOString() }
await writeFile(join(source, 'frontend/dist/release.json'), `${JSON.stringify(metadata, null, 2)}\n`)
const manifest = { ...metadata, files: await checksums(source) }
await writeFile(join(source, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`)
if (git('rev-parse', 'HEAD') !== commit || git('status', '--porcelain', '--untracked-files=normal')) {
  throw new Error('Source changed while building. Refusing to label these bytes as the reviewed commit.')
}
const archive = join(folder, `${releaseId}.tar.gz`)
run('tar', ['-czf', archive, '-C', source, '.'])
const sha256 = createHash('sha256').update(await readFile(archive)).digest('hex')
await writeFile(join(folder, 'deployment.json'), `${JSON.stringify({ commit, releaseId, archive: basename(archive), sha256, key: `live-releases/${releaseId}.tar.gz` }, null, 2)}\n`)
for (const file of ['stack.json', 'prepare-change-set.py']) await cp(join(root, 'infra/ec2', file), join(folder, file))
const launchKit = join(folder, `causeconnect-launch-${releaseId}.zip`)
run('zip', ['-q', launchKit, basename(archive), 'deployment.json', 'stack.json', 'prepare-change-set.py'], { cwd: folder })
console.log(JSON.stringify({ folder, archive, launchKit, sha256, releaseId, commit }, null, 2))
console.log('Local release only. No AWS resources or uploads were created.')
