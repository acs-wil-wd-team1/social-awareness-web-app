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

const fixtureTag = `campaign-test-${randomBytes(8).toString("hex")}`;
const users = [];
const categories = [];
let server;
let origin;
let publicUser;
let adminUser;
let ownerUser;
let publicToken;
let approvedId;

async function makeToken(user, { expired = false, loggedOut = false, role = user.role, sessionUserId = user.userId } = {}) {
  const token = jwt.sign({ id: user.userId, role, status: "active" }, process.env.JWT_SECRET, {
    expiresIn: expired ? -1 : "1h", jwtid: randomBytes(8).toString("hex"),
  });
  await db.UserSession.create({
    userId: sessionUserId, token, ipAddress: "127.0.0.1", userAgent: fixtureTag,
    status: loggedOut ? "expired" : "active",
  });
  return token;
}

function body(overrides = {}) {
  return {
    title: `${fixtureTag} new campaign`, description: "Help with a community garden.",
    categoryId: categories[0].categoryId, startDate: "2028-02-29", endDate: "2028-03-01",
    ...overrides,
  };
}

async function request(path, { method = "GET", token, value, rawBody, headers = {} } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(value !== undefined || rawBody !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: rawBody ?? (value === undefined ? undefined : JSON.stringify(value)),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

describe("public campaign submission HTTP and MySQL integration", () => {
  before(async () => {
    await db.sequelize.authenticate();
    const passwordHash = await bcrypt.hash("IntegrationOnly123!", 10);
    for (const role of ["public", "admin", "business_owner"]) {
      const user = await db.User.create({ fullName: fixtureTag, email: `${fixtureTag}-${role}@example.test`, passwordHash, role, status: "active" });
      users.push(user);
    }
    [publicUser, adminUser, ownerUser] = users;
    for (const name of ["B", "A"]) {
      categories.push(await db.Category.create({ categoryName: `${fixtureTag} ${name}` }));
    }
    publicToken = await makeToken(publicUser);
    const approved = await db.Campaign.create({
      title: `${fixtureTag} approved`, description: "Existing approved fixture.",
      categoryId: categories[0].categoryId, createdBy: publicUser.userId,
      businessId: null, imageUrl: null, status: "approved",
    });
    approvedId = approved.campaignId;
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    try {
      // Only rows belonging to users created by this run are removed; never reset the database.
      const userIds = users.map((user) => user.userId);
      if (userIds.length) {
        await db.Campaign.destroy({ where: { createdBy: { [Op.in]: userIds } } });
        await db.UserSession.destroy({ where: { userId: { [Op.in]: userIds } } });
        await db.User.destroy({ where: { userId: { [Op.in]: userIds } } });
      }
      if (categories.length) await db.Category.destroy({ where: { categoryId: { [Op.in]: categories.map((category) => category.categoryId) } } });
    } finally {
      await db.sequelize.close();
    }
  });

  it("returns public category choices in stable order without hitting the ID route", async () => {
    const result = await request("/api/campaigns/categories");
    assert.equal(result.status, 200);
    const own = result.body.categories.filter(({ name }) => name.startsWith(fixtureTag));
    assert.deepEqual(own, [
      { id: categories[1].categoryId, name: `${fixtureTag} A` },
      { id: categories[0].categoryId, name: `${fixtureTag} B` },
    ]);
  });

  it("creates a persisted pending cause with server-owned fields and keeps it private", async () => {
    const result = await request("/api/campaigns", { method: "POST", token: publicToken, value: body({ title: `  ${fixtureTag} trimmed  `, targetAudience: "  Neighbours  " }) });
    assert.equal(result.status, 201);
    const campaign = result.body.campaign;
    assert.equal(campaign.title, `${fixtureTag} trimmed`);
    assert.equal(campaign.type, "cause");
    assert.equal(campaign.status, "pending");
    assert.equal(campaign.createdBy, publicUser.userId);
    assert.equal(campaign.category, categories[0].categoryName);
    assert.equal(campaign.businessId, null);
    assert.equal(campaign.imageUrl, null);
    assert.equal(campaign.targetAudience, "Neighbours");
    assert.equal(campaign.startDate, "2028-02-29");
    assert.ok(!Number.isNaN(Date.parse(campaign.createdAt)));
    const saved = await db.Campaign.findByPk(campaign.id);
    assert.equal(saved.status, "pending");
    assert.equal(saved.createdBy, publicUser.userId);
    assert.equal(saved.targetAudience, "Neighbours");
    const list = await request(`/api/campaigns?category=${categories[0].categoryId}&pageSize=100`);
    assert.equal(list.status, 200);
    assert.ok(list.body.campaigns.some(({ id }) => id === approvedId));
    assert.ok(!list.body.campaigns.some(({ id }) => id === campaign.id));
    assert.equal((await request(`/api/campaigns/${campaign.id}`)).status, 404);
    assert.equal((await request(`/api/campaigns/${approvedId}`)).status, 200);
    const admin = await request(`/api/campaigns/admin/${campaign.id}`, { token: await makeToken(adminUser) });
    assert.equal(admin.status, 200);
    assert.equal(admin.body.status, "pending");
  });

  it("rejects missing, malformed, expired and logged-out authentication", async () => {
    const variants = [
      {}, { headers: { Authorization: `Basic ${publicToken}` } }, { token: "bad-token" },
      { token: await makeToken(publicUser, { expired: true }) },
      { token: await makeToken(publicUser, { loggedOut: true }) },
      { token: await makeToken(publicUser, { sessionUserId: ownerUser.userId }) },
    ];
    for (const auth of variants) {
      const result = await request("/api/campaigns", { method: "POST", value: body(), ...auth });
      assert.equal(result.status, 401);
      assert.equal(result.body.code, "INVALID_TOKEN");
    }
    const token = await makeToken(publicUser);
    assert.equal((await request("/api/auth/logout", { method: "PUT", token })).status, 204);
    assert.equal((await request("/api/campaigns", { method: "POST", token, value: body() })).status, 401);
  });

  it("checks current roles and suspension even when the token says public/active", async () => {
    for (const user of [adminUser, ownerUser]) {
      const result = await request("/api/campaigns", { method: "POST", token: await makeToken(user, { role: "public" }), value: body() });
      assert.equal(result.status, 403);
      assert.equal(result.body.code, "FORBIDDEN");
    }
    await publicUser.update({ role: "business_owner" });
    try {
      const result = await request("/api/campaigns", { method: "POST", token: publicToken, value: body() });
      assert.equal(result.status, 403);
      assert.equal(result.body.code, "FORBIDDEN");
    } finally {
      await publicUser.update({ role: "public" });
    }
    await publicUser.update({ status: "suspended" });
    try {
      const result = await request("/api/campaigns", { method: "POST", token: publicToken, value: body() });
      assert.equal(result.status, 403);
      assert.equal(result.body.code, "ACCOUNT_SUSPENDED");
    } finally {
      await publicUser.update({ status: "active" });
    }
  });

  it("rejects invalid data without creating any campaign rows", async () => {
    const beforeCount = await db.Campaign.count({ where: { createdBy: publicUser.userId } });
    const cases = [
      null, [], {}, body({ title: "   " }), body({ description: 3 }),
      body({ categoryId: String(categories[0].categoryId) }), body({ categoryId: 2147483648 }),
      body({ categoryId: 2147483647 }), body({ startDate: "2026-02-29" }),
      body({ startDate: "0999-01-01" }), body({ endDate: "2027-01-01" }),
      body({ targetAudience: "x".repeat(256) }),
      ...["status", "createdBy", "businessId", "type", "imageId", "imageUrl", "unexpected"].map((field) => body({ [field]: "not-accepted" })),
    ];
    for (const value of cases) {
      const result = await request("/api/campaigns", { method: "POST", token: publicToken, value });
      assert.equal(result.status, 422, JSON.stringify(value));
      assert.equal(result.body.code, "VALIDATION_FAILED");
      assert.ok(result.body.fieldErrors);
    }
    assert.equal(await db.Campaign.count({ where: { createdBy: publicUser.userId } }), beforeCount);
  });

  it("returns structured errors for malformed JSON, wrong content and oversized bodies", async () => {
    for (const path of ["/api/campaigns", "/API/CAMPAIGNS/"]) {
      for (const rawBody of ["{broken", "null", "true"]) {
        const result = await request(path, { method: "POST", token: publicToken, rawBody });
        assert.equal(result.status, 422);
        assert.equal(result.body.code, "VALIDATION_FAILED");
        assert.equal(result.body.stack, undefined);
      }
    }
    const wrongType = await request("/api/campaigns", { method: "POST", token: publicToken, rawBody: "text", headers: { "Content-Type": "text/plain" } });
    assert.equal(wrongType.status, 422);
    const large = await request("/api/campaigns", { method: "POST", token: publicToken, value: body({ description: "x".repeat(110000) }) });
    assert.equal(large.status, 413);
    assert.equal(large.body.code, "REQUEST_TOO_LARGE");
  });

  it("does not expose database error details in category or submission responses", async () => {
    for (const [methodName, requestOptions] of [
      ["findAll", { path: "/api/campaigns/categories", options: {} }],
      ["findByPk", { path: "/api/campaigns", options: { method: "POST", token: publicToken, value: body() } }],
    ]) {
      const original = db.Category[methodName];
      db.Category[methodName] = async () => { throw new Error("private database connection and SQL details"); };
      try {
        const result = await request(requestOptions.path, requestOptions.options);
        assert.deepEqual(result, { status: 500, body: { status: 500, code: "INTERNAL_SERVER_ERROR", message: "Something went wrong", fieldErrors: null } });
      } finally {
        db.Category[methodName] = original;
      }
    }
  });
});
