"use strict";

const { reportCampaignImages } = require("../src/services/campaignImageReconciliation");
const { defaultDirectory } = require("../src/services/campaignImageStorage");

async function runReport({ argv = process.argv.slice(2), env = process.env, getModels = () => require("../src/database/models"), getDirectory = defaultDirectory, stdout = console.log, stderr = console.error } = {}) {
  if (argv.length === 1 && argv[0] === "--help") {
    stdout("Usage: node scripts/report-campaign-images.js\nRead-only local photo-ledger report. Requires a loopback DB_HOST and non-production NODE_ENV. No repair or deletion options.");
    return 0;
  }
  let db;
  try {
    if (argv.length || env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(env.DB_HOST)) {
      throw Object.assign(new Error("Use the configured local database in non-production mode; no report flags are supported"), { code: "UNSAFE_REPORT_TARGET" });
    }
    db = getModels();
    db.sequelize.options.logging = false;
    const report = await reportCampaignImages({ CampaignImage: db.CampaignImage, directory: getDirectory() });
    stdout(JSON.stringify(report));
    return 0;
  } catch (error) {
    const known = ["UNSAFE_REPORT_TARGET", "INVALID_REPORT_DIRECTORY", "INVALID_REPORT_LIMIT", "REPORT_LIMIT_REACHED"].includes(error.code);
    stderr(JSON.stringify({ mode: "report-only", code: known ? error.code : "IMAGE_REPORT_FAILED", message: known ? error.message : "The photo report could not be completed. Check local configuration and retry without changing files or records" }));
    return 1;
  } finally {
    if (db) await db.sequelize.close();
  }
}

if (require.main === module) {
  process.env.DOTENV_CONFIG_QUIET = "true";
  require("dotenv").config({ quiet: true });
  runReport().then((code) => { process.exitCode = code; }).catch(() => {
    console.error(JSON.stringify({ mode: "report-only", code: "IMAGE_REPORT_FAILED", message: "The photo report could not be completed" }));
    process.exitCode = 1;
  });
}

module.exports = { runReport };
