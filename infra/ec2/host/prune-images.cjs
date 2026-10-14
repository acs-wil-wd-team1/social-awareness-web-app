'use strict';
const path = require('node:path');
const backend = '/srv/causeconnect/current/backend';
let db;
async function main() {
  if (process.env.CAMPAIGN_UPLOAD_DIR !== '/srv/causeconnect/shared/uploads' || process.env.NODE_ENV !== 'production') throw new Error('Unexpected cleanup target');
  db = require(path.join(backend, 'src/database/models'));
  db.sequelize.options.logging = false;
  const { getCampaignImageService } = require(path.join(backend, 'src/services/campaignImages'));
  const removed = await getCampaignImageService().pruneExpiredImages(100);
  console.log(`Expired unattached image records removed: ${removed}`);
}
main().catch(() => { console.error('Image cleanup failed; no success claimed.'); process.exitCode = 1; })
  .finally(async () => { if (db) await db.sequelize.close(); });
