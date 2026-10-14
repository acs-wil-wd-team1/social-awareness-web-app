"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const vm = require("node:vm");
const jwt = require("jsonwebtoken");

const secret = "logout-unit-fixture-signing-key-not-a-deployment-secret";
const claims = { id: 7, role: "public", status: "active" };
const plain = (value) => JSON.parse(JSON.stringify(value));

// Isolate the legacy default database import as well as the injectable guard;
// these tests never initialize Sequelize or need a configured database.
function loadGuard() {
  const filename = path.resolve(__dirname, "../../src/middleware/authentication.js");
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  const logs = [];
  vm.runInNewContext(readFileSync(filename, "utf8"), {
    module, exports: module.exports,
    require: (name) => name === "../database/models" ? { UserSession: {} } : nativeRequire(name),
    process: { env: { JWT_SECRET: secret } },
    console: { error: (...values) => logs.push(values), log: (...values) => logs.push(values) },
  }, { filename });
  return { createLogoutGuard: module.exports.createLogoutGuard, logs };
}

function fixture({ verify = () => claims, getSecret = () => secret, session = { sessionId: 1 }, databaseError } = {}) {
  const calls = [];
  const { createLogoutGuard, logs } = loadGuard();
  const guard = createLogoutGuard({ UserSession: {
    findOne: async (options) => {
      calls.push(["session", options]);
      if (databaseError) throw databaseError;
      return session;
    },
  } }, { verify: (...args) => { calls.push(["verify", ...args]); return verify(...args); }, getSecret });
  async function request(...headers) {
    const authorization = headers.length ? headers[0] : "Bearer unit-token";
    const req = { headers: { authorization } };
    let nextCalls = 0;
    const res = {
      status(value) { this.statusCode = value; return this; },
      json(value) { this.body = value; return this; },
    };
    await guard(req, res, () => { nextCalls += 1; });
    return { req, status: res.statusCode, body: res.body && plain(res.body), nextCalls };
  }
  return { request, calls, logs };
}

function invalid(result, error = "Invalid token") {
  assert.equal(result.status, 401);
  assert.deepEqual(result.body, {
    error, status: 401, code: "INVALID_TOKEN",
    message: error === "Session expired or logged out" ? error : "Your session is invalid or has expired",
    fieldErrors: null,
  });
  assert.equal(result.nextCalls, 0);
  assert.equal(result.req.user, undefined);
  assert.equal(result.req.token, undefined);
}

test("logout authorizes only a verified token and the same user's active session", async () => {
  const { request, calls, logs } = fixture();
  const result = await request("bEaReR unit-token");
  assert.equal(result.nextCalls, 1);
  assert.equal(result.status, undefined);
  assert.equal(result.req.user, claims);
  assert.equal(result.req.token, "unit-token");
  assert.deepEqual(plain(calls), [
    ["verify", "unit-token", secret],
    ["session", { where: { token: "unit-token", userId: 7, status: "active" }, logging: false }],
  ]);
  assert.deepEqual(logs, []);
});

test("missing or malformed Bearer headers return typed 401 without verification or database access", async () => {
  for (const header of [undefined, null, 42, [], "", "Basic fixture", "Bearer", "Bearer fixture extra", "Bearer  fixture", "Bearer\tfixture"]) {
    const { request, calls } = fixture();
    const result = await request(header);
    assert.equal(result.status, 401);
    assert.equal(result.body.code, "INVALID_TOKEN");
    assert.equal(result.body.error, "Access denied");
    assert.equal(result.body.fieldErrors, null);
    assert.equal(result.nextCalls, 0);
    assert.deepEqual(calls, []);
  }
});

test("expired, invalid and not-yet-valid JWTs return typed 401 rather than retryable 403", async () => {
  for (const error of [
    new jwt.TokenExpiredError("private expired token", new Date()),
    new jwt.JsonWebTokenError("private invalid signature"),
    new jwt.NotBeforeError("private inactive token", new Date()),
  ]) {
    const { request, calls, logs } = fixture({ verify: () => { throw error; } });
    invalid(await request());
    assert.equal(calls.filter(([kind]) => kind === "session").length, 0);
    assert.deepEqual(logs, []);
  }
});

test("actual signed expired and wrong-signature tokens are rejected without querying sessions", async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const token of [
    jwt.sign({ ...claims, exp: now - 1 }, secret),
    jwt.sign(claims, "different-fixture-signing-key", { expiresIn: "1h" }),
    jwt.sign({ ...claims, nbf: now + 3600 }, secret),
  ]) {
    const { request, calls } = fixture({ verify: jwt.verify });
    invalid(await request(`Bearer ${token}`));
    assert.equal(calls.filter(([kind]) => kind === "session").length, 0);
  }
});

test("malformed verified user IDs cannot authorize a logout or reach the session query", async () => {
  for (const value of [null, "payload", {}, { id: "7" }, { id: 0 }, { id: -1 }, { id: 1.5 }, { id: Number.MAX_SAFE_INTEGER + 1 }]) {
    const { request, calls } = fixture({ verify: () => value });
    invalid(await request());
    assert.equal(calls.filter(([kind]) => kind === "session").length, 0);
  }
});

test("an absent or revoked matching session retains the legacy error plus typed 401", async () => {
  const { request, logs } = fixture({ session: null });
  invalid(await request(), "Session expired or logged out");
  assert.deepEqual(logs, []);
});

test("database failures remain safe retryable 503 instead of being mislabeled as invalid credentials", async () => {
  const { request, logs } = fixture({ databaseError: new Error("private SQL token=secret db-password") });
  const result = await request();
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, {
    error: "Service unavailable", status: 503, code: "SERVICE_UNAVAILABLE",
    message: "Your server session could not be checked. Please try again.", fieldErrors: null,
  });
  assert.equal(result.nextCalls, 0);
  assert.equal(result.req.token, undefined);
  assert.equal(result.req.user, undefined);
  assert.deepEqual(logs, []);
});

test("missing signing configuration remains a safe server failure without querying sessions", async () => {
  const { request, calls, logs } = fixture({ getSecret: () => undefined });
  const result = await request();
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: "Something went wrong", status: 500, code: "INTERNAL_SERVER_ERROR", message: "Something went wrong", fieldErrors: null });
  assert.equal(result.nextCalls, 0);
  assert.deepEqual(calls, []);
  assert.deepEqual(logs, []);
});

test("unexpected verifier faults remain server failures without exposing internals or revoking a session", async () => {
  const { request, calls, logs } = fixture({ verify: () => { throw new Error("private signing configuration and token"); } });
  const result = await request();
  assert.equal(result.status, 500);
  assert.equal(result.body.code, "INTERNAL_SERVER_ERROR");
  assert.equal(result.body.message, "Something went wrong");
  assert.equal(result.body.error, "Something went wrong");
  assert.equal(result.nextCalls, 0);
  assert.equal(result.req.token, undefined);
  assert.equal(result.req.user, undefined);
  assert.equal(calls.filter(([kind]) => kind === "session").length, 0);
  assert.deepEqual(logs, []);
});
