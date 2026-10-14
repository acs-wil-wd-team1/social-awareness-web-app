"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { reportCampaignImages } = require("../../src/services/campaignImageReconciliation");
const { runReport } = require("../../scripts/report-campaign-images");

const key = (value) => `${value.repeat(64)}.png`;
const model = (rows) => ({ findAll: async (options) => {
  assert.deepEqual(options.attributes, ["storageKey", "sizeBytes"]);
  assert.equal(options.where, undefined, "Retain every ledger reference regardless of campaign status or expiry");
  assert.equal(options.logging, false);
  assert.equal(options.raw, true);
  return rows;
} });

test("reports retained, missing, untracked and size-mismatch files without returning keys or changing files", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "causeconnect-photo-report-test-"));
  try {
    await fs.writeFile(path.join(directory, key("a")), "retained");
    await fs.writeFile(path.join(directory, key("b")), "different-size");
    await fs.writeFile(path.join(directory, key("c")), "orphan");
    await fs.writeFile(path.join(directory, "private-unexpected-name.txt"), "unknown");
    await fs.mkdir(path.join(directory, "unrelated-directory"));
    await fs.symlink(path.join(directory, key("a")), path.join(directory, key("d")));
    const before = (await fs.readdir(directory)).sort();
    const rows = [
      { storageKey: key("a"), sizeBytes: 8, campaignId: 9, deletedAt: new Date() },
      { storageKey: key("b"), sizeBytes: 1, campaignId: null, expiresAt: new Date(0) },
      { storageKey: key("e"), sizeBytes: 3 },
    ];
    const report = await reportCampaignImages({ CampaignImage: model(rows), directory });
    assert.deepEqual(report.totals, {
      ledgerRecords: 3, referencedKeys: 3, regularFiles: 4, referencedFiles: 2,
      missingFiles: 1, untrackedFiles: 2, sizeMismatchFiles: 1,
      invalidLedgerRows: 0, duplicateLedgerReferences: 0, unexpectedEntries: 3,
      symlinkEntries: 1, changedDuringScan: 0,
    });
    assert.deepEqual(report.bytes, { ledgerBytes: 12, regularFileBytes: 35, missingLedgerBytes: 3, untrackedBytes: 13 });
    assert.equal(report.mode, "report-only");
    assert.match(report.notice, /Untracked does not mean disposable/);
    const printed = JSON.stringify(report);
    for (const value of [directory, key("a"), key("b"), key("c"), "private-unexpected-name", "campaignId", "expiresAt"]) assert.ok(!printed.includes(value));
    assert.deepEqual((await fs.readdir(directory)).sort(), before);
    assert.equal(await fs.readFile(path.join(directory, key("c")), "utf8"), "orphan");
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("keeps malformed-size ledger references and detects invalid or duplicate ledger rows", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "causeconnect-photo-report-ledger-"));
  try {
    await fs.writeFile(path.join(directory, key("a")), "retained");
    const report = await reportCampaignImages({ CampaignImage: model([
      { storageKey: key("a"), sizeBytes: -1 },
      { storageKey: key("a"), sizeBytes: 8 },
      { storageKey: "../unsafe", sizeBytes: 4 },
    ]), directory });
    assert.equal(report.totals.invalidLedgerRows, 2);
    assert.equal(report.totals.duplicateLedgerReferences, 1);
    assert.equal(report.totals.referencedFiles, 1);
    assert.equal(report.totals.untrackedFiles, 0);
    assert.equal(report.totals.sizeMismatchFiles, 0);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("refuses unsafe directories and bounded scans fail without changing data", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "causeconnect-photo-report-bound-"));
  try {
    for (const digit of ["a", "b"]) await fs.writeFile(path.join(directory, key(digit)), digit);
    await fs.symlink(directory, path.join(directory, "directory-link"));
    for (const target of ["/", "relative", path.join(directory, "directory-link")]) {
      await assert.rejects(reportCampaignImages({ CampaignImage: model([]), directory: target }), (error) => error.code === "INVALID_REPORT_DIRECTORY");
    }
    await assert.rejects(reportCampaignImages({ CampaignImage: model([]), directory, maxEntries: 1 }), (error) => error.code === "REPORT_LIMIT_REACHED");
    await assert.rejects(reportCampaignImages({ CampaignImage: model([{ storageKey: key("a"), sizeBytes: 1 }, { storageKey: key("b"), sizeBytes: 1 }]), directory, maxRecords: 1 }), (error) => error.code === "REPORT_LIMIT_REACHED");
    for (const maxEntries of [0, 1.5, 10_001]) await assert.rejects(reportCampaignImages({ CampaignImage: model([]), directory, maxEntries }), (error) => error.code === "INVALID_REPORT_LIMIT");
    assert.equal(await fs.readFile(path.join(directory, key("a")), "utf8"), "a");
    assert.equal((await fs.readdir(directory)).length, 3);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("command refuses production, remote database targets and repair flags before opening a connection", async () => {
  let calls = 0;
  const outputs = [];
  const getModels = () => { calls += 1; throw new Error("Must not connect"); };
  for (const options of [{ env: { NODE_ENV: "production", DB_HOST: "localhost" }, argv: [] }, { env: { NODE_ENV: "test", DB_HOST: "remote.example.test" }, argv: [] }, { env: { DB_HOST: "localhost" }, argv: ["--delete"] }]) {
    assert.equal(await runReport({ ...options, getModels, stderr: (value) => outputs.push(JSON.parse(value)) }), 1);
  }
  assert.equal(calls, 0);
  assert.ok(outputs.every(({ code }) => code === "UNSAFE_REPORT_TARGET"));
  assert.equal(await runReport({ argv: ["--help"], getModels, stdout: (value) => outputs.push(value) }), 0);
  assert.equal(calls, 0);
});

test("command sanitizes database and filesystem failures and closes only its opened connection", async () => {
  let closed = 0;
  const outputs = [];
  const db = { sequelize: { options: {}, close: async () => { closed += 1; } } };
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "causeconnect-photo-report-error-"));
  try {
    assert.equal(await runReport({ env: { NODE_ENV: "test", DB_HOST: "localhost" }, argv: [], getModels: () => db, getDirectory: () => path.join(directory, "missing-private-path"), stderr: (value) => outputs.push(value) }), 1);
    assert.equal(closed, 1);
    assert.equal(db.sequelize.options.logging, false);
    assert.equal(JSON.parse(outputs[0]).code, "IMAGE_REPORT_FAILED");
    assert.ok(!outputs[0].includes("private-path"));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("command prints one summary and closes its read-only connection on success", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "causeconnect-photo-report-command-"));
  let closed = 0;
  const outputs = [];
  const db = { CampaignImage: model([]), sequelize: { options: {}, close: async () => { closed += 1; } } };
  try {
    assert.equal(await runReport({ env: { NODE_ENV: "test", DB_HOST: "localhost" }, argv: [], getModels: () => db, getDirectory: () => directory, stdout: (value) => outputs.push(JSON.parse(value)) }), 0);
    assert.equal(outputs.length, 1);
    assert.equal(outputs[0].mode, "report-only");
    assert.equal(outputs[0].totals.missingFiles, 0);
    assert.equal(outputs[0].totals.untrackedFiles, 0);
    assert.equal(closed, 1);
    assert.deepEqual(await fs.readdir(directory), []);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
