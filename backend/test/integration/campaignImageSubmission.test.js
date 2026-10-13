"use strict";

require("dotenv").config({ quiet: true });
if (process.env.RUN_DB_INTEGRATION !== "1" || process.env.NODE_ENV !== "test"
  || !/^[A-Za-z0-9_]+_test$/.test(process.env.DB_NAME_TEST || "")
  || process.env.DB_NAME_TEST === process.env.DB_NAME
  || !["localhost", "127.0.0.1", "::1"].includes(process.env.DB_HOST) || !process.env.JWT_SECRET) {
  throw new Error("Image submission integration tests require RUN_DB_INTEGRATION=1, NODE_ENV=test, a separate migrated local DB_NAME_TEST ending _test, and JWT_SECRET");
}

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const sharp = require("sharp");
const { Op } = require("sequelize");
const db = require("../../src/database/models");
const app = require("../../src/app");
db.sequelize.options.logging = false;

const fixtureTag = `image-submit-${randomBytes(8).toString("hex")}`;
const users = {};
const tokens = {};
const originalUploadDirectory = process.env.CAMPAIGN_UPLOAD_DIR;
let category, business, directory, server, origin, png;

function payload(overrides = {}) {
  return {
    title: `${fixtureTag} campaign`, description: "Campaign image submission integration fixture.",
    categoryId: category.categoryId, targetAudience: "Local neighbours",
    startDate: "2028-02-29", endDate: "2028-03-01", ...overrides,
  };
}

async function request(route, { method = "GET", key, value } = {}) {
  const response = await fetch(`${origin}${route}`, {
    method,
    headers: {
      ...(key ? { Authorization: `Bearer ${tokens[key]}` } : {}),
      ...(value === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

async function upload(key = "owner") {
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "campaign-photo.png");
  const response = await fetch(`${origin}/api/campaign-images`, {
    method: "POST", headers: { Authorization: `Bearer ${tokens[key]}` }, body: form,
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  assert.match(body.imageId, /^img_[a-f0-9]{48}$/);
  return body;
}

async function submit(imageId, key = "owner", overrides = {}) {
  return request("/api/campaigns", { method: "POST", key, value: payload({ ...(imageId ? { imageId } : {}), ...overrides }) });
}

async function content(route) {
  const response = await fetch(`${origin}${route}`);
  return { status: response.status, headers: response.headers, bytes: Buffer.from(await response.arrayBuffer()) };
}

async function approve(id) {
  const loaded = await request(`/api/campaigns/admin/${id}`, { key: "admin" });
  assert.equal(loaded.status, 200, JSON.stringify(loaded.body));
  const result = await request(`/api/campaigns/admin/${id}/status`, {
    method: "PATCH", key: "admin",
    value: { status: "approved", expectedUpdatedAt: loaded.body.updatedAt, comments: "Private review fixture: not public content" },
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
}

function assertPublicShape(campaign, { id, type = "cause", imageId = null } = {}) {
  assert.equal(campaign.id, id);
  assert.equal(campaign.type, type);
  assert.equal(campaign.categoryId, category.categoryId);
  assert.equal(campaign.category, category.categoryName);
  assert.equal(campaign.targetAudience, "Local neighbours");
  assert.equal(campaign.startDate, "2028-02-29");
  assert.equal(campaign.endDate, "2028-03-01");
  assert.equal(campaign.status, "approved");
  assert.ok(!Number.isNaN(Date.parse(campaign.createdAt)));
  assert.ok(!Number.isNaN(Date.parse(campaign.updatedAt)));
  assert.equal(campaign.imageUrl, imageId ? `/api/campaign-images/${imageId}/content` : null);
  for (const field of ["review", "reviews", "adminId", "comments", "storageKey", "imageId", "deletedAt", "deletedBy", "deletionReason", "token"]) {
    assert.equal(Object.hasOwn(campaign, field), false, `Public response must not expose ${field}`);
  }
  const encoded = JSON.stringify(campaign);
  assert.ok(!encoded.includes("Private review fixture"));
  assert.ok(!encoded.includes("?ticket="));
  for (const token of Object.values(tokens)) assert.ok(!encoded.includes(token));
}

describe("full application image upload, campaign submission and public reads", () => {
  before(async () => {
    await db.sequelize.authenticate();
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "causeconnect-image-submission-"));
    process.env.CAMPAIGN_UPLOAD_DIR = directory;
    png = await sharp({ create: { width: 5, height: 4, channels: 3, background: "green" } }).png().toBuffer();
    for (const [key, role] of [["owner", "public"], ["other", "public"], ["business", "business_owner"], ["admin", "admin"]]) {
      users[key] = await db.User.create({ fullName: fixtureTag, email: `${fixtureTag}-${key}@example.test`, passwordHash: "unused-fixture-hash", role, status: "active" });
      tokens[key] = jwt.sign({ id: users[key].userId, role, status: "active" }, process.env.JWT_SECRET, { expiresIn: "1h", jwtid: randomBytes(8).toString("hex") });
      await db.UserSession.create({ userId: users[key].userId, token: tokens[key], ipAddress: "127.0.0.1", userAgent: fixtureTag, status: "active" });
    }
    category = await db.Category.create({ categoryName: fixtureTag });
    // Existing business profile fixture; this suite does not implement Kim's profile API.
    business = await db.Business.create({ ownerId: users.business.userId, businessName: `${fixtureTag} business`, website: "https://example.test/business", abn: "fixture-private-abn" });
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    try {
      // Cleanup is limited to this run's generated users/category and temporary directory.
      const ids = Object.values(users).map((user) => user.userId);
      if (ids.length) {
        const campaigns = await db.Campaign.findAll({ where: { createdBy: { [Op.in]: ids } }, attributes: ["campaignId"] });
        const campaignIds = campaigns.map((row) => row.campaignId);
        await db.CampaignImage.destroy({ where: { ownerId: { [Op.in]: ids } } });
        if (campaignIds.length) await db.CampaignReview.destroy({ where: { campaignId: { [Op.in]: campaignIds } } });
        await db.Campaign.destroy({ where: { createdBy: { [Op.in]: ids } } });
        if (business) await business.destroy();
        await db.UserSession.destroy({ where: { userId: { [Op.in]: ids } } });
        await db.User.destroy({ where: { userId: { [Op.in]: ids } } });
      }
      if (category) await category.destroy();
    } finally {
      if (directory) await fs.rm(directory, { recursive: true, force: true });
      if (originalUploadDirectory === undefined) delete process.env.CAMPAIGN_UPLOAD_DIR;
      else process.env.CAMPAIGN_UPLOAD_DIR = originalUploadDirectory;
      await db.sequelize.close();
    }
  });

  it("uses the real app routes to upload, submit privately, review and publish a photo", async () => {
    const reference = await upload();
    const created = await submit(reference.imageId);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const receipt = created.body.campaign;
    assert.equal(receipt.status, "pending");
    assert.match(receipt.imageUrl, new RegExp(`^/api/campaign-images/${reference.imageId}/content\\?ticket=`));
    assert.ok(!receipt.imageUrl.includes(tokens.owner));
    assert.equal((await db.CampaignImage.findByPk(reference.imageId)).campaignId, receipt.id);
    const privateImage = await content(receipt.imageUrl);
    assert.equal(privateImage.status, 200);
    assert.equal(privateImage.headers.get("content-type"), "image/png");
    assert.match(privateImage.headers.get("cache-control"), /no-store/);
    assert.equal((await sharp(privateImage.bytes).metadata()).format, "png");
    assert.equal((await content(receipt.imageUrl.split("?")[0])).status, 404);
    assert.equal((await request(`/api/campaigns/${receipt.id}`)).status, 404);
    assert.equal((await request(`/api/campaigns/mine/${receipt.id}`, { key: "other" })).status, 404);
    for (const [route, key] of [[`/api/campaigns/mine/${receipt.id}`, "owner"], [`/api/campaigns/admin/${receipt.id}`, "admin"]]) {
      const loaded = await request(route, { key });
      assert.equal(loaded.status, 200, JSON.stringify(loaded.body));
      assert.equal((await content(loaded.body.imageUrl)).status, 200);
    }
    const privateList = await request(`/api/campaigns/mine?category=${category.categoryId}`, { key: "owner" });
    assert.equal(privateList.status, 200);
    assert.equal(privateList.body.total, 1);
    assert.equal((await content(privateList.body.campaigns[0].imageUrl)).status, 200);
    await approve(receipt.id);
    const published = await request(`/api/campaigns/${receipt.id}`);
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assertPublicShape(published.body, { id: receipt.id, imageId: reference.imageId });
    assert.equal(published.body.business, null);
    assert.equal((await content(published.body.imageUrl)).status, 200);
    const list = await request(`/api/campaigns?category=${category.categoryId}&status=pending`);
    assert.equal(list.status, 200);
    assert.equal(list.body.total, 1);
    assert.equal(list.body.campaigns.length, 1);
    assertPublicShape(list.body.campaigns[0], { id: receipt.id, imageId: reference.imageId });
  });

  it("rolls campaign creation back for wrong-owner, expired, missing and reused image references", async () => {
    const otherReference = await upload("other");
    const expired = await upload();
    await db.CampaignImage.update({ expiresAt: new Date(0) }, { where: { imageId: expired.imageId } });
    const used = await upload();
    const first = await submit(used.imageId);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const beforeCount = await db.Campaign.count({ where: { createdBy: users.owner.userId } });
    for (const imageId of [otherReference.imageId, expired.imageId, `img_${randomBytes(24).toString("hex")}`, used.imageId]) {
      const failed = await submit(imageId);
      assert.equal(failed.status, 422, JSON.stringify(failed.body));
      assert.equal(failed.body.code, "VALIDATION_FAILED");
      assert.ok(failed.body.fieldErrors.imageId);
      assert.equal(await db.Campaign.count({ where: { createdBy: users.owner.userId } }), beforeCount);
    }
    assert.equal((await db.CampaignImage.findByPk(otherReference.imageId)).campaignId, null);
    assert.equal((await db.CampaignImage.findByPk(expired.imageId)).campaignId, null);
    assert.equal((await db.CampaignImage.findByPk(used.imageId)).campaignId, first.body.campaign.id);
    assert.equal((await submit(otherReference.imageId, "other")).status, 201);
  });

  it("keeps an upload reusable after form validation failure and atomically allows only one submission", async () => {
    const reference = await upload();
    const beforeCount = await db.Campaign.count({ where: { createdBy: users.owner.userId } });
    assert.equal((await submit(reference.imageId, "owner", { title: " " })).status, 422);
    assert.equal((await db.CampaignImage.findByPk(reference.imageId)).campaignId, null);
    assert.equal(await db.Campaign.count({ where: { createdBy: users.owner.userId } }), beforeCount);
    const outcomes = await Promise.all([submit(reference.imageId), submit(reference.imageId)]);
    assert.deepEqual(outcomes.map((result) => result.status).sort(), [201, 422]);
    assert.equal(await db.Campaign.count({ where: { createdBy: users.owner.userId } }), beforeCount + 1);
    assert.equal((await db.CampaignImage.findByPk(reference.imageId)).campaignId, outcomes.find((result) => result.status === 201).body.campaign.id);
  });

  it("publishes aligned business summary, type, category and dates without private profile fields", async () => {
    const reference = await upload("business");
    const created = await submit(reference.imageId, "business");
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.campaign.type, "business");
    assert.equal(created.body.campaign.businessId, business.businessId);
    await approve(created.body.campaign.id);
    const result = await request(`/api/campaigns/${created.body.campaign.id}`);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assertPublicShape(result.body, { id: created.body.campaign.id, type: "business", imageId: reference.imageId });
    assert.deepEqual(result.body.business, { id: business.businessId, businessName: business.businessName, website: business.website });
    assert.ok(!JSON.stringify(result.body).includes("fixture-private-abn"));
    assert.equal((await content(result.body.imageUrl)).status, 200);
  });

  it("keeps public pagination totals aligned and validation failures structured", async () => {
    const query = `category=${category.categoryId}`;
    const first = await request(`/api/campaigns?${query}&page=1&pageSize=1`);
    const second = await request(`/api/campaigns?${query}&page=2&pageSize=1`);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(first.body.total, 2);
    assert.equal(second.body.total, 2);
    assert.equal(first.body.pageSize, 1);
    assert.equal(first.body.page, 1);
    assert.equal(second.body.page, 2);
    assert.equal(first.body.campaigns.length, 1);
    assert.equal(second.body.campaigns.length, 1);
    assert.notEqual(first.body.campaigns[0].id, second.body.campaigns[0].id);
    const beyond = await request(`/api/campaigns?${query}&page=3&pageSize=1`);
    assert.equal(beyond.status, 200);
    assert.deepEqual(beyond.body.campaigns, []);
    assert.equal(beyond.body.total, 2);
    for (const invalid of ["page=abc", "page=0", "pageSize=0", "pageSize=101", "page=1&page=2", "category=abc", `search=${"x".repeat(151)}`]) {
      const result = await request(`/api/campaigns?${invalid}`);
      assert.equal(result.status, 422, invalid);
      assert.equal(result.body.code, "VALIDATION_FAILED");
      assert.ok(result.body.fieldErrors);
      assert.equal(result.body.stack, undefined);
    }
  });
});
