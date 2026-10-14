"use strict";

require("dotenv").config({ quiet: true });

// Refuse a deployed/shared database. The runner supplies a disposable local
// MySQL database, applies migrations, and removes only its own container.
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

const fixtureTag = `auth-test-${randomBytes(8).toString("hex")}`;
const fixturePassword = " IntegrationOnly123! ";
let origin;
let server;
let publicAccount;
let loginToken;
let invalidCase = 0;

function registration(overrides = {}) {
  return {
    name: `${fixtureTag} Member`, email: `${fixtureTag}-public@example.test`,
    password: fixturePassword, accountType: "user", ...overrides,
  };
}

async function request(route, { method = "POST", token, value, rawBody, headers = {} } = {}) {
  const response = await fetch(`${origin}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(value !== undefined || rawBody !== undefined ? { "Content-Type": "application/json" } : {}),
      "User-Agent": ` ${fixtureTag} browser `,
      ...headers,
    },
    body: rawBody ?? (value === undefined ? undefined : JSON.stringify(value)),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

const ownedUsers = { email: { [Op.like]: `${fixtureTag}%@example.test` } };
const login = (value) => request("/api/auth/login", { value });

describe("authentication HTTP and MySQL integration", () => {
  before(async () => {
    await db.sequelize.authenticate();
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
    const registered = await request("/api/auth/register", { value: registration() });
    assert.equal(registered.status, 201);
    publicAccount = await db.User.scope("withPassword").findByPk(registered.body.user.id);
    assert.equal(publicAccount.role, "public");
  });

  after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    try {
      // Delete only this run's randomly tagged fixtures, never reset tables or
      // remove another integration suite's accounts/campaigns.
      const userIds = (await db.User.findAll({ where: ownedUsers, attributes: ["userId"] })).map((row) => row.userId);
      if (userIds.length) {
        await db.UserSession.destroy({ where: { userId: { [Op.in]: userIds } } });
        await db.Business.destroy({ where: { ownerId: { [Op.in]: userIds } } });
        await db.User.destroy({ where: { userId: { [Op.in]: userIds } } });
      }
    } finally {
      await db.sequelize.close();
    }
  });

  it("registers normalized values, hashes the exact password and never returns credentials", async () => {
    const email = `${fixtureTag}-normalized@example.test`;
    const result = await request("/api/auth/register", {
      value: registration({ name: `  ${fixtureTag} Normalized  `, email: `  ${email.toUpperCase()}  ` }),
    });
    assert.equal(result.status, 201);
    assert.deepEqual(result.body, { message: "Registered!", user: { id: result.body.user.id, name: `${fixtureTag} Normalized`, role: "public" } });
    assert.ok(Number.isSafeInteger(result.body.user.id) && result.body.user.id > 0);
    const stored = await db.User.scope("withPassword").findByPk(result.body.user.id);
    assert.equal(stored.fullName, `${fixtureTag} Normalized`);
    assert.equal(stored.email, email);
    assert.equal(stored.status, "active");
    assert.notEqual(stored.passwordHash, fixturePassword);
    assert.equal(await bcrypt.compare(fixturePassword, stored.passwordHash), true);
    assert.equal(await bcrypt.compare(fixturePassword.trim(), stored.passwordHash), false);
    assert.equal(result.body.token, undefined);
    assert.equal(result.body.password, undefined);
    assert.equal(result.body.user.passwordHash, undefined);
    assert.equal((await db.User.findByPk(stored.userId)).passwordHash, undefined);
  });

  it("registers a business owner with the server-owned role, not an admin or fabricated profile", async () => {
    const result = await request("/api/auth/register", {
      value: registration({ email: `${fixtureTag}-business@example.test`, accountType: "business" }),
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.user.role, "business_owner");
    const stored = await db.User.findByPk(result.body.user.id);
    assert.equal(stored.role, "business_owner");
    assert.equal(stored.status, "active");
    assert.equal(await db.Business.count({ where: { ownerId: stored.userId } }), 0);
  });

  it("rejects missing, whitespace, malformed, oversized and wrongly typed registration fields without writes", async () => {
    const count = await db.User.count({ where: ownedUsers });
    const bodies = [undefined, null, [], {},
      ...["name", "email", "password", "accountType"].flatMap((field) => {
        const missing = registration({ email: `${fixtureTag}-invalid-${invalidCase++}@example.test` });
        delete missing[field];
        return [missing, registration({ email: `${fixtureTag}-invalid-${invalidCase++}@example.test`, [field]: {} })];
      }),
      registration({ name: " \t ", email: `${fixtureTag}-blank-name@example.test` }),
      registration({ name: "x".repeat(101), email: `${fixtureTag}-long-name@example.test` }),
      registration({ email: "not-an-email" }),
      registration({ email: `${"x".repeat(151)}@example.test` }),
      registration({ email: `${fixtureTag}-blank-password@example.test`, password: "  " }),
      registration({ email: `${fixtureTag}-long-password@example.test`, password: "x".repeat(73) }),
      registration({ email: `${fixtureTag}-unicode-password@example.test`, password: "🔒".repeat(19) }),
    ];
    for (const value of bodies) {
      const result = await request("/api/auth/register", { value });
      assert.equal(result.status, 422);
      assert.equal(result.body.code, "VALIDATION_FAILED");
      assert.ok(result.body.fieldErrors);
      assert.equal(result.body.stack, undefined);
    }
    assert.equal(await db.User.count({ where: ownedUsers }), count);
  });

  it("cannot register admins or inject role/status/unknown registration fields", async () => {
    const count = await db.User.count({ where: ownedUsers });
    for (const accountType of ["admin", "public", "business_owner", "user "]) {
      const result = await request("/api/auth/register", {
        value: registration({ email: `${fixtureTag}-invalid-role-${invalidCase++}@example.test`, accountType }),
      });
      assert.equal(result.status, 422);
      assert.equal(typeof result.body.fieldErrors.accountType, "string");
    }
    for (const field of ["role", "status", "confirmPassword", "extraFields", "unknown"]) {
      const result = await request("/api/auth/register", {
        value: registration({ email: `${fixtureTag}-extra-${invalidCase++}@example.test`, [field]: "admin" }),
      });
      assert.equal(result.status, 422);
      assert.equal(result.body.code, "VALIDATION_FAILED");
      assert.equal(result.body.fieldErrors, null);
    }
    assert.equal(await db.User.count({ where: ownedUsers }), count);
    assert.equal(await db.User.count({ where: { ...ownedUsers, role: "admin" } }), 0);
  });

  it("enforces the new-signup character rule but preserves existing short-password account logins", async () => {
    for (const password of ["a", "x".repeat(5), "🔒".repeat(5)]) {
      const email = `${fixtureTag}-short-${invalidCase++}@example.test`;
      const result = await request("/api/auth/register", { value: registration({ email, password }) });
      assert.equal(result.status, 422);
      assert.match(result.body.fieldErrors.password, /6 characters/);
      assert.equal(await db.User.count({ where: { email } }), 0);
    }
    const email = `${fixtureTag}-legacy@example.test`;
    const legacy = await db.User.create({ fullName: "Existing legacy account", email, passwordHash: await bcrypt.hash("old", 10), role: "public", status: "active" });
    const result = await login({ email, password: "old" });
    assert.equal(result.status, 200);
    assert.equal(result.body.user.id, legacy.userId);
    await request("/api/auth/logout", { method: "PUT", token: result.body.token });
    for (const [index, password] of ["x".repeat(6), "🔒".repeat(6), "x".repeat(72), "🔒".repeat(18)].entries()) {
      const email = `${fixtureTag}-password-boundary-${index}@example.test`;
      const registered = await request("/api/auth/register", { value: registration({ email, password }) });
      assert.equal(registered.status, 201);
      const stored = await db.User.scope("withPassword").findByPk(registered.body.user.id);
      assert.equal(await bcrypt.compare(password, stored.passwordHash), true);
      const duplicate = await request("/api/auth/register", { value: registration({ email: ` ${email.toUpperCase()} `, password }) });
      assert.equal(duplicate.status, 409);
      assert.equal(duplicate.body.code, "EMAIL_EXISTS");
    }
  });

  it("serializes concurrent duplicate registration through the unique email constraint", async () => {
    const email = `${fixtureTag}-concurrent@example.test`;
    const results = await Promise.all(Array.from({ length: 5 }, (_, index) => request("/api/auth/register", {
      value: registration({ email: index % 2 ? ` ${email.toUpperCase()} ` : email }),
    })));
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409, 409, 409, 409]);
    for (const result of results.filter((result) => result.status === 409)) {
      assert.equal(result.body.code, "EMAIL_EXISTS");
      assert.equal(typeof result.body.fieldErrors.email, "string");
      assert.equal(result.body.stack, undefined);
    }
    assert.equal(await db.User.count({ where: { email } }), 1);
  });

  it("rejects a case-insensitive duplicate email with 409 and leaves the original account unchanged", async () => {
    const count = await db.User.count({ where: ownedUsers });
    const originalHash = publicAccount.passwordHash;
    const result = await request("/api/auth/register", {
      value: registration({ email: ` ${publicAccount.email.toUpperCase()} `, name: "Attempted replacement", password: "DifferentPassword!" }),
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, "EMAIL_EXISTS");
    assert.equal(typeof result.body.fieldErrors.email, "string");
    const stored = await db.User.scope("withPassword").findByPk(publicAccount.userId);
    assert.equal(stored.fullName, publicAccount.fullName);
    assert.equal(stored.passwordHash, originalHash);
    assert.equal(await db.User.count({ where: ownedUsers }), count);
  });

  it("logs in using real bcrypt/JWT, persists session metadata and grants the protected owner route", async () => {
    const result = await login({ email: ` ${publicAccount.email.toUpperCase()} `, password: fixturePassword });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.user, { id: publicAccount.userId, name: publicAccount.fullName, email: publicAccount.email, role: "public" });
    assert.equal(typeof result.body.token, "string");
    loginToken = result.body.token;
    const claims = jwt.verify(loginToken, process.env.JWT_SECRET);
    assert.equal(claims.id, publicAccount.userId);
    assert.equal(claims.role, "public");
    assert.equal(claims.status, "active");
    const session = await db.UserSession.findOne({ where: { token: loginToken, userId: publicAccount.userId } });
    assert.equal(session.status, "active");
    assert.equal(session.userAgent, `${fixtureTag} browser`);
    assert.equal(session.ipAddress, "127.0.0.1");
    assert.equal(result.body.user.passwordHash, undefined);
    assert.equal((await request("/api/campaigns/mine", { method: "GET", token: loginToken })).status, 200);
    assert.equal((await request("/api/campaigns/admin", { method: "GET", token: loginToken })).status, 403);
  });

  it("rejects wrong/unknown credentials and invalid login inputs without creating sessions", async () => {
    const where = { userId: publicAccount.userId };
    const count = await db.UserSession.count({ where });
    for (const value of [
      { email: publicAccount.email, password: "WrongPassword!" },
      { email: `${fixtureTag}-absent@example.test`, password: fixturePassword },
    ]) {
      const result = await login(value);
      assert.equal(result.status, 401);
      assert.equal(result.body.code, "INVALID_CREDENTIALS");
      assert.equal(result.body.token, undefined);
    }
    for (const value of [undefined, null, [], {}, { email: publicAccount.email }, { password: fixturePassword },
      { email: {}, password: fixturePassword }, { email: publicAccount.email, password: 42 },
      { email: "bad-email", password: fixturePassword }, { email: publicAccount.email, password: " " },
      { email: publicAccount.email, password: "x".repeat(73) },
    ]) {
      const result = await login(value);
      assert.equal(result.status, 422);
      assert.equal(result.body.code, "VALIDATION_FAILED");
      assert.ok(result.body.fieldErrors);
    }
    assert.equal(await db.UserSession.count({ where }), count);
  });

  it("rejects suspended accounts with correct credentials before issuing a new session", async () => {
    const count = await db.UserSession.count({ where: { userId: publicAccount.userId } });
    await publicAccount.update({ status: "suspended" });
    try {
      const result = await login({ email: publicAccount.email, password: fixturePassword });
      assert.equal(result.status, 403);
      assert.equal(result.body.code, "ACCOUNT_SUSPENDED");
      assert.equal(result.body.token, undefined);
      assert.equal(await db.UserSession.count({ where: { userId: publicAccount.userId } }), count);
      assert.equal((await request("/api/campaigns/mine", { method: "GET", token: loginToken })).status, 403);
    } finally {
      await publicAccount.update({ status: "active" });
    }
  });

  it("returns safe parser envelopes for malformed/oversized authentication JSON without writes", async () => {
    const userCount = await db.User.count({ where: ownedUsers });
    const sessionCount = await db.UserSession.count({ where: { userId: publicAccount.userId } });
    for (const route of ["/api/auth/register", "/api/auth/login", "/api/auth/logout"]) {
      const method = route.endsWith("logout") ? "PUT" : "POST";
      const malformed = await request(route, { method, rawBody: '{"password":"private-malformed-fixture",' });
      assert.equal(malformed.status, 422);
      assert.equal(malformed.body.code, "VALIDATION_FAILED");
      assert.equal(JSON.stringify(malformed.body).includes("private-malformed-fixture"), false);
      const oversized = await request(route, { method, value: { password: "x".repeat(110000) } });
      assert.equal(oversized.status, 413);
      assert.equal(oversized.body.code, "REQUEST_TOO_LARGE");
    }
    assert.equal(await db.User.count({ where: ownedUsers }), userCount);
    assert.equal(await db.UserSession.count({ where: { userId: publicAccount.userId } }), sessionCount);
  });

  it("returns typed 401 for expired/invalid JWTs without disguising real role restrictions", async () => {
    const claims = { id: publicAccount.userId, role: "public", status: "active" };
    const expiredToken = jwt.sign(claims, process.env.JWT_SECRET, {
      expiresIn: -1, jwtid: randomBytes(16).toString("base64url"),
    });
    const expiredSession = await db.UserSession.create({
      userId: publicAccount.userId, token: expiredToken,
      ipAddress: "127.0.0.1", userAgent: fixtureTag, status: "active",
    });
    const activeBefore = await db.UserSession.findOne({ where: { token: loginToken } });
    assert.equal(activeBefore.status, "active");
    for (const token of [
      expiredToken,
      jwt.sign(claims, "different-integration-fixture-signing-key", { expiresIn: "1h" }),
      jwt.sign({ ...claims, nbf: Math.floor(Date.now() / 1000) + 3600 }, process.env.JWT_SECRET),
      "not-a-jwt",
    ]) {
      const result = await request("/api/auth/logout", { method: "PUT", token });
      assert.equal(result.status, 401);
      assert.equal(result.body.code, "INVALID_TOKEN");
      assert.equal(result.body.error, "Invalid token");
      assert.equal(result.body.message, "Your session is invalid or has expired");
      assert.equal(result.body.fieldErrors, null);
      assert.equal(result.body.stack, undefined);
      assert.equal(JSON.stringify(result.body).includes(token), false);
    }
    // A JWT already unusable through expiry needs no revocation write. Do not
    // imply its retained ledger row or an unrelated active session was changed.
    await expiredSession.reload();
    assert.equal(expiredSession.status, "active");
    assert.equal(expiredSession.logoutAt, null);
    assert.equal((await db.UserSession.findOne({ where: { token: loginToken } })).status, "active");
    const protectedExpired = await request("/api/campaigns/mine", { method: "GET", token: expiredToken });
    assert.equal(protectedExpired.status, 401);
    assert.equal(protectedExpired.body.code, "INVALID_TOKEN");
    const forbidden = await request("/api/campaigns/admin", { method: "GET", token: loginToken });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.code, "FORBIDDEN");
  });

  it("rejects missing sessions and mismatched verified ownership without revoking another ledger owner", async () => {
    const claims = { id: publicAccount.userId, role: "public", status: "active" };
    const absentToken = jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: "1h", jwtid: randomBytes(16).toString("base64url") });
    const mismatchedToken = jwt.sign({ ...claims, id: publicAccount.userId + 100000 }, process.env.JWT_SECRET, {
      expiresIn: "1h", jwtid: randomBytes(16).toString("base64url"),
    });
    const mismatchedSession = await db.UserSession.create({
      userId: publicAccount.userId, token: mismatchedToken,
      ipAddress: "127.0.0.1", userAgent: fixtureTag, status: "active",
    });
    for (const token of [absentToken, mismatchedToken]) {
      const result = await request("/api/auth/logout", { method: "PUT", token });
      assert.equal(result.status, 401);
      assert.equal(result.body.code, "INVALID_TOKEN");
      assert.equal(result.body.error, "Session expired or logged out");
      assert.equal(result.body.fieldErrors, null);
    }
    await mismatchedSession.reload();
    assert.equal(mismatchedSession.status, "active");
    assert.equal(mismatchedSession.logoutAt, null);
  });

  it("logout expires the persisted session, invalidates its token and rejects repeated/malformed logout", async () => {
    assert.equal((await request("/api/campaigns/mine", { method: "GET", token: loginToken })).status, 200);
    const logout = await request("/api/auth/logout", { method: "PUT", token: loginToken });
    assert.deepEqual(logout, { status: 204, body: null });
    const session = await db.UserSession.findOne({ where: { token: loginToken, userId: publicAccount.userId } });
    assert.equal(session.status, "expired");
    assert.ok(session.logoutAt instanceof Date && !Number.isNaN(session.logoutAt.getTime()));
    const protectedRoute = await request("/api/campaigns/mine", { method: "GET", token: loginToken });
    assert.equal(protectedRoute.status, 401);
    assert.equal(protectedRoute.body.code, "INVALID_TOKEN");
    const repeated = await request("/api/auth/logout", { method: "PUT", token: loginToken });
    assert.equal(repeated.status, 401);
    // Retain the legacy error field alongside the typed response envelope.
    assert.equal(repeated.body.error, "Session expired or logged out");
    assert.equal(repeated.body.code, "INVALID_TOKEN");
    for (const [headers, expectedStatus] of [
      [{}, 401], [{ Authorization: "Basic fixture" }, 401], [{ Authorization: "Bearer fixture extra" }, 401],
    ]) {
      const result = await request("/api/auth/logout", { method: "PUT", headers });
      assert.equal(result.status, expectedStatus);
      assert.equal(typeof result.body.error, "string");
      assert.equal(result.body.code, "INVALID_TOKEN");
      assert.equal(result.body.stack, undefined);
    }
  });
});
