"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { STORAGE_KEY } = require("./campaignImageStorage");

const MAX_RECONCILIATION_ITEMS = 10_000;

function reportError(code, message) {
  return Object.assign(new Error(message), { code });
}

function boundedLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_RECONCILIATION_ITEMS) {
    throw reportError("INVALID_REPORT_LIMIT", "Use bounded positive report limits");
  }
  return value;
}

// Read-only, best-effort comparison of one dedicated flat directory and the
// entire image ledger. No row status/expiry filter and no file/row deletion:
// unattached, expired and soft-deleted campaign photos remain references.
async function reportCampaignImages({ CampaignImage, directory, maxEntries = MAX_RECONCILIATION_ITEMS, maxRecords = MAX_RECONCILIATION_ITEMS }) {
  boundedLimit(maxEntries);
  boundedLimit(maxRecords);
  if (typeof directory !== "string" || !path.isAbsolute(directory)) {
    throw reportError("INVALID_REPORT_DIRECTORY", "Configure a dedicated absolute photo directory");
  }
  const root = path.resolve(directory);
  if (root === path.parse(root).root) throw reportError("INVALID_REPORT_DIRECTORY", "A dedicated photo directory is required");
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw reportError("INVALID_REPORT_DIRECTORY", "The photo directory must be a real directory, not a symbolic link");
  }

  const rows = await CampaignImage.findAll({ attributes: ["storageKey", "sizeBytes"], order: [["imageId", "ASC"]], limit: maxRecords + 1, raw: true, logging: false });
  if (rows.length > maxRecords) throw reportError("REPORT_LIMIT_REACHED", "The photo report exceeded its record or directory limit");
  const totals = {
    ledgerRecords: rows.length, referencedKeys: 0, regularFiles: 0, referencedFiles: 0,
    missingFiles: 0, untrackedFiles: 0, sizeMismatchFiles: 0,
    invalidLedgerRows: 0, duplicateLedgerReferences: 0, unexpectedEntries: 0,
    symlinkEntries: 0, changedDuringScan: 0,
  };
  const bytes = { ledgerBytes: 0, regularFileBytes: 0, missingLedgerBytes: 0, untrackedBytes: 0 };
  const references = new Map();
  for (const row of rows) {
    const validSize = Number.isSafeInteger(row.sizeBytes) && row.sizeBytes >= 0;
    const validKey = typeof row.storageKey === "string" && STORAGE_KEY.test(row.storageKey);
    if (!validKey || !validSize) totals.invalidLedgerRows += 1;
    if (validSize) bytes.ledgerBytes += row.sizeBytes;
    if (!validKey) continue;
    if (references.has(row.storageKey)) { totals.duplicateLedgerReferences += 1; continue; }
    references.set(row.storageKey, validSize ? row.sizeBytes : null);
  }
  totals.referencedKeys = references.size;
  const found = new Set();
  let entries = 0;
  for await (const entry of await fs.opendir(root)) {
    entries += 1;
    if (entries > maxEntries) throw reportError("REPORT_LIMIT_REACHED", "The photo report exceeded its record or directory limit");
    let stat;
    try { stat = await fs.lstat(path.join(root, entry.name)); }
    catch (error) {
      if (error.code === "ENOENT") { totals.changedDuringScan += 1; continue; }
      throw error;
    }
    if (stat.isSymbolicLink()) { totals.symlinkEntries += 1; totals.unexpectedEntries += 1; continue; }
    if (!stat.isFile()) { totals.unexpectedEntries += 1; continue; }
    totals.regularFiles += 1;
    bytes.regularFileBytes += stat.size;
    if (!STORAGE_KEY.test(entry.name)) totals.unexpectedEntries += 1;
    if (!references.has(entry.name)) {
      totals.untrackedFiles += 1;
      bytes.untrackedBytes += stat.size;
      continue;
    }
    found.add(entry.name);
    totals.referencedFiles += 1;
    const expectedSize = references.get(entry.name);
    if (expectedSize !== null && stat.size !== expectedSize) totals.sizeMismatchFiles += 1;
  }
  for (const [key, size] of references) {
    if (found.has(key)) continue;
    totals.missingFiles += 1;
    if (size !== null) bytes.missingLedgerBytes += size;
  }
  return {
    schemaVersion: 1, mode: "report-only", snapshot: "best-effort",
    limits: { maxEntries, maxRecords }, totals, bytes,
    notice: "No files or records were changed. Concurrent uploads or cleanup can affect this report; investigate and repeat during a quiet window before considering any repair. Untracked does not mean disposable.",
  };
}

module.exports = { reportCampaignImages, MAX_RECONCILIATION_ITEMS };
