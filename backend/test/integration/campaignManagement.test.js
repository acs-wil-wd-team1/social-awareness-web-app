"use strict";

require("dotenv").config({ quiet: true });
if (process.env.RUN_DB_INTEGRATION !== "1" || process.env.NODE_ENV !== "test"
  || !/^[A-Za-z0-9_]+_test$/.test(process.env.DB_NAME_TEST || "")
  || process.env.DB_NAME_TEST === process.env.DB_NAME
  || !["localhost", "127.0.0.1", "::1"].includes(process.env.DB_HOST)
  || !process.env.JWT_SECRET) {
  throw new Error("Integration tests require a separate migrated local DB_NAME_TEST ending _test, RUN_DB_INTEGRATION=1, NODE_ENV=test and JWT_SECRET");
}

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const db = require("../../src/database/models");
const app = require("../../src/app");
db.sequelize.options.logging = false;

const tag = `management-${randomBytes(8).toString("hex")}`;
const users = {};
const tokens = {};
let category;
let business;
let server;
let origin;

async function makeToken(user) {
  const token = jwt.sign({ id: user.userId, role: user.role, status: "active" }, process.env.JWT_SECRET, { expiresIn: "1h", jwtid: randomBytes(8).toString("hex") });
  await db.UserSession.create({ userId: user.userId, token, status: "active", ipAddress: "127.0.0.1", userAgent: tag });
  return token;
}
async function request(path, { method = "GET", token = tokens.admin, value } = {}) {
  const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(value !== undefined ? { "Content-Type": "application/json" } : {}) }, body: value === undefined ? undefined : JSON.stringify(value) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
async function createCampaign({ owner = "public", status = "pending", title = "campaign" } = {}) {
  const campaign = await db.Campaign.create({ createdBy: users[owner].userId, categoryId: category.categoryId, businessId: owner === "business" ? business.businessId : null, title: `${tag} ${title}`, description: "Fixture details", startDate: "2028-01-01", endDate: "2028-01-02", status });
  // Sequelize supplies its own create timestamp; explicitly persist our precision fixture.
  await db.sequelize.query("UPDATE campaigns SET updated_at = :version WHERE campaign_id = :campaignId", {
    replacements: { version: "2026-10-01 00:00:00.123", campaignId: campaign.campaignId },
  });
  return campaign.reload();
}
const versionOf = async (campaign) => (await campaign.reload()).updatedAt.toISOString();
const editBody = (expectedUpdatedAt, extra = {}) => ({ title: `${tag} edited`, description: "Changed details", categoryId: category.categoryId, startDate: "2028-01-01", endDate: "2028-01-02", expectedUpdatedAt, ...extra });

describe("owner and admin management HTTP/MySQL integration", () => {
  before(async () => {
    await db.sequelize.authenticate();
    for (const [key, role] of [["public", "public"], ["other", "public"], ["business", "business_owner"], ["admin", "admin"], ["secondAdmin", "admin"]]) {
      users[key] = await db.User.create({ fullName: `${tag} ${key}`, email: `${tag}-${key.toLowerCase()}@example.test`, passwordHash: "not-a-login-fixture", role, status: "active" });
      tokens[key] = await makeToken(users[key]);
    }
    category = await db.Category.create({ categoryName: tag });
    business = await db.Business.create({ ownerId: users.business.userId, businessName: tag });
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    try {
      db.ManagementAudit.removeHook("beforeCreate", "management-rollback-test");
      const userIds = Object.values(users).map((user) => user.userId);
      if (userIds.length) {
        const campaignIds = (await db.Campaign.findAll({ where: { createdBy: { [Op.in]: userIds } } })).map((campaign) => campaign.campaignId);
        await db.ManagementAudit.destroy({ where: { actorId: { [Op.in]: userIds } } });
        if (campaignIds.length) {
          await db.CampaignReview.destroy({ where: { campaignId: { [Op.in]: campaignIds } } });
          await db.Participation.destroy({ where: { campaignId: { [Op.in]: campaignIds } } });
          await db.Lead.destroy({ where: { campaignId: { [Op.in]: campaignIds } } });
          await db.Campaign.destroy({ where: { campaignId: { [Op.in]: campaignIds } } });
        }
        if (business) await business.destroy();
        await db.UserSession.destroy({ where: { userId: { [Op.in]: userIds } } });
        await db.User.destroy({ where: { userId: { [Op.in]: userIds } } });
      }
      if (category) await category.destroy();
    } finally { await db.sequelize.close(); }
  });

  it("checks every route's authentication, role, current status and session", async () => {
    const campaign = await createCampaign();
    for (const path of ["/admin/users", `/campaigns/admin/${campaign.campaignId}/reviews`]) {
      assert.equal((await request(path, { token: null })).status, 401);
      assert.equal((await request(path, { token: tokens.public })).status, 403);
    }
    for (const token of [null, tokens.admin, tokens.other]) {
      const result = await request(`/campaigns/mine/${campaign.campaignId}`, { method: "PATCH", token, value: editBody(await versionOf(campaign)) });
      assert.equal(result.status, token === null ? 401 : token === tokens.admin ? 403 : 404);
    }
    await users.public.update({ status: "suspended" });
    try {
      assert.equal((await request(`/campaigns/mine/${campaign.campaignId}`, { method: "DELETE", token: tokens.public, value: { expectedUpdatedAt: await versionOf(campaign) } })).status, 403);
    } finally { await users.public.update({ status: "active" }); }
  });

  it("edits each campaign status back to pending and preserves creator and business", async () => {
    for (const status of ["pending", "approved", "rejected"]) {
      const campaign = await createCampaign({ status, owner: status === "approved" ? "business" : "public" });
      const oldVersion = await versionOf(campaign);
      assert.match(oldVersion, /\.123Z$/);
      const result = await request(`/campaigns/mine/${campaign.campaignId}`, { method: "PATCH", token: status === "approved" ? tokens.business : tokens.public, value: editBody(oldVersion) });
      assert.equal(result.status, 200);
      assert.equal(result.body.campaign.status, "pending");
      assert.equal(result.body.campaign.createdBy, campaign.createdBy);
      assert.equal(result.body.campaign.businessId, campaign.businessId);
      assert.ok(Date.parse(result.body.campaign.updatedAt) > Date.parse(oldVersion));
      assert.equal(await versionOf(campaign), result.body.campaign.updatedAt);
      assert.equal((await request(`/campaigns/${campaign.campaignId}`, { token: null })).status, 404);
    }
  });

  it("allows one concurrent owner edit and rejects stale admin approval", async () => {
    const campaign = await createCampaign();
    const loadedVersion = await versionOf(campaign);
    const results = await Promise.all([1, 2].map((n) => request(`/campaigns/mine/${campaign.campaignId}`, { method: "PATCH", token: tokens.public, value: editBody(loadedVersion, { title: `${tag} concurrent ${n}` }) })));
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    const staleReview = await request(`/campaigns/admin/${campaign.campaignId}/status`, { method: "PATCH", value: { status: "approved", expectedUpdatedAt: loadedVersion } });
    assert.equal(staleReview.status, 409);
    assert.equal(staleReview.body.code, "CAMPAIGN_CHANGED");
    assert.equal(await db.CampaignReview.count({ where: { campaignId: campaign.campaignId } }), 0);
  });

  it("rejects forged/invalid owner fields, bad category and inaccessible campaigns without changes", async () => {
    const campaign = await createCampaign();
    const loadedVersion = await versionOf(campaign);
    for (const extra of [{ status: "approved" }, { businessId: business.businessId }, { categoryId: 2147483000 }, { imageId: "x", removeImage: true }, { removeImage: false }]) {
      assert.equal((await request(`/campaigns/mine/${campaign.campaignId}`, { method: "PATCH", token: tokens.public, value: editBody(loadedVersion, extra) })).status, 422);
    }
    assert.equal(await versionOf(campaign), loadedVersion);
    assert.equal((await request("/campaigns/mine/not-an-id", { method: "DELETE", token: tokens.public, value: { expectedUpdatedAt: loadedVersion } })).status, 400);
  });

  it("keeps then removes a legacy campaign photo", async () => {
    const campaign = await createCampaign();
    await campaign.update({ imageUrl: "https://example.test/legacy.jpg" });
    const kept = await request(`/campaigns/mine/${campaign.campaignId}`, { method: "PATCH", token: tokens.public, value: editBody(await versionOf(campaign)) });
    assert.equal(kept.status, 200);
    assert.equal(kept.body.campaign.imageUrl, "https://example.test/legacy.jpg");
    const removed = await request(`/campaigns/mine/${campaign.campaignId}`, { method: "PATCH", token: tokens.public, value: editBody(kept.body.campaign.updatedAt, { removeImage: true }) });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.campaign.imageUrl, null);
    assert.equal((await campaign.reload()).imageUrl, null);
  });

  it("paginates review history and retains past decisions after unpublishing", async () => {
    const campaign = await createCampaign({ status: "approved" });
    const reviewedAt = new Date("2026-10-01T00:00:00Z");
    const older = await db.CampaignReview.create({ campaignId: campaign.campaignId, adminId: users.admin.userId, action: "rejected", comments: "Earlier feedback", reviewedAt });
    const newer = await db.CampaignReview.create({ campaignId: campaign.campaignId, adminId: users.admin.userId, action: "approved", comments: null, reviewedAt });
    const list = await request(`/campaigns/admin/${campaign.campaignId}/reviews?pageSize=1`);
    assert.equal(list.status, 200);
    assert.equal(list.body.total, 2);
    assert.equal(list.body.reviews[0].id, newer.reviewId);
    const page2 = await request(`/campaigns/admin/${campaign.campaignId}/reviews?page=2&pageSize=1`);
    assert.equal(page2.body.reviews[0].id, older.reviewId);
    const oldVersion = await versionOf(campaign);
    const result = await request(`/campaigns/admin/${campaign.campaignId}/publication`, { method: "PATCH", value: { status: "pending", reason: " Check event ", expectedUpdatedAt: oldVersion } });
    assert.equal(result.status, 200);
    assert.equal(result.body.campaign.status, "pending");
    assert.ok(Date.parse(result.body.campaign.updatedAt) > Date.parse(oldVersion));
    assert.equal(await db.CampaignReview.count({ where: { campaignId: campaign.campaignId } }), 2);
    assert.equal((await request(`/campaigns/${campaign.campaignId}`, { token: null })).status, 404);
    assert.equal((await db.ManagementAudit.findOne({ where: { targetType: "campaign", targetId: campaign.campaignId } })).reason, "Check event");
  });

  it("requires current versions and reasons for admin actions", async () => {
    const campaign = await createCampaign({ status: "approved" });
    const oldVersion = await versionOf(campaign);
    await request(`/campaigns/mine/${campaign.campaignId}`, { method: "PATCH", token: tokens.public, value: editBody(oldVersion) });
    for (const [path, method, value] of [
      [`/campaigns/admin/${campaign.campaignId}/publication`, "PATCH", { status: "pending", reason: "x", expectedUpdatedAt: oldVersion }],
      [`/campaigns/admin/${campaign.campaignId}`, "DELETE", { reason: "x", expectedUpdatedAt: oldVersion }],
    ]) assert.equal((await request(path, { method, value })).body.code, "CAMPAIGN_CHANGED");
    assert.equal((await request(`/campaigns/admin/${campaign.campaignId}`, { method: "DELETE", value: { reason: "", expectedUpdatedAt: await versionOf(campaign) } })).status, 422);
    assert.equal(await db.ManagementAudit.count({ where: { targetType: "campaign", targetId: campaign.campaignId } }), 0);
  });

  it("owner and admin deletion retain records, block reads and do not repeat audits", async () => {
    for (const adminDelete of [false, true]) {
      const campaign = await createCampaign({ status: "approved" });
      await db.CampaignReview.create({ campaignId: campaign.campaignId, adminId: users.admin.userId, action: "approved" });
      await db.Participation.create({ campaignId: campaign.campaignId, userId: users.other.userId, status: "joined" });
      const path = `/campaigns/${adminDelete ? "admin" : "mine"}/${campaign.campaignId}`;
      const options = { method: "DELETE", token: adminDelete ? tokens.admin : tokens.public, value: { expectedUpdatedAt: await versionOf(campaign), ...(adminDelete ? { reason: "Duplicate entry" } : {}) } };
      assert.deepEqual(await request(path, options), { status: 204, body: null });
      assert.equal((await request(path, options)).status, 404);
      assert.ok((await campaign.reload()).deletedAt);
      assert.equal(campaign.deletedBy, adminDelete ? users.admin.userId : users.public.userId);
      assert.equal(await db.CampaignReview.count({ where: { campaignId: campaign.campaignId } }), 1);
      assert.equal(await db.Participation.count({ where: { campaignId: campaign.campaignId } }), 1);
      for (const [readPath, token] of [[`/campaigns/${campaign.campaignId}`, null], [`/campaigns/mine/${campaign.campaignId}`, tokens.public], [`/campaigns/admin/${campaign.campaignId}`, tokens.admin], [`/campaigns/admin/${campaign.campaignId}/reviews`, tokens.admin]]) {
        assert.equal((await request(readPath, { token })).status, 404);
      }
      assert.equal((await request(`/campaigns/admin/${campaign.campaignId}/status`, { method: "PATCH", value: { status: "approved", expectedUpdatedAt: campaign.updatedAt.toISOString() } })).status, 404);
      assert.equal(await db.ManagementAudit.count({ where: { targetType: "campaign", targetId: campaign.campaignId } }), 1);
    }
  });

  it("returns only safe account fields with stable pagination, search and status filters", async () => {
    const first = await request(`/admin/users?search=${tag.toUpperCase()}&pageSize=2&status=active`);
    assert.equal(first.status, 200);
    assert.equal(first.body.total, 5);
    assert.equal(first.body.users.length, 2);
    for (const user of first.body.users) assert.deepEqual(Object.keys(user).sort(), ["id", "name", "email", "role", "status", "createdAt"].sort());
    assert.ok(first.body.users[0].id > first.body.users[1].id);
    const beyond = await request(`/admin/users?search=${tag}&page=100&pageSize=2`);
    assert.equal(beyond.status, 200);
    assert.deepEqual(beyond.body.users, []);
    for (const query of ["pageSize=101", "page=0", "status=pending", "search=x&search=y"]) assert.equal((await request(`/admin/users?${query}`)).status, 422);
  });

  it("protects all admin accounts and rejects role assignment", async () => {
    for (const user of [users.admin, users.secondAdmin]) {
      assert.equal((await request(`/admin/users/${user.userId}/status`, { method: "PATCH", value: { status: "suspended" } })).status, 403);
    }
    assert.equal((await request(`/admin/users/${users.other.userId}/status`, { method: "PATCH", value: { status: "active", role: "admin" } })).status, 422);
    assert.equal((await request("/admin/users/2147483000/status", { method: "PATCH", value: { status: "suspended" } })).status, 404);
  });

  it("suspends all active sessions atomically and reactivation needs a new login", async () => {
    const secondToken = await makeToken(users.other);
    const path = `/admin/users/${users.other.userId}/status`;
    const suspended = await request(path, { method: "PATCH", value: { status: "suspended" } });
    assert.equal(suspended.status, 200);
    assert.equal(suspended.body.user.status, "suspended");
    assert.equal(await db.UserSession.count({ where: { userId: users.other.userId, status: "active" } }), 0);
    const ended = await db.UserSession.findAll({ where: { userId: users.other.userId } });
    assert.ok(ended.every((session) => session.logoutAt));
    await request(path, { method: "PATCH", value: { status: "suspended" } });
    assert.equal(await db.ManagementAudit.count({ where: { targetType: "user", targetId: users.other.userId } }), 1);
    assert.equal((await request(path, { method: "PATCH", value: { status: "active" } })).body.user.status, "active");
    for (const token of [tokens.other, secondToken]) assert.equal((await request("/campaigns/mine", { token })).status, 401);
    tokens.other = await makeToken(users.other);
    assert.equal((await request("/campaigns/mine", { token: tokens.other })).status, 200);
  });

  it("rolls back state/session changes when an audit write fails", async () => {
    const campaign = await createCampaign({ status: "approved" });
    const oldVersion = await versionOf(campaign);
    db.ManagementAudit.addHook("beforeCreate", "management-rollback-test", (row) => {
      if ((row.targetType === "campaign" && row.targetId === campaign.campaignId) || (row.targetType === "user" && row.targetId === users.other.userId)) throw new Error("Intentional isolated audit failure");
    });
    try {
      const unpublished = await request(`/campaigns/admin/${campaign.campaignId}/publication`, { method: "PATCH", value: { status: "pending", reason: "Rollback fixture", expectedUpdatedAt: oldVersion } });
      assert.equal(unpublished.status, 500);
      assert.equal((await campaign.reload()).status, "approved");
      assert.equal(campaign.updatedAt.toISOString(), oldVersion);
      const suspended = await request(`/admin/users/${users.other.userId}/status`, { method: "PATCH", value: { status: "suspended" } });
      assert.equal(suspended.status, 500);
      assert.equal((await users.other.reload()).status, "active");
      assert.equal((await request("/campaigns/mine", { token: tokens.other })).status, 200);
    } finally { db.ManagementAudit.removeHook("beforeCreate", "management-rollback-test"); }
  });
});
