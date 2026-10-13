"use strict";

require("dotenv").config({ quiet: true });
const db = require("../src/database/models");
const { createCampaignImageService } = require("../src/services/campaignImages");

(async () => {
  try {
    db.sequelize.options.logging = false;
    const removed = await createCampaignImageService(db).pruneExpiredImages(100);
    console.log(`Expired unattached campaign images removed: ${removed}`);
  } catch {
    console.error("Campaign image cleanup failed");
    process.exitCode = 1;
  } finally { await db.sequelize.close(); }
})();
