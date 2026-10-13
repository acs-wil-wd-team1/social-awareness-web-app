'use strict';
const path = require('node:path');
const { createRequire } = require('node:module');
const directory = path.resolve(process.argv[2] || '');
async function main() {
  if (!path.isAbsolute(process.argv[2] || '')) throw new Error('Backend directory required');
  const requireBackend = createRequire(path.join(directory, 'package.json'));
  const sharp = requireBackend('sharp');
  for (const format of ['jpeg', 'png', 'webp']) {
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#16703d' } }).toFormat(format).toBuffer();
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== format || metadata.width !== 2) throw new Error('Native image round trip failed');
  }
  console.log('Native JPEG, PNG and WebP support passed.');
}
main().catch(() => { console.error('Native image check failed; no migration should proceed.'); process.exitCode = 1; });
