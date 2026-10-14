"use strict";

require("dotenv").config({ quiet: true });
if (process.env.RUN_DB_INTEGRATION !== "1" || process.env.NODE_ENV !== "test"
  || !/^[A-Za-z0-9_]+_test$/.test(process.env.DB_NAME_TEST || "")
  || process.env.DB_NAME_TEST === process.env.DB_NAME
  || !["localhost", "127.0.0.1", "::1"].includes(process.env.DB_HOST) || !process.env.JWT_SECRET) {
  throw new Error("Business profile integration tests require RUN_DB_INTEGRATION=1, NODE_ENV=test, a separate migrated local DB_NAME_TEST ending _test, and JWT_SECRET");
}

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const db = require("../../src/database/models");
const app = require("../../src/app");
const { createBusinessProfileService } = require("../../src/services/businessServices");
const { createBusinessProfileRouter } = require("../../src/router/businessRoutes");
const { createAdminManagementService } = require("../../src/services/adminManagement");
db.sequelize.options.logging = false;

const fixtureTag = `business-profile-${randomBytes(8).toString("hex")}`;
const users = {};
const tokens = {};
const body = { businessName: "  Neighbourhood Repairs  ", abn: " local reference ", website: " https://example.test/repairs ", description: " We repair and reuse household items. " };
const normalized = { businessName: "Neighbourhood Repairs", abn: "local reference", website: "https://example.test/repairs", description: "We repair and reuse household items." };
const asUser = (key = "owner") => ({ id: users[key].userId, role: users[key].role, status: "active" });
let origin, server;

async function request({ method = "GET", key = "owner", value, rawBody, route = "/api/business/me", headers = {}, base = origin } = {}) {
  const response = await fetch(`${base}${route}`, {
    method, headers: {
      ...(key ? { Authorization: `Bearer ${tokens[key]}` } : {}),
      ...(value !== undefined || rawBody !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: rawBody ?? (value === undefined ? undefined : JSON.stringify(value)),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

function assertProfile(result, expected) {
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(result.body, { business: { id: result.body.business.id, ...expected } });
  assert.ok(Number.isSafeInteger(result.body.business.id) && result.body.business.id > 0);
  assert.deepEqual(Object.keys(result.body.business).sort(), ["abn", "businessName", "description", "id", "website"]);
  for (const token of Object.values(tokens)) assert.ok(!JSON.stringify(result.body).includes(token));
  return result.body.business.id;
}

describe("business profile HTTP, ownership and MySQL transaction integration", () => {
  before(async () => {
    await db.sequelize.authenticate();
    for (const [key, role] of [["owner", "business_owner"], ["other", "business_owner"], ["public", "public"], ["admin", "admin"], ["race", "business_owner"], ["differentA", "business_owner"], ["differentB", "business_owner"], ["rollback", "business_owner"], ["locked", "business_owner"]]) {
      users[key] = await db.User.create({ fullName: fixtureTag, email: `${fixtureTag}-${key}@example.test`, passwordHash: "unused-profile-fixture-hash", role, status: "active" });
      tokens[key] = jwt.sign({ id: users[key].userId, role }, process.env.JWT_SECRET, { expiresIn: "1h", jwtid: randomBytes(8).toString("hex") });
      await db.UserSession.create({ userId: users[key].userId, token: tokens[key], ipAddress: "127.0.0.1", userAgent: fixtureTag, status: "active" });
    }
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    try {
      // This suite only removes its generated accounts, profiles and audit rows.
      const ids = Object.values(users).map((row) => row.userId);
      if (ids.length) {
        await db.ManagementAudit.destroy({ where: { actorId: { [Op.in]: ids } } });
        await db.Business.destroy({ where: { ownerId: { [Op.in]: ids } } });
        await db.UserSession.destroy({ where: { userId: { [Op.in]: ids } } });
        await db.User.destroy({ where: { userId: { [Op.in]: ids } } });
      }
    } finally { await db.sequelize.close(); }
  });

  it("returns business:null for a new owner and authenticates GET and PUT before profile access", async () => {
    assert.deepEqual(await request(), { status: 200, body: { business: null } });
    assert.equal(await db.Business.count({ where: { ownerId: users.owner.userId } }), 0);
    const expired = jwt.sign({ id: users.owner.userId, role: "business_owner" }, process.env.JWT_SECRET, { expiresIn: -10 });
    for (const method of ["GET", "PUT"]) {
      const value = method === "PUT" ? body : undefined;
      for (const headers of [{}, { Authorization: "Basic invalid" }, { Authorization: "Bearer invalid" }, { Authorization: `Bearer ${expired}` }]) {
        const result = await request({ method, value, key: null, headers });
        assert.equal(result.status, 401);
        assert.equal(result.body.code, "INVALID_TOKEN");
      }
      for (const key of ["public", "admin"]) assert.equal((await request({ method, value, key })).status, 403);
    }
  });

  it("creates and later updates one normalized owner profile with complete 200 receipts and nullable clearing", async () => {
    const id = assertProfile(await request({ method: "PUT", value: body }), normalized);
    const stored = await db.Business.findByPk(id);
    assert.equal(stored.ownerId, users.owner.userId);
    assert.equal(stored.abn, "local reference", "The contract stores ABN text rather than imposing an unagreed 11-digit verifier");
    assert.equal(await db.Business.count({ where: { ownerId: users.owner.userId } }), 1);
    assertProfile(await request(), normalized);
    for (const optional of [{}, { abn: null, website: null, description: null }, { abn: " \t ", website: " ", description: "\n" }]) {
      const result = await request({ method: "PUT", value: { businessName: " Updated Repairs ", ...optional } });
      assert.equal(assertProfile(result, { businessName: "Updated Repairs", abn: null, website: null, description: null }), id);
      const cleared = await db.Business.findByPk(id);
      assert.equal(cleared.abn, null); assert.equal(cleared.website, null); assert.equal(cleared.description, null);
    }
  });

  it("uses exact trimmed model bounds and preserves the saved profile on malformed, credential-bearing or forged input", async () => {
    const prefix = "https://example.test/";
    const maximum = { businessName: "n".repeat(150), abn: "a".repeat(20), website: prefix + "p".repeat(255 - prefix.length), description: "d".repeat(2000) };
    assertProfile(await request({ method: "PUT", value: Object.fromEntries(Object.entries(maximum).map(([key, value]) => [key, ` ${value} `])) }), maximum);
    const snapshot = await db.Business.findOne({ where: { ownerId: users.owner.userId }, raw: true });
    const cases = [undefined, null, [], {}, false, 4,
      { ...body, businessName: " " }, { ...body, businessName: "n".repeat(151) },
      { ...body, abn: "a".repeat(21) }, { ...body, website: prefix + "p".repeat(256 - prefix.length) }, { ...body, description: "d".repeat(2001) },
      ...["businessName", "abn", "website", "description"].flatMap((field) => [false, {}, [], 10].map((value) => ({ ...body, [field]: value }))),
      ...["example.test", "ftp://example.test", "https://", "https://user:private-profile-password@example.test", "https://@example.test", "https://exa\nmple.test"].map((website) => ({ ...body, website })),
      ...["id", "businessId", "ownerId", "userId", "role", "status"].map((field) => ({ ...body, [field]: users.other.userId })),
      JSON.parse('{"businessName":"Repairs","__proto__":{"polluted":true}}'),
    ];
    for (const value of cases) {
      const result = await request({ method: "PUT", value });
      assert.equal(result.status, 422, JSON.stringify(value));
      assert.equal(result.body.code, "VALIDATION_FAILED");
      assert.ok(result.body.fieldErrors);
      assert.ok(!JSON.stringify(result.body).includes("private-profile-password"));
      assert.equal(result.body.stack, undefined);
    }
    for (const rawBody of ['{"businessName":"private malformed fixture",', JSON.stringify({ businessName: "x".repeat(110000) })]) {
      const result = await request({ method: "PUT", rawBody });
      assert.equal(result.status, rawBody.length > 100000 ? 413 : 422);
      assert.ok(!JSON.stringify(result.body).includes("private malformed fixture"));
    }
    assert.deepEqual(await db.Business.findOne({ where: { ownerId: users.owner.userId }, raw: true }), snapshot);
    assert.equal({}.polluted, undefined);
  });

  it("never reads or overwrites another owner's profile through forged body or query IDs", async () => {
    const otherId = assertProfile(await request({ method: "PUT", key: "other", value: { businessName: "Other owner", abn: "private-other-abn" } }), { businessName: "Other owner", abn: "private-other-abn", website: null, description: null });
    const own = await request({ route: `/api/business/me?ownerId=${users.other.userId}&businessId=${otherId}&userId=${users.other.userId}` });
    assert.equal(own.status, 200);
    assert.notEqual(own.body.business.id, otherId);
    assert.ok(!JSON.stringify(own.body).includes("private-other-abn"));
    const before = await db.Business.findByPk(otherId, { raw: true });
    for (const override of [{ ownerId: users.other.userId }, { businessId: otherId }, { id: otherId }]) {
      assert.equal((await request({ method: "PUT", value: { ...body, ...override } })).status, 422);
    }
    assert.deepEqual(await db.Business.findByPk(otherId, { raw: true }), before);
  });

  it("checks current role/status and session state rather than trusting previously issued claims", async () => {
    const service = createBusinessProfileService(db);
    const snapshot = await db.Business.findOne({ where: { ownerId: users.owner.userId }, raw: true });
    for (const change of [{ role: "public" }, { status: "suspended" }]) {
      await users.owner.update(change);
      try {
        for (const method of ["GET", "PUT"]) {
          const result = await request({ method, value: method === "PUT" ? body : undefined });
          assert.equal(result.status, 403);
          assert.equal(result.body.code, change.status ? "ACCOUNT_SUSPENDED" : "FORBIDDEN");
        }
        for (const run of [() => service.get({ id: users.owner.userId, role: "business_owner", status: "active" }, tokens.owner), () => service.save(body, { id: users.owner.userId, role: "business_owner", status: "active" }, tokens.owner)]) {
          await assert.rejects(run(), (error) => error.status === 403);
        }
      } finally { await users.owner.update({ role: "business_owner", status: "active" }); }
    }
    await db.UserSession.update({ status: "expired" }, { where: { token: tokens.owner } });
    try {
      assert.equal((await request()).status, 401);
      assert.equal((await request({ method: "PUT", value: body })).status, 401);
      await assert.rejects(service.get(asUser(), tokens.owner), (error) => error.code === "INVALID_TOKEN");
      await assert.rejects(service.save(body, asUser(), tokens.owner), (error) => error.code === "INVALID_TOKEN");
    } finally { await db.UserSession.update({ status: "active" }, { where: { token: tokens.owner } }); }
    assert.deepEqual(await db.Business.findOne({ where: { ownerId: users.owner.userId }, raw: true }), snapshot);
  });

  it("serializes concurrent first saves and later edits to one owner row with each writer's own receipt", async () => {
    const values = Array.from({ length: 4 }, (_, index) => ({ businessName: `Concurrent first ${index}`, description: `Receipt ${index}` }));
    const created = await Promise.all(values.map((value) => request({ method: "PUT", key: "race", value })));
    const ids = created.map((result, index) => assertProfile(result, { ...values[index], abn: null, website: null }));
    assert.equal(new Set(ids).size, 1);
    assert.equal(await db.Business.count({ where: { ownerId: users.race.userId } }), 1);
    const edits = values.map((value, index) => ({ ...value, businessName: `Concurrent edit ${index}` }));
    const edited = await Promise.all(edits.map((value) => request({ method: "PUT", key: "race", value })));
    for (const [index, result] of edited.entries()) assert.equal(assertProfile(result, { ...edits[index], abn: null, website: null }), ids[0]);
    const stored = await db.Business.findOne({ where: { ownerId: users.race.userId } });
    assert.ok(edits.some(({ businessName }) => businessName === stored.businessName));
    assert.equal(await db.Business.count({ where: { ownerId: users.race.userId } }), 1);
  });

  it("allows different owners to create profiles concurrently without missing-profile gap-lock deadlocks", async () => {
    const results = await Promise.all(["differentA", "differentB"].map((key) => request({ method: "PUT", key, value: { businessName: key } })));
    for (const [index, result] of results.entries()) assertProfile(result, { businessName: ["differentA", "differentB"][index], abn: null, website: null, description: null });
    assert.notEqual(results[0].body.business.id, results[1].body.business.id);
  });

  it("rolls failed first saves and updates back without changing the profile ledger", async () => {
    const failing = createBusinessProfileService({ ...db, sequelize: {
      transaction: (work) => db.sequelize.transaction(async (transaction) => {
        await work(transaction);
        throw new Error("Deliberate business profile rollback fixture");
      }),
    } });
    await assert.rejects(failing.save(body, asUser("rollback"), tokens.rollback), /rollback fixture/);
    assert.equal(await db.Business.count({ where: { ownerId: users.rollback.userId } }), 0);
    const first = await createBusinessProfileService(db).save(body, asUser("rollback"), tokens.rollback);
    const before = await db.Business.findByPk(first.business.id, { raw: true });
    await assert.rejects(failing.save({ businessName: "Must not persist" }, asUser("rollback"), tokens.rollback), /rollback fixture/);
    assert.deepEqual(await db.Business.findByPk(first.business.id, { raw: true }), before);
  });

  it("holds the owning account lock until profile commit and serializes suspension/session revocation", async () => {
    let entered, release;
    const inside = new Promise((resolve) => { entered = resolve; });
    const unblock = new Promise((resolve) => { release = resolve; });
    const held = createBusinessProfileService({ ...db, Business: {
      findOne: db.Business.findOne.bind(db.Business),
      create: async (values, options) => {
        const profile = await db.Business.create(values, options);
        entered();
        await unblock;
        return profile;
      },
    } });
    const saving = held.save({ businessName: "Committed before suspension" }, asUser("locked"), tokens.locked);
    let suspension;
    try {
      await Promise.race([inside, saving.then(() => { throw new Error("The profile fixture was not held"); })]);
      // MySQL 8 NOWAIT supplies direct lock evidence without timing sleeps.
      await assert.rejects(db.sequelize.transaction((transaction) => db.sequelize.query("SELECT user_id FROM users WHERE user_id = :id FOR UPDATE NOWAIT", {
        replacements: { id: users.locked.userId }, transaction, logging: false,
      })), (error) => error.parent?.code === "ER_LOCK_NOWAIT" || error.parent?.errno === 3572);
      suspension = createAdminManagementService(db).changeUserStatus(String(users.locked.userId), { status: "suspended" }, asUser("admin"), tokens.admin);
      release();
      const [saved, suspended] = await Promise.all([saving, suspension]);
      assert.equal(saved.business.businessName, "Committed before suspension");
      assert.equal(suspended.user.status, "suspended");
      assert.equal((await db.UserSession.findOne({ where: { token: tokens.locked } })).status, "expired");
      assert.equal((await db.Business.findByPk(saved.business.id)).businessName, "Committed before suspension");
      assert.equal((await request({ key: "locked" })).status, 401);
      assert.equal((await request({ method: "PUT", key: "locked", value: body })).status, 401);
    } finally {
      release();
      await saving.catch(() => {});
      if (suspension) await suspension.catch(() => {});
    }
  });

  it("returns only a generic safe 500 for unexpected service failures without leaking or logging secret text", async () => {
    const privateText = "private-profile-password token=private-profile-token SQL=private-profile-query";
    const fail = async () => { throw Object.assign(new Error(privateText), { status: 503, code: privateText, fieldErrors: { abn: privateText } }); };
    const local = express(); local.use(express.json());
    local.use("/api/business", createBusinessProfileRouter(db, { service: { get: fail, save: fail } }));
    let failingServer; await new Promise((resolve) => { failingServer = local.listen(0, "127.0.0.1", resolve); });
    const base = `http://127.0.0.1:${failingServer.address().port}`;
    const logs = [];
    const originalError = console.error;
    console.error = (...values) => logs.push(values);
    try {
      for (const method of ["GET", "PUT"]) {
        const result = await request({ method, value: method === "PUT" ? body : undefined, base });
        assert.deepEqual(result, { status: 500, body: { status: 500, code: "INTERNAL_SERVER_ERROR", message: "Something went wrong", fieldErrors: null } });
      }
      assert.equal(logs.length, 2);
      assert.ok(!JSON.stringify(logs).includes("private-profile-"));
    } finally {
      console.error = originalError;
      await new Promise((resolve, reject) => failingServer.close((error) => error ? reject(error) : resolve()));
    }
  });
});
