"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const sharp = require("sharp");
const jwt = require("jsonwebtoken");
const express = require("express");
const { createCampaignImageRouter } = require("../../src/router/campaignImageRoutes");
const { createCampaignImageService, decodeImage, signTicket, readTicket, MAX_IMAGE_BYTES, DEFAULT_OWNER_MAX_PHOTOS, DEFAULT_OWNER_MAX_BYTES } = require("../../src/services/campaignImages");
const { createImageStorage } = require("../../src/services/campaignImageStorage");

const secret = "isolated-unit-image-secret-not-a-real-key";
const imageId = `img_${"a".repeat(48)}`;
const transaction = { LOCK: { UPDATE: "UPDATE" } };
const now = new Date();
const makeFile = async (format = "png") => ({ originalname: `photo.${format === "jpeg" ? "jpg" : format}`, mimetype: `image/${format}`, buffer: await sharp({ create: { width: 4, height: 3, channels: 3, background: "green" } }).toFormat(format).toBuffer() });

test("fully decodes each accepted image type and returns only re-encoded bytes", async () => {
  for (const format of ["jpeg", "png", "webp"]) {
    const result = await decodeImage(await makeFile(format));
    assert.equal(result.contentType, `image/${format}`);
    assert.equal((await sharp(result.bytes).metadata()).format, format);
    assert.ok(result.bytes.length > 0 && result.bytes.length <= MAX_IMAGE_BYTES);
  }
});

test("rejects empty, oversized, mismatched, malformed and unsupported files", async () => {
  const file = await makeFile();
  for (const invalid of [undefined, { ...file, buffer: Buffer.alloc(0) }, { ...file, buffer: Buffer.from("not pixels") }]) {
    await assert.rejects(decodeImage(invalid), (error) => error.status === 422);
  }
  await assert.rejects(decodeImage({ ...file, buffer: Buffer.alloc(MAX_IMAGE_BYTES + 1) }), (error) => error.status === 413);
  await assert.rejects(decodeImage({ ...file, originalname: "photo.svg" }), (error) => error.status === 415);
  await assert.rejects(decodeImage({ ...file, mimetype: "image/jpeg" }), (error) => error.status === 415);
  await assert.rejects(decodeImage({ ...file, mimetype: "image/jpeg", originalname: "photo.jpg" }), (error) => error.status === 422 && error.code === "IMAGE_TYPE_MISMATCH");
  await assert.rejects(decodeImage({ ...file, buffer: file.buffer.subarray(0, 35) }), (error) => error.status === 422 && error.code === "IMAGE_DECODE_FAILED");
});

test("a compressed 24 MP phone JPEG receives an explicit resize error without decoding all pixels", async () => {
  const buffer = await sharp({ create: { width: 6000, height: 4000, channels: 3, background: "green" } }).jpeg({ quality: 30 }).toBuffer();
  assert.ok(buffer.length < MAX_IMAGE_BYTES);
  await assert.rejects(decodeImage({ buffer, originalname: "phone.jpg", mimetype: "image/jpeg" }), (error) => {
    assert.equal(error.status, 422);
    assert.equal(error.code, "IMAGE_DIMENSIONS_TOO_LARGE");
    assert.match(error.message, /16 megapixels.*Resize.*4000/);
    return true;
  });
  const withinLimit = await sharp(buffer).resize({ width: 4000, height: 4000, fit: "inside" }).toBuffer();
  assert.equal((await decodeImage({ buffer: withinLimit, originalname: "phone.jpg", mimetype: "image/jpeg" })).contentType, "image/jpeg");
});

test("rejects animated WebP with a still-photo instruction", async () => {
  const buffer = await sharp(Buffer.from([255, 0, 0, 0, 255, 0]), { raw: { width: 1, height: 2, channels: 3, pageHeight: 1 } }).webp().toBuffer();
  assert.equal((await sharp(buffer).metadata()).pages, 2);
  await assert.rejects(decodeImage({ buffer, originalname: "animated.webp", mimetype: "image/webp" }), (error) => error.status === 422 && error.code === "ANIMATED_IMAGE_NOT_SUPPORTED");
});

function quotaUploadFixture({ count = 0, size = 0, ownerMaxPhotos, ownerMaxBytes } = {}) {
  const token = jwt.sign({ id: 2 }, secret, { expiresIn: "1h" });
  const operations = [];
  const queries = [];
  const storage = { write: async () => { operations.push("write"); }, remove: async () => { operations.push("remove"); } };
  const models = {
    sequelize: { transaction: async (work) => work(transaction) },
    User: { findByPk: async (id, options) => { assert.equal(options.lock, transaction.LOCK.UPDATE); operations.push("account-lock"); return { userId: id, status: "active", role: "public" }; } },
    UserSession: { findOne: async () => ({ token, userId: 2, status: "active" }) },
    CampaignImage: {
      count: async (options) => { queries.push(options); operations.push("count"); return count; },
      sum: async (field, options) => { assert.equal(field, "sizeBytes"); queries.push(options); operations.push("sum"); return size; },
      create: async (values) => { operations.push("create"); return values; },
    },
  };
  return { service: createCampaignImageService(models, { storage, now: () => now, secret: () => secret, ownerMaxPhotos, ownerMaxBytes }), operations, queries, token };
}

test("retained-photo count and bytes are checked under the account lock before a file is written", async () => {
  const file = await makeFile();
  const decoded = await decodeImage(file);
  for (const limits of [{ count: DEFAULT_OWNER_MAX_PHOTOS }, { size: DEFAULT_OWNER_MAX_BYTES - decoded.bytes.length + 1 }]) {
    const data = quotaUploadFixture(limits);
    await assert.rejects(data.service.upload(file, { id: 2 }, data.token), (error) => error.status === 429 && error.code === "IMAGE_OWNER_QUOTA_REACHED");
    assert.deepEqual(data.operations, ["account-lock", "count", "sum"]);
    assert.equal(data.queries.length, 2);
    assert.ok(data.queries.every((options) => options.transaction === transaction && options.where.ownerId === 2));
    assert.deepEqual(data.queries[0].where, { ownerId: 2 });
  }
  const allowed = quotaUploadFixture({ count: 1, size: null, ownerMaxPhotos: 2, ownerMaxBytes: decoded.bytes.length });
  const result = await allowed.service.upload(file, { id: 2 }, allowed.token);
  assert.equal(result.sizeBytes, decoded.bytes.length);
  assert.deepEqual(allowed.operations, ["account-lock", "count", "sum", "write", "create"]);
});

test("per-account quota overrides are bounded positive integers", () => {
  for (const value of [0, -1, 1.5, "bad", 101]) assert.throws(() => quotaUploadFixture({ ownerMaxPhotos: value }), /Invalid per-account image quota/);
  for (const value of [0, -1, 1.5, "bad", 256 * 1024 * 1024 + 1]) assert.throws(() => quotaUploadFixture({ ownerMaxBytes: value }), /Invalid per-account image quota/);
});

test("removes EXIF metadata from stored photos", async () => {
  const file = await makeFile("jpeg");
  file.buffer = await sharp(file.buffer).withMetadata().toBuffer();
  assert.ok((await sharp(file.buffer).metadata()).exif);
  const decoded = await decodeImage(file);
  assert.equal((await sharp(decoded.bytes).metadata()).exif, undefined);
});

test("signed capabilities reject changes, expiration, other images and another signing domain", () => {
  const seconds = Math.floor(now.getTime() / 1000);
  const payload = { v: 1, i: imageId, c: 4, u: 2, s: 3, e: seconds + 300, f: "f".repeat(43) };
  const ticket = signTicket(payload, secret);
  const options = { imageId, campaignId: 4, nowSeconds: seconds, secret };
  assert.deepEqual(readTicket(ticket, options), payload);
  for (const [candidate, overrides] of [
    [`${ticket.slice(0, -1)}${ticket.endsWith("a") ? "b" : "a"}`, {}],
    [ticket, { imageId: `img_${"b".repeat(48)}` }], [ticket, { campaignId: 9 }],
    [ticket, { nowSeconds: seconds + 300 }], [ticket, { secret: "other" }],
    [signTicket({ ...payload, extra: true }, secret), {}], [signTicket({ ...payload, e: seconds + 301 }, secret), {}],
    ["invalid", {}], [undefined, {}], [ticket.repeat(8), {}],
  ]) assert.throws(() => readTicket(candidate, { ...options, ...overrides }), (error) => error.status === 404);
});

test("private filesystem writes exclusive generated files and rejects traversal/symlinks", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "causeconnect-image-storage-test-"));
  const key = `${"c".repeat(64)}.png`;
  const storage = createImageStorage(dir);
  try {
    await storage.write(key, Buffer.from("bytes"));
    const opened = await storage.open(key);
    assert.equal(opened.stat.size, 5);
    assert.equal(await opened.file.readFile("utf8"), "bytes");
    await opened.file.close();
    await assert.rejects(storage.write(key, Buffer.from("replacement")), { code: "EEXIST" });
    for (const candidate of ["../outside.png", "/tmp/out.png", "normal.png"]) await assert.rejects(storage.open(candidate), /Invalid image storage key/);
    const linkKey = `${"d".repeat(64)}.png`;
    await fs.symlink(path.join(dir, key), path.join(dir, linkKey));
    await assert.rejects(storage.open(linkKey));
    await fs.unlink(path.join(dir, linkKey));
    await storage.remove(key);
    await storage.remove(key);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("storage cap serializes concurrent writes across service instances and keeps a free-space reserve", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "causeconnect-image-cap-test-"));
  try {
    const options = { maxBytes: 5, minFreeBytes: 10, availableBytes: async () => 100 };
    const results = await Promise.allSettled(["e", "f"].map((digit) => createImageStorage(dir, options).write(`${digit.repeat(64)}.png`, Buffer.alloc(4))));
    assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(results.find(({ status }) => status === "rejected").reason.code, "IMAGE_STORAGE_FULL");
    const reserve = createImageStorage(dir, { maxBytes: 1000, minFreeBytes: 100, availableBytes: async () => 102 });
    await assert.rejects(reserve.write(`${"9".repeat(64)}.png`, Buffer.alloc(4)), (error) => error.status === 503);
    assert.equal((await fs.readdir(dir)).length, 1);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

function fakeService() {
  const token = jwt.sign({ id: 2 }, secret, { expiresIn: "1h", jwtid: randomBytes(8).toString("hex") });
  const image = { imageId, ownerId: 2, campaignId: 4, expiresAt: new Date(now.getTime() + 10000), storageKey: `${"a".repeat(64)}.png`, contentType: "image/png", sizeBytes: 20 };
  image.update = async (values) => Object.assign(image, values);
  const user = { userId: 2, role: "public", status: "active" };
  const session = { sessionId: 3, userId: 2, token, status: "active" };
  const campaign = { campaignId: 4, createdBy: 2, status: "pending", deletedAt: null };
  const file = { close: async () => {} };
  const storage = { open: async () => ({ file, stat: { size: 20 } }) };
  const models = {
    CampaignImage: { findOne: async () => image, findByPk: async (id) => id === imageId ? image : null, findAll: async () => [image] },
    Campaign: { findByPk: async () => campaign }, User: { findByPk: async () => user },
    UserSession: { findByPk: async () => session, findOne: async () => session },
  };
  return { service: createCampaignImageService(models, { storage, now: () => now, secret: () => secret }), models, storage, image, user, session, campaign, token };
}

test("private URL grants only the active owning account or current admin, without exposing the JWT", async () => {
  const data = fakeService();
  const url = await data.service.buildImageUrl(4, { audience: "owner", currentUser: { id: 2 }, token: data.token });
  assert.ok(url.startsWith(`/api/campaign-images/${imageId}/content?ticket=`));
  assert.ok(!url.includes(data.token));
  const ticket = new URL(url, "https://example.test").searchParams.get("ticket");
  assert.equal((await data.service.content(imageId, ticket)).contentType, "image/png");
  await assert.rejects(data.service.content(imageId), (error) => error.status === 404);
  data.image.ownerId = 7;
  await assert.rejects(data.service.buildImageUrl(4, { audience: "owner", currentUser: { id: 2 }, token: data.token }), (error) => error.status === 404);
  data.user.role = "admin";
  assert.ok(await data.service.buildImageUrl(4, { audience: "admin", currentUser: { id: 2 }, token: data.token }));
});

test("creation receipt uses one transaction connection for image, campaign, account and session reads", async () => {
  const data = fakeService();
  const visited = [];
  for (const [model, method, result] of [
    ["CampaignImage", "findOne", data.image], ["Campaign", "findByPk", data.campaign],
    ["UserSession", "findOne", data.session], ["User", "findByPk", data.user],
  ]) {
    data.models[model][method] = async (...args) => {
      const options = method === "findOne" ? args[0] : args[1];
      assert.equal(options.transaction, transaction, `${model} must reuse the creation transaction`);
      visited.push(model);
      return result;
    };
  }
  const url = await data.service.buildImageUrl(4, { audience: "owner", currentUser: { id: 2 }, token: data.token, transaction });
  assert.match(url, /\?ticket=/);
  assert.deepEqual(visited, ["CampaignImage", "Campaign", "UserSession", "User"]);
});

test("private delivery immediately rechecks logout, suspension, demotion, attachment and deletion", async () => {
  for (const mutate of [
    (data) => { data.session.status = "expired"; }, (data) => { data.user.status = "suspended"; },
    (data) => { data.image.ownerId = 9; }, (data) => { data.image.campaignId = null; },
    (data) => { data.campaign.deletedAt = now; }, (data) => { data.session.token = "new-token"; },
  ]) {
    const data = fakeService();
    const url = await data.service.buildImageUrl(4, { audience: "owner", currentUser: { id: 2 }, token: data.token });
    const ticket = new URL(url, "https://example.test").searchParams.get("ticket");
    mutate(data);
    await assert.rejects(data.service.content(imageId, ticket), (error) => error.status === 404);
  }
});

test("public URLs only work while attached to approved, non-deleted campaigns", async () => {
  const data = fakeService();
  assert.equal(await data.service.buildImageUrl(4), null);
  data.campaign.status = "approved";
  const url = await data.service.buildImageUrl(4);
  assert.equal(url, `/api/campaign-images/${imageId}/content`);
  data.image.expiresAt = new Date(0); // Attached images do not expire with the initial upload reference.
  assert.equal((await data.service.content(imageId)).sizeBytes, 20);
  data.campaign.status = "pending";
  await assert.rejects(data.service.content(imageId), (error) => error.status === 404);
});

test("image attachment requires a transaction, the correct owner and a fresh unused reference", async () => {
  const data = fakeService();
  await assert.rejects(data.service.attachImage(imageId, 4, 2), /requires a transaction/);
  for (const change of [{ ownerId: 9, campaignId: null }, { ownerId: 2, campaignId: 4 }, { ownerId: 2, campaignId: null, expiresAt: new Date(0) }]) {
    Object.assign(data.image, change);
    await assert.rejects(data.service.attachImage(imageId, 4, 2, transaction), (error) => error.status === 422);
  }
  Object.assign(data.image, { ownerId: 2, campaignId: null, expiresAt: new Date(now.getTime() + 1000) });
  data.models.CampaignImage.findOne = async () => null;
  await data.service.attachImage(imageId, 4, 2, transaction);
  assert.equal(data.image.campaignId, 4);
});

test("owner photo removal detaches and expires the old upload, clearing legacy fallback", async () => {
  const data = fakeService();
  data.campaign.imageUrl = "https://example.test/old.jpg";
  await data.service.applyCampaignImageChange({ campaign: data.campaign, user: { id: 2 }, transaction });
  assert.ok(data.campaign.imageUrl);
  await assert.rejects(data.service.applyCampaignImageChange({ campaign: data.campaign, user: { id: 2 }, transaction, imageId, removeImage: true }), (error) => error.status === 422);
  await data.service.applyCampaignImageChange({ campaign: data.campaign, user: { id: 2 }, transaction, removeImage: true });
  assert.equal(data.image.campaignId, null);
  assert.equal(data.image.expiresAt, now);
  assert.equal(data.campaign.imageUrl, null);
});

test("multipart route accepts one file and rejects unexpected fields, duplicate files and oversize", async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  const token = jwt.sign({ id: 2 }, secret, { expiresIn: "1h" });
  const file = await makeFile();
  let calls = 0;
  const models = {
    UserSession: { findOne: async () => ({ userId: 2, token, status: "active" }) },
    User: { findByPk: async () => ({ userId: 2, role: "public", status: "active" }) },
  };
  const service = { upload: async (input, user, suppliedToken) => {
    assert.equal(suppliedToken, token);
    assert.equal(user.id, 2);
    const decoded = await decodeImage(input);
    calls += 1;
    return { imageId, contentType: decoded.contentType, sizeBytes: decoded.bytes.length, expiresAt: new Date(Date.now() + 10000).toISOString() };
  } };
  const app = express();
  app.use("/api/campaign-images", createCampaignImageRouter(models, { service }));
  const server = await new Promise((resolve) => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
  async function upload({ files = 1, bytes = file.buffer, field, auth = true } = {}) {
    const form = new FormData();
    for (let index = 0; index < files; index += 1) form.append("file", new Blob([bytes], { type: "image/png" }), "photo.png");
    if (field) form.append(field, "extra");
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/campaign-images`, { method: "POST", headers: auth ? { Authorization: `Bearer ${token}` } : {}, body: form });
    return { status: response.status, body: await response.json() };
  }
  try {
    const result = await upload();
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal((await upload({ auth: false })).status, 401);
    assert.equal((await upload({ files: 0 })).status, 422);
    assert.equal((await upload({ files: 2 })).status, 422);
    assert.equal((await upload({ field: "ownerId" })).status, 422);
    assert.equal((await upload({ bytes: Buffer.alloc(MAX_IMAGE_BYTES + 1) })).status, 413);
    assert.equal(calls, 1);
    await t.test("upload route preserves only the known safe storage-capacity 503 response", async () => {
      for (const [status, code, expectedStatus, expectedCode, expectedMessage] of [
        [503, "IMAGE_STORAGE_FULL", 503, "IMAGE_STORAGE_FULL", "Photo storage is temporarily unavailable. Please try again later"],
        [503, "UNEXPECTED_STORAGE_ERROR", 500, "INTERNAL_SERVER_ERROR", "The photo could not be processed"],
        [500, "IMAGE_STORAGE_FULL", 500, "INTERNAL_SERVER_ERROR", "The photo could not be processed"],
      ]) {
        service.upload = async () => { throw Object.assign(new Error("private filesystem and database details"), { status, code, fieldErrors: { privatePath: "not for clients" } }); };
        const error = await upload();
        assert.deepEqual(error, { status: expectedStatus, body: { status: expectedStatus, code: expectedCode, message: expectedMessage, fieldErrors: null } });
      }
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
