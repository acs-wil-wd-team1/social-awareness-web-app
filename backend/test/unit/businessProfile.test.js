"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const vm = require("node:vm");
const express = require("express");
const jwt = require("jsonwebtoken");
const { createBusinessProfileService, validateBusinessProfileInput, serializeBusinessProfile } = require("../../src/services/businessServices");
const { createBusinessProfileController } = require("../../src/controllers/business");
const { validationError } = require("../../src/utils/serviceError");

const valid = { businessName: "  Local Repairs  ", abn: " local reference ", website: " https://example.test/repairs ", description: " We repair and reuse. " };
const actor = { id: 7, role: "business_owner", status: "active" };
const token = "fixture-session-token";
const failure = (field) => (error) => error.status === 422 && error.code === "VALIDATION_FAILED" && typeof error.fieldErrors?.[field] === "string";

test("business profile trims all fields, accepts ABN text and clears optional empty, omitted or null fields", () => {
  assert.deepEqual(validateBusinessProfileInput(valid), { businessName: "Local Repairs", abn: "local reference", website: "https://example.test/repairs", description: "We repair and reuse." });
  for (const optional of [{}, { abn: null, website: null, description: null }, { abn: " \t ", website: "  ", description: "\n" }]) {
    assert.deepEqual(validateBusinessProfileInput({ businessName: " Repairs ", ...optional }), { businessName: "Repairs", abn: null, website: null, description: null });
  }
});

test("business profile uses the actual 150/20/255/2000 field bounds after trimming", () => {
  const prefix = "https://example.test/";
  const maximum = { businessName: "n".repeat(150), abn: "a".repeat(20), website: prefix + "p".repeat(255 - prefix.length), description: "d".repeat(2000) };
  assert.deepEqual(validateBusinessProfileInput(Object.fromEntries(Object.entries(maximum).map(([key, value]) => [key, ` ${value} `]))), maximum);
  for (const [field, value] of Object.entries({ businessName: "n".repeat(151), abn: "a".repeat(21), website: prefix + "p".repeat(256 - prefix.length), description: "d".repeat(2001) })) {
    assert.throws(() => validateBusinessProfileInput({ ...valid, [field]: value }), failure(field));
  }
});

test("business profile rejects malformed bodies and wrong field types without coercion", () => {
  for (const body of [undefined, null, [], true, 9, "profile"]) assert.throws(() => validateBusinessProfileInput(body), failure("body"));
  for (const businessName of [undefined, null, "", " \t ", {}, [], false, 1]) assert.throws(() => validateBusinessProfileInput({ ...valid, businessName }), failure("businessName"));
  for (const field of ["abn", "website", "description"]) {
    for (const value of [{}, [], true, 20]) assert.throws(() => validateBusinessProfileInput({ ...valid, [field]: value }), failure(field));
  }
});

test("business profile rejects forged ownership, privilege and prototype fields", () => {
  for (const field of ["id", "businessId", "ownerId", "userId", "role", "status", "createdAt", "unknown", "constructor"]) {
    assert.throws(() => validateBusinessProfileInput({ ...valid, [field]: "forged" }), failure(field));
  }
  const prototype = JSON.parse('{"businessName":"Repairs","__proto__":{"polluted":true}}');
  assert.throws(() => validateBusinessProfileInput(prototype), failure("__proto__"));
  assert.equal({}.polluted, undefined);
});

test("business website requires a full HTTP(S) URL with a host and no credential or control text", () => {
  for (const website of ["https://example.test", "http://example.test/path?q=1#here", "HTTPS://EXAMPLE.TEST/", "https://example.test/path@public"]) {
    assert.equal(validateBusinessProfileInput({ ...valid, website }).website, website);
  }
  for (const website of ["example.test", "/relative", "https:example.test", "https://", "ftp://example.test", "javascript:alert(1)", "https://user:private-password@example.test", "https://user@example.test", "https://@example.test", "https://exa\nmple.test"]) {
    assert.throws(() => validateBusinessProfileInput({ ...valid, website }), (error) => {
      assert.ok(failure("website")(error));
      assert.ok(!JSON.stringify(error.fieldErrors).includes("private-password"));
      return true;
    });
  }
});

function fixture({ profile = null, user = { userId: 7, role: "business_owner", status: "active" }, session = { token, userId: 7, status: "active" }, createError, updateError } = {}) {
  const calls = [];
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  const attachUpdate = (row) => {
    if (!row) return null;
    row.update = async (values, options) => {
      calls.push(["update", values, options]);
      if (updateError) throw updateError;
      Object.assign(row, values);
      return row;
    };
    return row;
  };
  profile = attachUpdate(profile);
  const models = {
    sequelize: { transaction: async (work) => {
      calls.push(["transaction"]);
      try { const result = await work(transaction); calls.push(["commit"]); return result; }
      catch (error) { calls.push(["rollback"]); throw error; }
    } },
    User: { findByPk: async (id, options) => { calls.push(["account", id, options]); return user; } },
    UserSession: { findOne: async (options) => { calls.push(["session", options]); return session; } },
    Business: {
      findOne: async (options) => { calls.push(["profile", options]); return profile; },
      create: async (values, options) => {
        calls.push(["create", values, options]);
        if (createError) throw createError;
        profile = attachUpdate({ businessId: 12, ...values, createdAt: new Date() });
        return profile;
      },
    },
  };
  return { service: createBusinessProfileService(models), models, calls, transaction };
}

test("private profile reads recheck the current account/session and scope the lookup to that owner", async () => {
  const f = fixture();
  assert.deepEqual(await f.service.get(actor, token), { business: null });
  assert.deepEqual(f.calls.map(([name]) => name), ["transaction", "account", "session", "profile", "commit"]);
  assert.equal(f.calls[1][2].transaction, f.transaction);
  assert.equal(f.calls[1][2].lock, "UPDATE");
  assert.equal(f.calls[2][1].lock, "UPDATE");
  assert.equal(f.calls[2][1].where.token, token);
  assert.equal(f.calls[2][1].where.userId, actor.id);
  assert.deepEqual(f.calls[3][1].where, { ownerId: actor.id });
  assert.equal(f.calls[3][1].transaction, f.transaction);
  assert.deepEqual(f.calls[3][1].attributes, ["businessId", "businessName", "abn", "website", "description"]);
  assert.equal(f.calls[3][1].lock, undefined, "The account lock serializes ownership without a missing-profile gap lock");
});

test("first save creates one server-owned profile and returns only the complete contract projection", async () => {
  const f = fixture();
  const result = await f.service.save(valid, actor, token);
  assert.deepEqual(result, { business: { id: 12, businessName: "Local Repairs", abn: "local reference", website: "https://example.test/repairs", description: "We repair and reuse." } });
  const [name, values, options] = f.calls.find(([name]) => name === "create");
  assert.equal(name, "create");
  assert.equal(values.ownerId, 7);
  assert.equal(options.transaction, f.transaction);
  assert.equal(options.logging, false);
  assert.deepEqual(f.calls.slice(0, 4).map(([name]) => name), ["transaction", "account", "session", "profile"]);
  for (const field of ["ownerId", "businessId", "createdAt", "updatedAt", "token"]) assert.equal(Object.hasOwn(result.business, field), false);
});

test("later save updates the same profile, clears optional fields and returns this saved receipt", async () => {
  const f = fixture({ profile: { businessId: 44, ownerId: 7, businessName: "Old", abn: "old", website: "https://old.test", description: "Old", privateField: "not returned" } });
  const result = await f.service.save({ businessName: " Updated " }, actor, token);
  assert.deepEqual(result, { business: { id: 44, businessName: "Updated", abn: null, website: null, description: null } });
  assert.equal(f.calls.some(([name]) => name === "create"), false);
  assert.equal(f.calls.filter(([name]) => name === "profile").length, 1);
  const update = f.calls.find(([name]) => name === "update");
  assert.deepEqual(update[1], { businessName: "Updated", abn: null, website: null, description: null });
  assert.equal(update[2].transaction, f.transaction);
});

test("profile methods reject expired sessions, suspended users and stale role claims before profile access", async () => {
  for (const run of [service => service.get(actor, token), service => service.save(valid, actor, token)]) {
    for (const [options, code] of [
      [{ user: null }, "INVALID_TOKEN"],
      [{ user: { userId: 7, role: "business_owner", status: "suspended" } }, "ACCOUNT_SUSPENDED"],
      [{ user: { userId: 7, role: "public", status: "active" } }, "FORBIDDEN"],
      [{ user: { userId: 7, role: "admin", status: "active" } }, "FORBIDDEN"],
      [{ session: null }, "INVALID_TOKEN"],
    ]) {
      const f = fixture(options);
      await assert.rejects(run(f.service), (error) => error.code === code);
      assert.equal(f.calls.some(([name]) => ["profile", "create", "update"].includes(name)), false);
      assert.equal(f.calls.at(-1)[0], "rollback");
    }
  }
});

test("invalid profile writes perform no transaction and database failures propagate for safe masking", async () => {
  const f = fixture();
  for (const body of [null, { ...valid, businessName: " " }, { ...valid, ownerId: 9 }]) await assert.rejects(f.service.save(body, actor, token), (error) => error.status === 422);
  assert.deepEqual(f.calls, []);
  const error = new Error("private database details");
  const creating = fixture({ createError: error });
  await assert.rejects(creating.service.save(valid, actor, token), (failure) => failure === error);
  assert.equal(creating.calls.at(-1)[0], "rollback");
  const updating = fixture({ profile: { businessId: 2, businessName: "Old" }, updateError: error });
  await assert.rejects(updating.service.save(valid, actor, token), (failure) => failure === error);
  assert.equal(updating.calls.at(-1)[0], "rollback");
});

test("profile projection preserves the missing-profile shape and hides ownership or unrelated metadata", () => {
  assert.deepEqual(serializeBusinessProfile(null), { business: null });
  assert.deepEqual(serializeBusinessProfile({ businessId: 3, ownerId: 8, businessName: "Repairs", token: "private-token" }), { business: { id: 3, businessName: "Repairs", abn: null, website: null, description: null } });
});

function response() {
  return { status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
}

test("business controllers retain 200 receipts and known 422 errors without logging input", async () => {
  const calls = [];
  const controller = createBusinessProfileController({
    get: async (...args) => { calls.push(["get", ...args]); return { business: null }; },
    save: async (...args) => { calls.push(["save", ...args]); return { business: { id: 3 } }; },
  });
  const req = { user: actor, token, body: valid, query: { ownerId: 99 } };
  const get = response(); await controller.getMyProfile(req, get);
  const put = response(); await controller.updateProfile(req, put);
  assert.equal(get.statusCode, 200); assert.equal(put.statusCode, 200);
  assert.deepEqual(calls, [["get", actor, token], ["save", valid, actor, token]]);
  const invalid = response();
  await createBusinessProfileController({ save: async () => { throw validationError({ businessName: "Business name is required" }); } }).updateProfile(req, invalid);
  assert.equal(invalid.statusCode, 422);
  assert.equal(invalid.body.code, "VALIDATION_FAILED");
});

test("business controllers mask unexpected errors and never return or log their secret-bearing details", async () => {
  const logs = [];
  const originalError = console.error;
  console.error = (...values) => logs.push(values);
  try {
    const privateText = "private-password token=private-token SQL=private-query";
    const fail = async () => { throw Object.assign(new Error(privateText), { status: 503, code: privateText, fieldErrors: { abn: privateText } }); };
    const controller = createBusinessProfileController({ get: fail, save: fail });
    for (const action of ["getMyProfile", "updateProfile"]) {
      const res = response(); await controller[action]({ user: actor, token, body: valid }, res);
      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { status: 500, code: "INTERNAL_SERVER_ERROR", message: "Something went wrong", fieldErrors: null });
    }
    assert.equal(logs.length, 2);
    assert.ok(!JSON.stringify(logs).includes("private-"));
  } finally { console.error = originalError; }
});

function isolatedRouter(models) {
  const filename = path.resolve(__dirname, "../../src/router/businessRoutes.js");
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(filename, "utf8"), { module, exports: module.exports,
    require: (name) => name === "../database/models" ? models : nativeRequire(name),
  }, { filename });
  return module.exports.createBusinessProfileRouter;
}

test("business router authenticates current database roles and sessions, not stale JWT claims", async (t) => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "business-profile-unit-secret-not-deployed";
  const signed = jwt.sign({ id: actor.id, role: "public" }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const state = { user: { userId: 7, role: "business_owner", status: "active" }, session: { userId: 7, status: "active" } };
  const models = { User: { findByPk: async () => state.user }, UserSession: { findOne: async (options) => options.where.token === signed ? state.session : null } };
  const calls = [];
  const service = { get: async (user, token) => { calls.push([user, token]); return { business: null }; }, save: async () => ({ business: { id: 3 } }) };
  const app = express(); app.use(express.json());
  app.use("/api/business", isolatedRouter(models)(models, { service }));
  let server; await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
  });
  const request = async (header) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/business/me`, { headers: header ? { Authorization: header } : {} });
    return { status: res.status, body: await res.json() };
  };
  for (const header of [undefined, "Basic anything", "Bearer invalid", `Bearer ${signed} extra`]) assert.equal((await request(header)).status, 401);
  assert.deepEqual(await request(`Bearer ${signed}`), { status: 200, body: { business: null } });
  assert.equal(calls[0][0].role, "business_owner");
  assert.equal(calls[0][1], signed);
  state.user.role = "public"; assert.equal((await request(`Bearer ${signed}`)).status, 403);
  state.user.role = "admin"; assert.equal((await request(`Bearer ${signed}`)).status, 403);
  state.user.role = "business_owner"; state.user.status = "suspended";
  assert.equal((await request(`Bearer ${signed}`)).body.code, "ACCOUNT_SUSPENDED");
  state.user.status = "active"; state.session = null;
  assert.equal((await request(`Bearer ${signed}`)).status, 401);
  assert.equal(calls.length, 1);
});
