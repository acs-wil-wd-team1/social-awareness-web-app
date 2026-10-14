"use strict";

require("dotenv").config({ quiet: true });
if (process.env.RUN_DB_INTEGRATION !== "1" || process.env.NODE_ENV !== "test"
  || !/^[A-Za-z0-9_]+_test$/.test(process.env.DB_NAME_TEST || "")
  || process.env.DB_NAME_TEST === process.env.DB_NAME
  || !["localhost", "127.0.0.1", "::1"].includes(process.env.DB_HOST)
  || !process.env.JWT_SECRET) {
  throw new Error("Engagement integration requires RUN_DB_INTEGRATION=1, NODE_ENV=test, a separate migrated local DB_NAME_TEST ending _test, and JWT_SECRET.");
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

const tag = `engagement-${randomBytes(8).toString("hex")}`;
const users = [];
const businesses = [];
const campaigns = [];
let category, passwordHash, server, origin, a, b, ownerA, ownerB, noProfile, admin, suspended, businessA, businessB, cause, offerA, offerB;

async function makeUser(role = "public", status = "active") {
  const user = await db.User.create({ fullName: tag, email: `${tag}-${users.length}@example.test`, passwordHash, role, status });
  users.push(user);
  return user;
}

async function token(user, options = {}) {
  const value = jwt.sign({ id: user.userId, role: options.claimedRole ?? user.role, status: "active" }, process.env.JWT_SECRET, {
    expiresIn: options.expired ? -1 : "1h", jwtid: randomBytes(8).toString("hex"),
  });
  await db.UserSession.create({ userId: options.sessionUserId ?? user.userId, token: value, ipAddress: "127.0.0.1", userAgent: tag, status: options.loggedOut ? "expired" : "active" });
  return value;
}

async function makeCampaign(overrides = {}) {
  const row = await db.Campaign.create({
    title: `${tag} campaign ${campaigns.length}`, description: "Disposable test campaign", categoryId: category.categoryId,
    createdBy: a.userId, businessId: null, imageUrl: null, status: "approved", deletedAt: null,
    startDate: "2028-02-28", endDate: "2028-03-01", ...overrides,
  });
  campaigns.push(row);
  return row;
}

async function request(path, { method = "GET", auth, body, rawBody } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(body !== undefined || rawBody !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json(), headers: response.headers };
}

const contact = (overrides = {}) => ({ name: "Alex Fixture", email: "alex@example.test", message: "Please share the event details.", ...overrides });
const participationPath = campaign => `/api/campaigns/${campaign.campaignId}/participation`;
const enquiryPath = campaign => `/api/campaigns/${campaign.campaignId}/enquiries`;

describe("engagement HTTP and MySQL integration", () => {
  before(async () => {
    await db.sequelize.authenticate();
    passwordHash = await bcrypt.hash("DisposableFixture123!", 10);
    a = await makeUser(); b = await makeUser(); ownerA = await makeUser("business_owner"); ownerB = await makeUser("business_owner");
    noProfile = await makeUser("business_owner"); admin = await makeUser("admin"); suspended = await makeUser("public", "suspended");
    category = await db.Category.create({ categoryName: tag });
    for (const owner of [ownerA, ownerB]) businesses.push(await db.Business.create({ ownerId: owner.userId, businessName: `${tag} business ${businesses.length}` }));
    [businessA, businessB] = businesses;
    cause = await makeCampaign();
    offerA = await makeCampaign({ businessId: businessA.businessId, createdBy: ownerA.userId });
    offerB = await makeCampaign({ businessId: businessB.businessId, createdBy: ownerB.userId });
    await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    try {
      const userIds = users.map(row => row.userId);
      const campaignIds = campaigns.map(row => row.campaignId);
      // Remove dependent rows before campaigns. Every condition uses this run's IDs;
      // other test files and pre-existing database rows are never reset or truncated.
      if (campaignIds.length) {
        await db.Lead.destroy({ where: { campaignId: { [Op.in]: campaignIds } } });
        await db.Participation.destroy({ where: { campaignId: { [Op.in]: campaignIds } } });
        await db.Campaign.destroy({ where: { campaignId: { [Op.in]: campaignIds } }, force: true });
      }
      if (businesses.length) await db.Business.destroy({ where: { businessId: { [Op.in]: businesses.map(row => row.businessId) } } });
      if (userIds.length) {
        await db.UserSession.destroy({ where: { userId: { [Op.in]: userIds } } });
        await db.User.destroy({ where: { userId: { [Op.in]: userIds } } });
      }
      if (category) await db.Category.destroy({ where: { categoryId: category.categoryId } });
    } finally { await db.sequelize.close(); }
  });

  it("protects every route using active sessions and current account roles", async () => {
    const routes = [
      [participationPath(cause), {}], [participationPath(cause), { method: "PUT", body: { status: "joined" } }],
      ["/api/participations/mine", {}], [enquiryPath(offerA), { method: "POST", body: contact() }], ["/api/business/me/enquiries", {}],
    ];
    const invalidSessions = [undefined, "bad-token", await token(a, { expired: true }), await token(a, { loggedOut: true }), await token(a, { sessionUserId: b.userId })];
    for (const [path, options] of routes) {
      for (const auth of invalidSessions) assert.equal((await request(path, { ...options, auth })).status, 401, path);
      assert.equal((await request(path, { ...options, auth: await token(admin, { claimedRole: "public" }) })).status, 403, path);
      const inactive = await request(path, { ...options, auth: await token(suspended) });
      assert.equal(inactive.status, 403); assert.equal(inactive.body.code, "ACCOUNT_SUSPENDED");
    }
    assert.equal((await request("/api/business/me/enquiries", { auth: await token(a) })).status, 403);
    const profile = await request("/api/business/me/enquiries", { auth: await token(noProfile) });
    assert.equal(profile.status, 409); assert.equal(profile.body.code, "BUSINESS_PROFILE_REQUIRED");
  });

  it("persists one join, reuses it through repeated join/withdraw/rejoin and preserves its first timestamp", async () => {
    const auth = await token(a);
    assert.deepEqual((await request(participationPath(cause), { auth })).body, { participation: null });
    const first = await request(participationPath(cause), { method: "PUT", auth, body: { status: "joined" } });
    assert.equal(first.status, 200); assert.match(first.headers.get("cache-control"), /private, no-store/);
    const record = first.body.participation;
    assert.equal(record.campaignId, cause.campaignId); assert.equal(record.userId, undefined);
    for (const status of ["joined", "withdrawn", "withdrawn", "joined"]) {
      const result = await request(participationPath(cause), { method: "PUT", auth, body: { status } });
      assert.equal(result.status, 200); assert.deepEqual(result.body.participation, { ...record, status });
    }
    const saved = await db.Participation.findOne({ where: { userId: a.userId, campaignId: cause.campaignId } });
    assert.equal(saved.status, "joined"); assert.equal(saved.participatedAt.toISOString(), record.participatedAt);
    assert.equal(await db.Participation.count({ where: { userId: a.userId, campaignId: cause.campaignId } }), 1);
  });

  it("serialises concurrent first joins using the campaign lock and unique participant key", async () => {
    const fixture = await makeCampaign(); const auth = await token(b);
    const results = await Promise.all(Array.from({ length: 8 }, () => request(participationPath(fixture), { method: "PUT", auth, body: { status: "joined" } })));
    results.forEach(result => { assert.equal(result.status, 200); assert.deepEqual(result.body, results[0].body); });
    assert.equal(await db.Participation.count({ where: { userId: b.userId, campaignId: fixture.campaignId } }), 1);
  });

  it("keeps own reconciliation and withdrawal after pending/rejected/deleted changes without exposing titles", async () => {
    const member = await makeUser(); const outsider = await makeUser();
    const auth = await token(member); const other = await token(outsider);
    for (const changed of [{ status: "pending" }, { status: "rejected" }, { deletedAt: new Date() }]) {
      const fixture = await makeCampaign();
      const joined = await request(participationPath(fixture), { method: "PUT", auth, body: { status: "joined" } });
      await fixture.update({ ...changed, title: `${tag} PRIVATE EDIT DO NOT DISCLOSE` });
      const own = await request(participationPath(fixture), { auth });
      assert.equal(own.status, 200); assert.deepEqual(own.body, joined.body);
      const history = await request("/api/participations/mine", { auth });
      assert.equal(history.status, 200);
      assert.equal(history.body.participations.find(row => row.campaignId === fixture.campaignId).campaign, null);
      assert.ok(!JSON.stringify(history.body).includes("PRIVATE EDIT"));
      for (const options of [{}, { method: "PUT", body: { status: "withdrawn" } }]) {
        const denied = await request(participationPath(fixture), { ...options, auth: other });
        assert.equal(denied.status, 404); assert.equal(denied.body.code, "CAMPAIGN_NOT_FOUND");
      }
      const withdrawn = await request(participationPath(fixture), { method: "PUT", auth, body: { status: "withdrawn" } });
      assert.equal(withdrawn.status, 200); assert.deepEqual(withdrawn.body.participation, { ...joined.body.participation, status: "withdrawn" });
      assert.equal((await request(participationPath(fixture), { method: "PUT", auth, body: { status: "joined" } })).status, 404);
    }
  });

  it("rejects wrong campaign types, invalid IDs and withdrawals without prior participation", async () => {
    const auth = await token(await makeUser());
    assert.equal((await request(participationPath(cause), { method: "PUT", auth, body: { status: "withdrawn" } })).body.code, "PARTICIPATION_NOT_FOUND");
    for (const options of [{}, { method: "PUT", body: { status: "joined" } }]) {
      const result = await request(participationPath(offerA), { ...options, auth });
      assert.equal(result.status, 409); assert.equal(result.body.code, "CAMPAIGN_TYPE_MISMATCH");
    }
    const result = await request(enquiryPath(cause), { method: "POST", auth, body: contact() });
    assert.equal(result.status, 409); assert.equal(result.body.code, "CAMPAIGN_TYPE_MISMATCH");
    for (const id of ["abc", "0", "2147483648"]) assert.equal((await request(`/api/campaigns/${id}/participation`, { auth })).status, 400);
  });

  it("returns stable, owner-scoped participation pages and empty past-end results", async () => {
    const member = await makeUser(); const auth = await token(member);
    const rows = [];
    for (let i = 0; i < 3; i++) {
      const fixture = await makeCampaign();
      rows.push(await db.Participation.create({ campaignId: fixture.campaignId, userId: member.userId, status: i === 1 ? "withdrawn" : "joined", participatedAt: new Date("2026-10-01T00:00:00.000Z") }));
    }
    const first = await request(`/api/participations/mine?page=1&pageSize=2&userId=${a.userId}`, { auth });
    assert.equal(first.status, 200); assert.equal(first.body.total, 3);
    assert.deepEqual(first.body.participations.map(row => row.id), [rows[2].participationId, rows[1].participationId]);
    first.body.participations.forEach(row => { assert.equal(row.campaign.type, "cause"); assert.equal(row.campaign.status, "approved"); });
    const last = await request("/api/participations/mine?page=3&pageSize=2", { auth });
    assert.deepEqual(last.body, { participations: [], page: 3, pageSize: 2, total: 3 });
  });

  it("persists enquiries with server-selected recipient and exposes them only in that owner's inbox", async () => {
    const auth = await token(a);
    const result = await request(enquiryPath(offerA), { method: "POST", auth, body: contact({ name: " Alex Fixture ", email: " ALEX@EXAMPLE.TEST ", phone: " 0400000000 " }) });
    assert.equal(result.status, 201);
    assert.equal(result.body.enquiry.businessId, businessA.businessId); assert.equal(result.body.enquiry.email, "alex@example.test");
    assert.equal(result.body.enquiry.phone, "0400000000"); assert.equal(result.body.enquiry.userId, undefined);
    const saved = await db.Lead.findByPk(result.body.enquiry.id);
    assert.equal(saved.userId, a.userId); assert.equal(saved.businessId, businessA.businessId);
    assert.equal(saved.createdAt.toISOString(), result.body.enquiry.createdAt);
    const own = await request("/api/business/me/enquiries?page=1&pageSize=10", { auth: await token(ownerA) });
    assert.equal(own.status, 200); assert.match(own.headers.get("cache-control"), /private, no-store/);
    assert.ok(own.body.enquiries.some(row => row.id === saved.leadId));
    const other = await request(`/api/business/me/enquiries?businessId=${businessA.businessId}&ownerId=${ownerA.userId}`, { auth: await token(ownerB) });
    assert.equal(other.status, 200); assert.deepEqual(other.body.enquiries, []); assert.equal(other.body.total, 0);
    const businessSender = await request(enquiryPath(offerB), { method: "POST", auth: await token(ownerA), body: contact() });
    assert.equal(businessSender.status, 201); assert.equal(businessSender.body.enquiry.phone, null);
  });

  it("rejects invalid/forged enquiry bodies before saving anything", async () => {
    const auth = await token(a); const count = await db.Lead.count({ where: { campaignId: offerA.campaignId } });
    for (const body of [null, [], {}, contact({ email: "bad" }), contact({ message: " " }), contact({ name: "x".repeat(101) }),
      contact({ message: "x".repeat(2001) }), contact({ phone: 123 }), contact({ phone: "x".repeat(21) }),
      ...["userId", "businessId", "campaignId", "status"].map(key => contact({ [key]: 1 }))]) {
      const result = await request(enquiryPath(offerA), { method: "POST", auth, body });
      assert.equal(result.status, 422); assert.equal(result.body.code, "VALIDATION_FAILED");
    }
    assert.equal(await db.Lead.count({ where: { campaignId: offerA.campaignId } }), count);
    for (const body of [{}, { status: "unknown" }, { status: "joined", userId: b.userId }]) {
      assert.equal((await request(participationPath(cause), { method: "PUT", auth, body })).status, 422);
    }
  });

  it("retains but omits incomplete legacy enquiries with filtered totals, null private summaries and stable paging", async () => {
    const owner = await makeUser("business_owner");
    const business = await db.Business.create({ ownerId: owner.userId, businessName: `${tag} legacy inbox` }); businesses.push(business);
    const fixture = await makeCampaign({ businessId: business.businessId, createdBy: owner.userId });
    const auth = await token(owner); const created = [];
    for (let i = 0; i < 3; i++) created.push(await db.Lead.create({ campaignId: fixture.campaignId, businessId: business.businessId, userId: a.userId, ...contact(), phone: null, createdAt: new Date("2026-10-01T00:00:00.000Z") }));
    const legacy = await db.Lead.create({ campaignId: fixture.campaignId, businessId: business.businessId, userId: null, name: "Legacy", email: "legacy@example.test", message: null });
    await fixture.update({ status: "rejected", title: `${tag} PRIVATE EDIT` });
    const result = await request("/api/business/me/enquiries?page=1&pageSize=2", { auth });
    assert.equal(result.status, 200); assert.equal(result.body.total, 3);
    assert.deepEqual(result.body.enquiries.map(row => row.id), [created[2].leadId, created[1].leadId]);
    result.body.enquiries.forEach(row => assert.equal(row.campaign, null));
    assert.ok(await db.Lead.findByPk(legacy.leadId));
    assert.deepEqual((await request("/api/business/me/enquiries?page=3&pageSize=2", { auth })).body, { enquiries: [], page: 3, pageSize: 2, total: 3 });
  });

  it("rejects malformed pagination and returns structured JSON parse errors without data leakage", async () => {
    for (const [path, auth] of [["/api/participations/mine", await token(a)], ["/api/business/me/enquiries", await token(ownerA)]]) {
      for (const query of ["page=0", "page=", "page=1&page=2", "pageSize=101", "pageSize=x", "pageSize=1.5"]) {
        const result = await request(`${path}?${query}`, { auth }); assert.equal(result.status, 422); assert.equal(result.body.code, "VALIDATION_FAILED");
      }
    }
    const result = await request(participationPath(cause), { method: "PUT", auth: await token(a), rawBody: "{broken" });
    assert.equal(result.status, 422); assert.equal(result.body.code, "VALIDATION_FAILED"); assert.equal(result.body.stack, undefined);
  });

  it("rolls back an enquiry if persistence fails and hides raw database details", async () => {
    const auth = await token(a); const count = await db.Lead.count({ where: { campaignId: offerA.campaignId } });
    const original = db.Lead.create;
    db.Lead.create = async function (...args) { await original.apply(this, args); throw new Error("private contact SQL must not appear"); };
    try {
      const result = await request(enquiryPath(offerA), { method: "POST", auth, body: contact() });
      assert.equal(result.status, 500);
      assert.deepEqual(result.body, { status: 500, code: "INTERNAL_SERVER_ERROR", message: "Something went wrong", fieldErrors: null });
    } finally { db.Lead.create = original; }
    assert.equal(await db.Lead.count({ where: { campaignId: offerA.campaignId } }), count);
  });

  it("waits for a competing campaign status change and rejects an ineligible join/enquiry", async () => {
    for (const isBusiness of [false, true]) {
      const fixture = await makeCampaign(isBusiness ? { businessId: businessA.businessId, createdBy: ownerA.userId } : {});
      const auth = await token(b);
      const transaction = await db.sequelize.transaction();
      let pending;
      try {
        await db.Campaign.findByPk(fixture.campaignId, { transaction, lock: transaction.LOCK.UPDATE });
        await db.Campaign.update({ status: "pending" }, { where: { campaignId: fixture.campaignId }, transaction });
        pending = request(isBusiness ? enquiryPath(fixture) : participationPath(fixture), {
          auth, method: isBusiness ? "POST" : "PUT", body: isBusiness ? contact() : { status: "joined" },
        });
        await transaction.commit();
      } catch (error) { if (!transaction.finished) await transaction.rollback(); throw error; }
      const result = await pending; assert.equal(result.status, 404); assert.equal(result.body.code, "CAMPAIGN_NOT_FOUND");
      assert.equal(await (isBusiness ? db.Lead : db.Participation).count({ where: { campaignId: fixture.campaignId } }), 0);
    }
  });
});
