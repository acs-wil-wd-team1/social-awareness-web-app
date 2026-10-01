#!/usr/bin/env node
// Deploy a reviewed sample ZIP to an already-approved, dedicated S3/CloudFront pair.
// This never creates buckets/distributions, changes billing plans, or deletes objects.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [account, bucket, distribution, archiveArg, expectedHash, functionName, apply] = process.argv.slice(2)
if (!/^\d{12}$/.test(account || '') || !/^causeconnect-preview-[a-z0-9-]+$/.test(bucket || '') ||
    !/^[A-Z0-9]+$/.test(distribution || '') || !/^[a-f0-9]{64}$/.test(expectedHash || '') ||
    !/^causeconnect-preview-routing-[a-z0-9-]+$/.test(functionName || '') || apply !== '--apply') {
  throw new Error('Usage: node deploy-preview.mjs ACCOUNT BUCKET DISTRIBUTION ZIP SHA256 FUNCTION_NAME --apply')
}
const archive = resolve(archiveArg)
const routingFile = join(dirname(fileURLToPath(import.meta.url)), 'preview-routing.js')
readFileSync(routingFile)
const aws = (...args) => JSON.parse(execFileSync('aws', [...args, '--output', 'json', '--no-cli-pager'], { encoding: 'utf8' }))
const run = (...args) => execFileSync('aws', args, { stdio: 'inherit' })
if (aws('sts', 'get-caller-identity').Account !== account) throw new Error('Wrong AWS account; no changes made.')
if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== expectedHash) throw new Error('ZIP checksum mismatch.')
const names = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n')
if (!names.includes('index.html') || names.some(name => name.startsWith('/') || name.split('/').some(part => part === '..' || part.startsWith('.')))) {
  throw new Error('Unexpected archive layout; only the built site is accepted.')
}
const receipt = aws('cloudfront', 'get-distribution-config', '--id', distribution)
const config = receipt.DistributionConfig
const origin = config.Origins.Items[0]
if (config.Origins.Quantity !== 1 || origin.DomainName !== `${bucket}.s3.ap-southeast-2.amazonaws.com` ||
    origin.OriginPath !== '/site' || !origin.OriginAccessControlId || !config.Enabled ||
    config.DefaultCacheBehavior.TargetOriginId !== origin.Id || config.CustomErrorResponses.Quantity !== 0 ||
    config.CacheBehaviors.Quantity !== 0 || config.DefaultCacheBehavior.FunctionAssociations.Quantity !== 0 ||
    config.DefaultCacheBehavior.LambdaFunctionAssociations.Quantity !== 0) {
  throw new Error('Distribution is not the expected isolated preview. Inspect it manually.')
}
const oac = aws('cloudfront', 'get-origin-access-control', '--id', origin.OriginAccessControlId).OriginAccessControl.OriginAccessControlConfig
if (oac.OriginAccessControlOriginType !== 's3' || oac.SigningProtocol !== 'sigv4' || oac.SigningBehavior !== 'always') {
  throw new Error('Origin access control must always sign S3 requests.')
}
const block = aws('s3api', 'get-public-access-block', '--bucket', bucket).PublicAccessBlockConfiguration
if (!['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets'].every(key => block[key] === true)) {
  throw new Error('Bucket public access is not fully blocked.')
}
const policy = JSON.parse(aws('s3api', 'get-bucket-policy', '--bucket', bucket).Policy)
const expectedArn = `arn:aws:cloudfront::${account}:distribution/${distribution}`
const statements = Array.isArray(policy.Statement) ? policy.Statement : [policy.Statement]
if (!statements.some(statement => statement.Effect === 'Allow' && statement.Principal?.Service === 'cloudfront.amazonaws.com' &&
    ['StringEquals', 'ArnEquals', 'ArnLike'].some(operator => statement.Condition?.[operator]?.['AWS:SourceArn'] === expectedArn) &&
    statement.Action === 's3:GetObject' && statement.Resource === `arn:aws:s3:::${bucket}/*`)) {
  throw new Error('Expected distribution-only bucket policy not found.')
}
const functions = aws('cloudfront', 'list-functions', '--stage', 'DEVELOPMENT').FunctionList?.Items || []
if (functions.some(item => item.Name === functionName)) throw new Error('Function already exists; inspect before updating.')
const policies = aws('cloudfront', 'list-response-headers-policies', '--type', 'managed').ResponseHeadersPolicyList.Items
const securityPolicy = policies.find(item => ['SecurityHeadersPolicy', 'Managed-SecurityHeadersPolicy'].includes(item.ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name))?.ResponseHeadersPolicy.Id
if (!securityPolicy) throw new Error('Managed SecurityHeadersPolicy not found.')
const directory = mkdtempSync(join(tmpdir(), 'causeconnect-preview-'))
const site = join(directory, 'site')
execFileSync('unzip', ['-q', archive, '-d', site])
if (JSON.parse(readFileSync(join(site, 'release.json'), 'utf8')).mode !== 'demo') throw new Error('Only a demo release may be deployed here.')
writeFileSync(join(directory, 'before-distribution.json'), JSON.stringify(receipt, null, 2))
run('s3', 'sync', site, `s3://${bucket}/site/`, '--region', 'ap-southeast-2', '--cache-control', 'no-cache,max-age=0,must-revalidate', '--only-show-errors')
run('s3', 'cp', join(site, 'assets'), `s3://${bucket}/site/assets/`, '--recursive', '--region', 'ap-southeast-2', '--cache-control', 'public,max-age=31536000,immutable', '--only-show-errors')
const created = aws('cloudfront', 'create-function', '--name', functionName, '--function-config',
  JSON.stringify({ Comment: 'CauseConnect sample-only SPA routing; API deliberately unavailable', Runtime: 'cloudfront-js-2.0' }),
  '--function-code', `fileb://${routingFile}`)
aws('cloudfront', 'publish-function', '--name', functionName, '--if-match', created.ETag)
config.DefaultRootObject = 'index.html'
config.DefaultCacheBehavior.ViewerProtocolPolicy = 'redirect-to-https'
config.DefaultCacheBehavior.ResponseHeadersPolicyId = securityPolicy
config.DefaultCacheBehavior.FunctionAssociations = { Quantity: 1, Items: [{ EventType: 'viewer-request', FunctionARN: created.FunctionSummary.FunctionMetadata.FunctionARN }] }
const configFile = join(directory, 'distribution.json')
writeFileSync(configFile, JSON.stringify(config))
const updated = aws('cloudfront', 'update-distribution', '--id', distribution, '--if-match', receipt.ETag, '--distribution-config', `file://${configFile}`)
console.log(JSON.stringify({ distribution, domain: updated.Distribution.DomainName, status: updated.Distribution.Status, bucket, originPath: '/site', archiveSha256: expectedHash, receiptDirectory: directory }, null, 2))
console.log('Upload/configuration submitted. Verify deployment status, public HTTPS routes and private origin before sharing.')
