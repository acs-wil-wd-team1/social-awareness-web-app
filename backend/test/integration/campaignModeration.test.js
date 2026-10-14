"use strict";

require("dotenv").config({ quiet: true });

// The caller must supply an isolated, already-migrated local test database.
if (process.env.RUN_DB_INTEGRATION !== "1" || process.env.NODE_ENV !== "test"
  || !/^[A-Za-z0-9_]+_test$/.test(process.env.DB_NAME_TEST || "")
  || process.env.DB_NAME_TEST === process.env.DB_NAME
  || !["localhost", "127.0.0.1", "::1"].includes(process.env.DB_HOST)
  || !process.env.JWT_SECRET) {
  throw new Error("Integration tests require RUN_DB_INTEGRATION=1, NODE_ENV=test, a separate local DB_NAME_TEST ending _test, and JWT_SECRET. Apply migrations to that test database first.");
}

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const db = require("../../src/database/models");
const app = require("../../src/app");
db.sequelize.options.logging = false;

const fixtureTag = `moderation-test-${randomBytes(8).toString("hex")}`;
const users = {};
const tokens = {};
let category;
let business;
let server;
let origin;

async function makeToken(user) {
  const token = jwt.sign({ id: user.userId, role: user.role, status: "active" }, process.env.JWT_SECRET, {
    expiresIn: "1h", jwtid: randomBytes(8).toString("hex"),
  });
  await db.UserSession.create({ userId: user.userId, token, ipAddress: "127.0.0.1", userAgent: fixtureTag, status: "active" });
  return token;
}

async function request(path, { method = "GET", token, value } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(value !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  return { status: response.status, body: await response.json() };
}

async function submit(role, title) {
  const result = await request("/api/campaigns", {
    method: "POST", token: tokens[role],
    value: { title: `${fixtureTag} ${title}`, description: "Fixture", categoryId: category.categoryId, startDate: "2028-01-01", endDate: "2028-01-02" },
  });
  assert.equal(result.status, 201);
  return result.body.campaign;
}

async function adminVersion(id) {
  const result = await request(`/api/campaigns/admin/${id}`, { token: tokens.admin });
  assert.equal(result.status, 200);
  return result.body.updatedAt;
}

const review = (id, value, { token = tokens.admin } = {}) => request(`/api/campaigns/admin/${id}/status`, { method: "PATCH", token, value });

describe("campaign posting, owner reads and admin moderation HTTP and MySQL integration", () => {
  before(async () => {
    await db.sequelize.authenticate();
    const passwordHash = await bcrypt.hash("IntegrationOnly123!", 10);
    for (const role of ["public", "business_owner", "admin"]) {
      users[role] = await db.User.create({ fullName: fixtureTag, email: `${fixtureTag}-${role}@example.test`, passwordHash, role, status: "active" });
      tokens[role] = await makeToken(users[role]);
    }
    category = await db.Category.create({ categoryName: fixtureTag });
    business = await db.Business.create({ ownerId: users.business_owner.userId, businessName: `${fixtureTag} Cafe`, website: "https://example.test" });
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    try {
      // Only rows created by this run are removed; never reset the database.
      const userIds = Object.values(users).map((user) => user.userId);
      const campaignIds = (await db.Campaign.findAll({ where: { createdBy: { [Op.in]: userIds } } })).map((row) => row.campaignId);
      if (campaignIds.length) await db.CampaignReview.destroy({ where: { campaignId: { [Op.in]: campaignIds } } });
      await db.Campaign.destroy({ where: { createdBy: { [Op.in]: userIds } } });
      if (business) await business.destroy();
      await db.UserSession.destroy({ where: { userId: { [Op.in]: userIds } } });
      await db.User.destroy({ where: { userId: { [Op.in]: userIds } } });
      if (category) await category.destroy();
    } finally {
      await db.sequelize.close();
    }
  });

  it("lets a business owner post a pending campaign linked to their own business", async () => {
    const campaign = await submit("business_owner", "business post");
    assert.equal(campaign.type, "business");
    assert.equal(campaign.businessId, business.businessId);
    assert.equal(campaign.status, "pending");
    assert.equal((await request(`/api/campaigns/${campaign.id}`)).status, 404);
  });

  it("scopes owner reads to the signed-in creator", async () => {
    const own = await submit("public", "owner scoped");
    const mine = await request("/api/campaigns/mine?status=pending&pageSize=100", { token: tokens.public });
    assert.equal(mine.status, 200);
    assert.ok(mine.body.campaigns.every((row) => row.createdBy === users.public.userId));
    assert.ok(mine.body.campaigns.some((row) => row.id === own.id));
    assert.equal((await request(`/api/campaigns/mine/${own.id}`, { token: tokens.business_owner })).status, 404);
    assert.equal((await request("/api/campaigns/mine", { token: tokens.admin })).status, 403);
    assert.equal((await request("/api/campaigns/mine")).status, 401);
  });

  it("restricts admin reads and decisions to current admins", async () => {
    const campaign = await submit("public", "admin only");
    for (const token of [null, tokens.public, tokens.business_owner]) {
      assert.ok([401, 403].includes((await request("/api/campaigns/admin", { token })).status));
      const result = await review(campaign.id, { status: "approved", expectedUpdatedAt: campaign.updatedAt }, { token });
      assert.ok([401, 403].includes(result.status));
    }
    await users.admin.update({ status: "suspended" });
    try {
      assert.equal((await request("/api/campaigns/admin", { token: tokens.admin })).body.code, "ACCOUNT_SUSPENDED");
    } finally {
      await users.admin.update({ status: "active" });
    }
    assert.equal(await db.CampaignReview.count({ where: { campaignId: campaign.id } }), 0);
  });

  it("approves a campaign, records the review and makes it public", async () => {
    const campaign = await submit("public", "approve me");
    const expectedUpdatedAt = await adminVersion(campaign.id);
    const result = await review(campaign.id, { status: "approved", comments: "Looks good", expectedUpdatedAt });
    assert.equal(result.status, 200);
    assert.equal(result.body.campaign.status, "approved");
    assert.ok(Date.parse(result.body.campaign.updatedAt) > Date.parse(expectedUpdatedAt));
    assert.equal(result.body.review.adminId, users.admin.userId);
    assert.equal((await request(`/api/campaigns/${campaign.id}`)).status, 200);

    const owner = await request(`/api/campaigns/mine/${campaign.id}`, { token: tokens.public });
    assert.equal(owner.body.review.action, "approved");
    assert.equal(owner.body.updatedAt, result.body.campaign.updatedAt);
  });

  it("requires a reason to reject and keeps rejected campaigns private", async () => {
    const campaign = await submit("public", "reject me");
    const expectedUpdatedAt = await adminVersion(campaign.id);
    const missing = await review(campaign.id, { status: "rejected", expectedUpdatedAt });
    assert.equal(missing.status, 422);
    assert.ok(missing.body.fieldErrors.comments);

    const result = await review(campaign.id, { status: "rejected", comments: "Add a location", expectedUpdatedAt });
    assert.equal(result.status, 200);
    assert.equal((await request(`/api/campaigns/${campaign.id}`)).status, 404);
    assert.equal((await request(`/api/campaigns/mine/${campaign.id}`, { token: tokens.public })).body.review.comments, "Add a location");
  });

  it("rejects stale versions and allows only one of two concurrent decisions", async () => {
    const campaign = await submit("public", "race");
    const stale = await review(campaign.id, { status: "approved", expectedUpdatedAt: "2020-01-01T00:00:00.000Z" });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, "CAMPAIGN_CHANGED");

    const expectedUpdatedAt = await adminVersion(campaign.id);
    const results = await Promise.all([
      review(campaign.id, { status: "approved", expectedUpdatedAt }),
      review(campaign.id, { status: "rejected", comments: "No", expectedUpdatedAt }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(results.find((r) => r.status === 409).body.code, "CAMPAIGN_ALREADY_REVIEWED");
    assert.equal(await db.CampaignReview.count({ where: { campaignId: campaign.id } }), 1);
  });

  it("validates review input and campaign IDs", async () => {
    const campaign = await submit("public", "validation");
    const expectedUpdatedAt = await adminVersion(campaign.id);
    const extra = await review(campaign.id, { status: "approved", adminId: users.public.userId, expectedUpdatedAt });
    assert.equal(extra.status, 422);
    assert.ok(extra.body.fieldErrors.adminId);
    assert.equal((await review(campaign.id, { status: "pending", expectedUpdatedAt })).status, 422);
    assert.equal((await review("abc", { status: "approved", expectedUpdatedAt })).status, 400);
    assert.equal((await review(2147483000, { status: "approved", expectedUpdatedAt })).status, 404);
    assert.equal(await db.CampaignReview.count({ where: { campaignId: campaign.id } }), 0);
  });
});
