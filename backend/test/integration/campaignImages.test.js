"use strict";

require("dotenv").config({ quiet: true });
if (process.env.RUN_DB_INTEGRATION !== "1" || process.env.NODE_ENV !== "test"
  || !/^[A-Za-z0-9_]+_test$/.test(process.env.DB_NAME_TEST || "")
  || process.env.DB_NAME_TEST === process.env.DB_NAME
  || !["localhost", "127.0.0.1", "::1"].includes(process.env.DB_HOST) || !process.env.JWT_SECRET) {
  throw new Error("Image integration tests require RUN_DB_INTEGRATION=1, NODE_ENV=test, a separate migrated local DB_NAME_TEST ending _test, and JWT_SECRET");
}

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const express = require("express");
const jwt = require("jsonwebtoken");
const sharp = require("sharp");
const { Op } = require("sequelize");
const db = require("../../src/database/models");
const { createCampaignImageRouter } = require("../../src/router/campaignImageRoutes");
const { createCampaignImageService, decodeImage, MAX_IMAGE_BYTES } = require("../../src/services/campaignImages");
const { createImageStorage } = require("../../src/services/campaignImageStorage");
const { reportCampaignImages } = require("../../src/services/campaignImageReconciliation");
db.sequelize.options.logging = false;

const fixtureTag = `images-${randomBytes(8).toString("hex")}`;
const users = {};
const tokens = {};
let directory, storage, service, category, server, origin, png;
const asUser = (key = "owner") => ({ id: users[key].userId, role: users[key].role, status: "active" });

async function sendFile({ key = "owner", bytes = png, filename = "photo.png", contentType = "image/png", fields = [], files = 1 } = {}) {
  const form = new FormData();
  for (let index = 0; index < files; index += 1) form.append("file", new Blob([bytes], { type: contentType }), filename);
  for (const [name, value] of fields) form.append(name, value);
  const response = await fetch(`${origin}/api/campaign-images`, { method: "POST", headers: key ? { Authorization: `Bearer ${tokens[key]}` } : {}, body: form });
  return { status: response.status, body: await response.json() };
}

async function upload(key = "owner") {
  const result = await sendFile({ key });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body;
}

async function campaign(key = "owner", status = "pending") {
  return db.Campaign.create({ title: fixtureTag, description: "Image integration fixture", categoryId: category.categoryId, createdBy: users[key].userId, status });
}

async function attach(reference, row, key = "owner") {
  return db.sequelize.transaction(async (transaction) => {
    await db.User.findByPk(users[key].userId, { transaction, lock: transaction.LOCK.UPDATE });
    await db.Campaign.findByPk(row.campaignId, { transaction, lock: transaction.LOCK.UPDATE });
    return service.attachImage(reference.imageId, row.campaignId, users[key].userId, transaction);
  });
}

async function content(url) {
  const response = await fetch(`${origin}${url}`);
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, body, headers: response.headers };
}

describe("campaign image HTTP, private storage and MySQL integration", () => {
  before(async () => {
    await db.sequelize.authenticate();
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "causeconnect-images-integration-"));
    storage = createImageStorage(directory);
    service = createCampaignImageService(db, { storage });
    png = await sharp({ create: { width: 4, height: 3, channels: 3, background: "blue" } }).png().toBuffer();
    for (const [key, role] of [["owner", "public"], ["other", "public"], ["business", "business_owner"], ["admin", "admin"], ["quota", "public"], ["bytequota", "public"], ["racing", "public"], ["space", "public"], ["replacement", "public"], ["report", "public"]]) {
      users[key] = await db.User.create({ fullName: fixtureTag, email: `${fixtureTag}-${key}@example.test`, passwordHash: "unused-fixture-hash", role, status: "active" });
      tokens[key] = jwt.sign({ id: users[key].userId, role }, process.env.JWT_SECRET, { expiresIn: "1h", jwtid: randomBytes(8).toString("hex") });
      await db.UserSession.create({ userId: users[key].userId, token: tokens[key], ipAddress: "127.0.0.1", userAgent: fixtureTag, status: "active" });
    }
    category = await db.Category.create({ categoryName: fixtureTag });
    const app = express();
    app.use("/api/campaign-images", createCampaignImageRouter(db, { service }));
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    try {
      const ids = Object.values(users).map((row) => row.userId);
      if (ids.length) {
        await db.CampaignImage.destroy({ where: { ownerId: { [Op.in]: ids } } });
        await db.Campaign.destroy({ where: { createdBy: { [Op.in]: ids } } });
        await db.UserSession.destroy({ where: { userId: { [Op.in]: ids } } });
        await db.User.destroy({ where: { userId: { [Op.in]: ids } } });
      }
      if (category) await category.destroy();
      if (directory) await fs.rm(directory, { recursive: true, force: true });
    } finally { await db.sequelize.close(); }
  });

  it("authenticates before upload parsing and rejects admin/suspended uploaders", async () => {
    assert.equal((await sendFile({ key: null })).status, 401);
    assert.equal((await sendFile({ key: "admin" })).status, 403);
    await users.other.update({ status: "suspended" });
    try { assert.equal((await sendFile({ key: "other" })).status, 403); }
    finally { await users.other.update({ status: "active" }); }
    assert.equal(await db.CampaignImage.count({ where: { ownerId: users.admin.userId } }), 0);
  });

  it("uploads safe JPEG, PNG and WebP content with opaque references and no storage keys", async () => {
    for (const format of ["jpeg", "png", "webp"]) {
      const bytes = await sharp(png).toFormat(format).toBuffer();
      const result = await sendFile({ bytes, filename: `photo.${format === "jpeg" ? "jpg" : format}`, contentType: `image/${format}` });
      assert.equal(result.status, 201, JSON.stringify(result.body));
      assert.deepEqual(Object.keys(result.body).sort(), ["contentType", "expiresAt", "imageId", "sizeBytes"]);
      const row = await db.CampaignImage.findByPk(result.body.imageId);
      assert.equal(row.ownerId, users.owner.userId);
      assert.equal(row.campaignId, null);
      assert.ok(row.expiresAt > new Date());
      const opened = await storage.open(row.storageKey);
      assert.equal(opened.stat.size, result.body.sizeBytes);
      assert.equal((await sharp(await opened.file.readFile()).metadata()).format, format);
      await opened.file.close();
      assert.equal((await content(`/api/campaign-images/${row.imageId}/content`)).status, 404);
    }
  });

  it("rejects malformed multipart fields, missing/duplicate files, oversize, mismatched and undecodable images", async () => {
    const beforeCount = await db.CampaignImage.count({ where: { ownerId: users.owner.userId } });
    for (const options of [{ files: 0 }, { files: 2 }, { fields: [["ownerId", "999"]] }, { fields: [["__proto__[polluted]", "yes"]] }, { bytes: Buffer.from("not an image") }]) {
      assert.equal((await sendFile(options)).status, 422);
    }
    assert.equal((await sendFile({ filename: "photo.jpg" })).status, 415);
    assert.equal((await sendFile({ bytes: Buffer.alloc(MAX_IMAGE_BYTES + 1) })).status, 413);
    const phoneJpeg = await sharp({ create: { width: 6000, height: 4000, channels: 3, background: "blue" } }).jpeg({ quality: 30 }).toBuffer();
    assert.ok(phoneJpeg.length < MAX_IMAGE_BYTES);
    const phoneResult = await sendFile({ bytes: phoneJpeg, filename: "phone.jpg", contentType: "image/jpeg" });
    assert.equal(phoneResult.status, 422);
    assert.equal(phoneResult.body.code, "IMAGE_DIMENSIONS_TOO_LARGE");
    assert.match(phoneResult.body.message, /Resize.*4000/);
    assert.equal(await db.CampaignImage.count({ where: { ownerId: users.owner.userId } }), beforeCount);
    assert.equal({}.polluted, undefined);
  });

  it("rechecks a logged-out session inside the upload transaction", async () => {
    await db.UserSession.update({ status: "expired" }, { where: { token: tokens.other } });
    try {
      await assert.rejects(service.upload({ buffer: png, originalname: "photo.png", mimetype: "image/png" }, asUser("other"), tokens.other), (error) => error.status === 401);
    } finally { await db.UserSession.update({ status: "active" }, { where: { token: tokens.other } }); }
  });

  it("limits restricted photos to signed owner/admin delivery and removes access on logout/suspension", async () => {
    const uploaded = await upload();
    const row = await campaign();
    await attach(uploaded, row);
    const options = { audience: "owner", currentUser: asUser(), token: tokens.owner };
    const ownerUrl = await service.buildImageUrl(row.campaignId, options);
    const result = await content(ownerUrl);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("content-type"), "image/png");
    assert.match(result.headers.get("cache-control"), /no-store/);
    assert.equal(result.headers.get("x-content-type-options"), "nosniff");
    assert.ok(!ownerUrl.includes(tokens.owner));
    const adminUrl = await service.buildImageUrl(row.campaignId, { audience: "admin", currentUser: asUser("admin"), token: tokens.admin });
    assert.equal((await content(adminUrl)).status, 200);
    await assert.rejects(service.buildImageUrl(row.campaignId, { audience: "owner", currentUser: asUser("other"), token: tokens.other }), (error) => error.status === 404);
    assert.equal((await content(ownerUrl.split("?")[0])).status, 404);
    await users.owner.update({ status: "suspended" });
    try { assert.equal((await content(ownerUrl)).status, 404); }
    finally { await users.owner.update({ status: "active" }); }
    await db.UserSession.update({ status: "expired" }, { where: { token: tokens.owner } });
    try { assert.equal((await content(ownerUrl)).status, 404); }
    finally { await db.UserSession.update({ status: "active" }, { where: { token: tokens.owner } }); }
  });

  it("rechecks approval, attachment and deletion on every public image request", async () => {
    const uploaded = await upload();
    const row = await campaign();
    await attach(uploaded, row);
    const url = `/api/campaign-images/${uploaded.imageId}/content`;
    assert.equal((await content(url)).status, 404);
    await row.update({ status: "approved" });
    await db.CampaignImage.update({ expiresAt: new Date(0) }, { where: { imageId: uploaded.imageId } });
    assert.equal(await service.buildImageUrl(row.campaignId), url);
    assert.equal((await content(url)).status, 200);
    await row.update({ status: "pending" });
    assert.equal((await content(url)).status, 404);
    await row.update({ status: "approved", deletedAt: new Date() });
    assert.equal((await content(url)).status, 404);
    assert.equal(await service.buildImageUrl(row.campaignId), null);
  });

  it("rejects wrong-owner/expired references and allows only one concurrent attachment", async () => {
    const uploaded = await upload();
    const otherCampaign = await campaign("other");
    await assert.rejects(attach(uploaded, otherCampaign, "other"), (error) => error.status === 422);
    const first = await campaign();
    const second = await campaign();
    const results = await Promise.allSettled([attach(uploaded, first), attach(uploaded, second)]);
    assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(results.find(({ status }) => status === "rejected").reason.status, 422);
    assert.equal(await db.CampaignImage.count({ where: { campaignId: { [Op.in]: [first.campaignId, second.campaignId] } } }), 1);
    const expired = await upload("other");
    await db.CampaignImage.update({ expiresAt: new Date(0) }, { where: { imageId: expired.imageId } });
    await assert.rejects(attach(expired, otherCampaign, "other"), (error) => error.status === 422);
  });

  it("rolls replacement back atomically and clears legacy images on confirmed replacement/removal", async () => {
    const oldImage = await upload();
    const newImage = await upload();
    const row = await campaign();
    await row.update({ imageUrl: "https://example.test/legacy.png" });
    await attach(oldImage, row);
    async function change({ fail = false, removeImage } = {}) {
      return db.sequelize.transaction(async (transaction) => {
        await db.User.findByPk(users.owner.userId, { transaction, lock: transaction.LOCK.UPDATE });
        const locked = await db.Campaign.findByPk(row.campaignId, { transaction, lock: transaction.LOCK.UPDATE });
        await service.applyCampaignImageChange({ campaign: locked, user: asUser(), transaction, ...(removeImage ? { removeImage } : { imageId: newImage.imageId }) });
        await locked.save({ transaction });
        if (fail) throw new Error("Deliberate fixture rollback");
      });
    }
    await assert.rejects(change({ fail: true }), /fixture rollback/);
    assert.equal((await db.CampaignImage.findByPk(oldImage.imageId)).campaignId, row.campaignId);
    assert.equal((await db.CampaignImage.findByPk(newImage.imageId)).campaignId, null);
    assert.equal((await row.reload()).imageUrl, "https://example.test/legacy.png");
    await change();
    assert.equal((await db.CampaignImage.findByPk(oldImage.imageId)).campaignId, null);
    assert.equal((await db.CampaignImage.findByPk(newImage.imageId)).campaignId, row.campaignId);
    assert.equal((await row.reload()).imageUrl, null);
    await change({ removeImage: true });
    assert.equal((await db.CampaignImage.findByPk(newImage.imageId)).campaignId, null);
    assert.equal(await service.buildImageUrl(row.campaignId), null);
  });

  it("cleans only expired unattached fixture uploads and retains attached images", async () => {
    const loose = await upload("business");
    const attached = await upload("business");
    const row = await campaign("business", "approved");
    await attach(attached, row, "business");
    await db.CampaignImage.update({ expiresAt: new Date(0) }, { where: { imageId: { [Op.in]: [loose.imageId, attached.imageId] } } });
    const looseRow = await db.CampaignImage.findByPk(loose.imageId);
    assert.equal(await service.pruneExpiredImages(100, { ownerId: users.business.userId }), 1);
    assert.equal(await db.CampaignImage.findByPk(loose.imageId), null);
    await assert.rejects(storage.open(looseRow.storageKey), { code: "ENOENT" });
    assert.ok(await db.CampaignImage.findByPk(attached.imageId));
    assert.equal((await content(await service.buildImageUrl(row.campaignId))).status, 200);
  });

  it("removes newly written files if database metadata creation fails", async () => {
    const beforeFiles = await fs.readdir(directory);
    const failing = createCampaignImageService({ ...db, CampaignImage: { count: db.CampaignImage.count.bind(db.CampaignImage), sum: db.CampaignImage.sum.bind(db.CampaignImage), create: async () => { throw new Error("Fixture metadata error"); } } }, { storage });
    await assert.rejects(failing.upload({ buffer: png, originalname: "photo.png", mimetype: "image/png" }, asUser(), tokens.owner), /metadata error/);
    assert.deepEqual((await fs.readdir(directory)).sort(), beforeFiles.sort());
  });

  it("counts attached soft-deleted photos and expired unused uploads until their files and rows are safely pruned", async () => {
    const limited = createCampaignImageService(db, { storage, ownerMaxPhotos: 2 });
    const file = { buffer: png, originalname: "photo.png", mimetype: "image/png" };
    const first = await limited.upload(file, asUser("quota"), tokens.quota);
    const row = await campaign("quota", "approved");
    await attach(first, row, "quota");
    await row.update({ deletedAt: new Date() });
    await db.CampaignImage.update({ expiresAt: new Date(0) }, { where: { imageId: first.imageId } });
    const loose = await limited.upload(file, asUser("quota"), tokens.quota);
    const beforeFiles = await fs.readdir(directory);
    await assert.rejects(limited.upload(file, asUser("quota"), tokens.quota), (error) => error.status === 429 && error.code === "IMAGE_OWNER_QUOTA_REACHED");
    assert.equal(await db.CampaignImage.count({ where: { ownerId: users.quota.userId } }), 2);
    assert.deepEqual((await fs.readdir(directory)).sort(), beforeFiles.sort());
    // Expiration is not deletion: quota is released only after safe cleanup.
    // The attached photo stays retained on its soft-deleted campaign.
    await db.CampaignImage.update({ expiresAt: new Date(0) }, { where: { imageId: loose.imageId } });
    await assert.rejects(limited.upload(file, asUser("quota"), tokens.quota), (error) => error.code === "IMAGE_OWNER_QUOTA_REACHED");
    assert.equal(await service.pruneExpiredImages(100, { ownerId: users.quota.userId }), 1);
    assert.ok(await db.CampaignImage.findByPk(first.imageId));
    const next = await limited.upload(file, asUser("quota"), tokens.quota);
    assert.ok(next.imageId);
    await assert.rejects(limited.upload(file, asUser("quota"), tokens.quota), (error) => error.code === "IMAGE_OWNER_QUOTA_REACHED");
  });

  it("does not free quota through repeated photo replacement or removal before cleanup actually reclaims storage", async () => {
    const limited = createCampaignImageService(db, { storage, ownerMaxPhotos: 2 });
    const file = { buffer: png, originalname: "photo.png", mimetype: "image/png" };
    const first = await limited.upload(file, asUser("replacement"), tokens.replacement);
    const row = await campaign("replacement");
    await attach(first, row, "replacement");
    const next = await limited.upload(file, asUser("replacement"), tokens.replacement);
    async function change(values) {
      return db.sequelize.transaction(async (transaction) => {
        await db.User.findByPk(users.replacement.userId, { transaction, lock: transaction.LOCK.UPDATE });
        const locked = await db.Campaign.findByPk(row.campaignId, { transaction, lock: transaction.LOCK.UPDATE });
        await limited.applyCampaignImageChange({ campaign: locked, user: asUser("replacement"), transaction, ...values });
        await locked.save({ transaction });
      });
    }
    await change({ imageId: next.imageId });
    assert.equal((await db.CampaignImage.findByPk(first.imageId)).campaignId, null);
    await assert.rejects(limited.upload(file, asUser("replacement"), tokens.replacement), (error) => error.code === "IMAGE_OWNER_QUOTA_REACHED");
    await change({ removeImage: true });
    assert.equal((await db.CampaignImage.findByPk(next.imageId)).campaignId, null);
    await assert.rejects(limited.upload(file, asUser("replacement"), tokens.replacement), (error) => error.code === "IMAGE_OWNER_QUOTA_REACHED");
    assert.equal(await limited.pruneExpiredImages(100, { ownerId: users.replacement.userId }), 2);
    assert.ok((await limited.upload(file, asUser("replacement"), tokens.replacement)).imageId);
  });

  it("enforces retained encoded bytes independently of the number-of-photos quota", async () => {
    const file = { buffer: png, originalname: "photo.png", mimetype: "image/png" };
    const bytes = (await decodeImage(file)).bytes.length;
    const limited = createCampaignImageService(db, { storage, ownerMaxPhotos: 10, ownerMaxBytes: bytes * 2 - 1 });
    const first = await limited.upload(file, asUser("bytequota"), tokens.bytequota);
    const row = await campaign("bytequota");
    await attach(first, row, "bytequota");
    await assert.rejects(limited.upload(file, asUser("bytequota"), tokens.bytequota), (error) => error.status === 429 && error.code === "IMAGE_OWNER_QUOTA_REACHED");
    assert.equal(await db.CampaignImage.count({ where: { ownerId: users.bytequota.userId } }), 1);
  });

  it("serializes simultaneous uploads across service instances so only one can claim the last account slot", async () => {
    const file = { buffer: png, originalname: "photo.png", mimetype: "image/png" };
    const firstService = createCampaignImageService(db, { storage, ownerMaxPhotos: 1 });
    const secondService = createCampaignImageService(db, { storage, ownerMaxPhotos: 1 });
    const results = await Promise.allSettled([firstService.upload(file, asUser("racing"), tokens.racing), secondService.upload(file, asUser("racing"), tokens.racing)]);
    assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(results.find(({ status }) => status === "rejected").reason.code, "IMAGE_OWNER_QUOTA_REACHED");
    assert.equal(await db.CampaignImage.count({ where: { ownerId: users.racing.userId } }), 1);
  });

  it("rejects storage exhaustion without writing metadata or evicting the existing photo", async () => {
    const capacityDir = await fs.mkdtemp(path.join(os.tmpdir(), "causeconnect-image-capacity-integration-"));
    const file = { buffer: png, originalname: "photo.png", mimetype: "image/png" };
    const bytes = (await decodeImage(file)).bytes.length;
    const cappedStorage = createImageStorage(capacityDir, { maxBytes: bytes, minFreeBytes: 0, availableBytes: async () => 1000 });
    const limited = createCampaignImageService(db, { storage: cappedStorage });
    try {
      const first = await limited.upload(file, asUser("space"), tokens.space);
      const beforeFiles = await fs.readdir(capacityDir);
      await assert.rejects(limited.upload(file, asUser("space"), tokens.space), (error) => error.status === 503 && error.code === "IMAGE_STORAGE_FULL");
      assert.equal(await db.CampaignImage.count({ where: { ownerId: users.space.userId } }), 1);
      assert.deepEqual((await fs.readdir(capacityDir)).sort(), beforeFiles.sort());
      const record = await db.CampaignImage.findByPk(first.imageId);
      const opened = await cappedStorage.open(record.storageKey);
      assert.equal(opened.stat.size, record.sizeBytes);
      await opened.file.close();
    } finally { await fs.rm(capacityDir, { recursive: true, force: true }); }
  });

  it("reconciles the real image ledger with disposable storage without pruning retained references or exposing paths", async () => {
    const orphanKey = `${randomBytes(32).toString("hex")}.png`;
    const missingKey = `${randomBytes(32).toString("hex")}.png`;
    let retainedCampaign;
    const ownedKeys = [orphanKey];
    try {
      const attached = await upload("report");
      const expiredLoose = await upload("report");
      retainedCampaign = await campaign("report", "approved");
      await attach(attached, retainedCampaign, "report");
      await retainedCampaign.update({ deletedAt: new Date() });
      await db.CampaignImage.update({ expiresAt: new Date(0) }, { where: { ownerId: users.report.userId } });
      await db.CampaignImage.create({ imageId: `img_${randomBytes(24).toString("hex")}`, ownerId: users.report.userId, storageKey: missingKey, contentType: "image/png", sizeBytes: png.length, expiresAt: new Date(0), campaignId: null });
      const rowsBefore = await db.CampaignImage.findAll({ where: { ownerId: users.report.userId }, order: [["imageId", "ASC"]], raw: true });
      ownedKeys.push(...rowsBefore.map(({ storageKey }) => storageKey));
      assert.equal(rowsBefore.length, 3);
      assert.ok(rowsBefore.some(({ imageId, campaignId, expiresAt }) => imageId === attached.imageId && campaignId === retainedCampaign.campaignId && expiresAt.getTime() === 0));
      assert.ok(rowsBefore.some(({ imageId, campaignId, expiresAt }) => imageId === expiredLoose.imageId && campaignId === null && expiresAt.getTime() === 0));
      // A generated file with no ledger row simulates a crash between writing
      // bytes and committing metadata. This report must never remove it.
      await fs.writeFile(path.join(directory, orphanKey), png, { flag: "wx", mode: 0o600 });
      const filesBefore = (await fs.readdir(directory)).sort();
      const report = await reportCampaignImages({ CampaignImage: db.CampaignImage, directory });
      assert.equal(report.mode, "report-only");
      assert.equal(report.totals.untrackedFiles, 1);
      assert.equal(report.bytes.untrackedBytes, png.length);
      assert.equal(report.totals.referencedFiles, filesBefore.length - 1, "Both expired loose and soft-deleted attached photos remain ledger references");
      assert.ok(report.totals.missingFiles >= 1);
      assert.equal(report.totals.sizeMismatchFiles, 0);
      assert.match(report.notice, /Untracked does not mean disposable/);
      const printed = JSON.stringify(report);
      for (const value of [directory, orphanKey, missingKey, ...ownedKeys, tokens.report]) assert.ok(!printed.includes(value));
      assert.deepEqual((await fs.readdir(directory)).sort(), filesBefore);
      assert.deepEqual(await fs.readFile(path.join(directory, orphanKey)), png);
      assert.deepEqual(await db.CampaignImage.findAll({ where: { ownerId: users.report.userId }, order: [["imageId", "ASC"]], raw: true }), rowsBefore);
    } finally {
      // Only this generated fixture account's rows/files are eligible here.
      const fixtureRows = await db.CampaignImage.findAll({ where: { ownerId: users.report.userId }, attributes: ["storageKey"], raw: true });
      await db.CampaignImage.destroy({ where: { ownerId: users.report.userId } });
      if (retainedCampaign) await retainedCampaign.destroy();
      for (const storageKey of new Set([...ownedKeys, ...fixtureRows.map((row) => row.storageKey)])) await storage.remove(storageKey);
    }
  });
});
