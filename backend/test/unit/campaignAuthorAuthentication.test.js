"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { createCampaignAuthorGuard } = require("../../src/middleware/campaignAuthorAuthentication");
const originalSecret = process.env.JWT_SECRET;
before(() => { process.env.JWT_SECRET = "unit-test-signing-key-not-a-deployment-secret"; });
after(() => { if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret; });

function sign(claims = {}, options = {}) {
  return jwt.sign({ id: 7, role: "public", status: "active", ...claims }, process.env.JWT_SECRET, { expiresIn: "1d", ...options });
}

async function run({ header, user = { userId: 7, role: "public", status: "active" }, session = { status: "active" }, databaseError = false }) {
  let lookedUpSession;
  const guard = createCampaignAuthorGuard({
    User: { findByPk: async () => user },
    UserSession: { findOne: async (query) => {
      lookedUpSession = query.where;
      if (databaseError) throw new Error("private database failure");
      if (session?.userId && session.userId !== query.where.userId) return null;
      return session;
    } },
  });
  const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  const request = { headers: { authorization: header } };
  let passed = false;
  await guard(request, response, () => { passed = true; });
  return { passed, request, response, lookedUpSession };
}

test("requires a valid Bearer token and matching active database session", async () => {
  const token = sign();
  const result = await run({ header: `Bearer ${token}` });
  assert.equal(result.passed, true);
  assert.deepEqual(result.lookedUpSession, { token, userId: 7, status: "active" });
  assert.deepEqual(result.request.user, { id: 7, role: "public", status: "active" });
  for (const header of [undefined, "", `Basic ${token}`, `Bearer ${token} extra`, "Bearer", "Bearer nonsense", `Bearer ${sign({}, { expiresIn: -1 })}`]) {
    const failure = await run({ header });
    assert.equal(failure.response.statusCode, 401);
    assert.equal(failure.passed, false);
  }
  assert.equal((await run({ header: `Bearer ${token}`, session: null })).response.statusCode, 401);
  assert.equal((await run({ header: `Bearer ${token}`, session: { userId: 8, status: "active" } })).response.statusCode, 401);
  assert.equal((await run({ header: `Bearer ${token}`, user: null })).response.statusCode, 401);
});

test("uses current database role and status rather than stale JWT claims", async () => {
  const token = sign();
  for (const role of ["business_owner", "admin"]) {
    const result = await run({ header: `Bearer ${token}`, user: { userId: 7, role, status: "active" } });
    assert.equal(result.response.statusCode, 403);
    assert.equal(result.passed, false);
  }
  const suspended = await run({ header: `Bearer ${token}`, user: { userId: 7, role: "public", status: "suspended" } });
  assert.equal(suspended.response.body.code, "ACCOUNT_SUSPENDED");
  assert.equal(suspended.response.statusCode, 403);
  assert.equal((await run({ header: `Bearer ${sign({ role: "admin", status: "suspended" })}` })).passed, true);
});

test("database failures return a safe 500 without granting access", async () => {
  const result = await run({ header: `Bearer ${sign()}`, databaseError: true });
  assert.equal(result.response.statusCode, 500);
  assert.equal(result.response.body.message, "Something went wrong");
  assert.equal(result.passed, false);
});
