"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const vm = require("node:vm");
const express = require("express");
const { validateRegistrationInput, validateLoginInput } = require("../../src/utils/authValidation");

const valid = { name: "  Alex Member  ", email: "  ALEX@EXAMPLE.COM  ", password: " keep spaces intact ", accountType: "user" };
const plain = (value) => JSON.parse(JSON.stringify(value));

function invalid(validate, body, field) {
  assert.throws(() => validate(body), (error) => (
    error.status === 422 && error.code === "VALIDATION_FAILED" && Boolean(error.fieldErrors?.[field])
  ));
}

// Load the real module with isolated database/crypto substitutes. Unit tests do
// not initialize Sequelize or require a running database or signing credential.
function isolatedModule(relativePath, substitutes, logs = []) {
  const filename = path.resolve(__dirname, relativePath);
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(filename, "utf8"), {
    module,
    exports: module.exports,
    require: (name) => Object.hasOwn(substitutes, name) ? substitutes[name] : nativeRequire(name),
    process: { env: { JWT_SECRET: "unit-test-signing-key-not-a-deployment-secret" } },
    console: { error: (...values) => logs.push(values), log: (...values) => logs.push(values) },
  }, { filename });
  return module.exports;
}

function services({ existing = null, fresh = existing, compare = true, updateRows = 1, databaseError = null, createError = null } = {}) {
  const calls = [];
  const User = {
    findByPk: async (id, options) => { calls.push(["lockedAccount", id, options]); return fresh; },
    findOne: async (options) => {
      calls.push(["findOne", options]);
      if (databaseError) throw databaseError;
      return existing;
    },
    create: async (values) => { calls.push(["create", values]); if (createError) throw createError; return { userId: 7, ...values }; },
    scope: (scope) => { calls.push(["scope", scope]); return User; },
  };
  const UserSession = {
    create: async (values) => { calls.push(["session", values]); },
    update: async (values, options) => { calls.push(["logout", values, options]); return [updateRows]; },
  };
  const service = isolatedModule("../../src/services/authServices.js", {
    "../database/models": { User, UserSession, sequelize: { transaction: async (action) => action({ LOCK: { UPDATE: "UPDATE" } }) } },
    bcrypt: {
      hash: async (password, rounds) => { calls.push(["hash", password, rounds]); return "hashed-not-plaintext"; },
      compare: async (password, hash) => { calls.push(["compare", password, hash]); return compare; },
    },
    jsonwebtoken: { sign: (claims, secret, options) => { calls.push(["sign", claims, secret, options]); return "unit-token"; } },
  });
  return { service, calls };
}

function response() {
  return {
    status(status) { this.statusCode = status; return this; },
    json(body) { this.body = body; return this; },
    send() { this.sent = true; return this; },
  };
}

async function parserServer(t, { routeError = null } = {}) {
  const logs = [];
  let routeCalls = 0;
  const router = express.Router();
  router.use((req, res, next) => {
    routeCalls += 1;
    if (routeError) return next(routeError);
    return res.status(204).send();
  });
  const app = isolatedModule("../../src/app.js", {
    "./router/authRoutes": router,
    "./router/campaignRoutes": router,
  }, logs);
  app.set("env", "production");
  let server;
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { logs, routeCalls: () => routeCalls, request: (route, options) => fetch(`${origin}${route}`, {
    method: route.endsWith("logout") ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(5000),
    ...options,
  }) };
}

test("registration normalizes name/email but preserves the password exactly", () => {
  assert.deepEqual(validateRegistrationInput(valid), {
    name: "Alex Member", email: "alex@example.com", password: " keep spaces intact ", accountType: "user",
  });
  assert.equal(validateRegistrationInput({ ...valid, accountType: "business" }).accountType, "business");
});

test("new registrations require 15 Unicode characters while existing short-password logins remain valid", () => {
  for (const password of ["a", "a".repeat(14), "🔒".repeat(8), "🔒".repeat(14)]) {
    invalid(validateRegistrationInput, { ...valid, password }, "password");
    assert.equal(validateLoginInput({ email: valid.email, password }).password, password);
  }
  for (const password of ["a".repeat(15), "🔒".repeat(15), "a long pass phrase with spaces"]) {
    assert.equal(validateRegistrationInput({ ...valid, password }).password, password);
  }
});

test("registration rejects non-object bodies and missing/wrongly typed account fields", () => {
  for (const body of [undefined, null, [], "text", 3, false]) invalid(validateRegistrationInput, body, "body");
  for (const field of ["name", "email", "password", "accountType"]) {
    const body = { ...valid }; delete body[field]; invalid(validateRegistrationInput, body, field);
    for (const value of [null, {}, [], 3, false]) invalid(validateRegistrationInput, { ...valid, [field]: value }, field);
  }
  for (const field of ["name", "email", "password"]) {
    invalid(validateRegistrationInput, { ...valid, [field]: " \t\n " }, field);
  }
});

test("registration enforces the frontend's trimmed name/email bounds and email syntax", () => {
  assert.equal(validateRegistrationInput({ ...valid, name: ` ${"a".repeat(100)} ` }).name.length, 100);
  invalid(validateRegistrationInput, { ...valid, name: "a".repeat(101) }, "name");
  const maximumEmail = `${"a".repeat(137)}@example.test`;
  assert.equal(maximumEmail.length, 150);
  assert.equal(validateRegistrationInput({ ...valid, email: ` ${maximumEmail} ` }).email, maximumEmail);
  invalid(validateRegistrationInput, { ...valid, email: `a${maximumEmail}` }, "email");
  for (const email of ["invalid", "a@b", "@example.test", "a b@example.test", "a@example..test\ninvalid"]) {
    invalid(validateRegistrationInput, { ...valid, email }, "email");
  }
});

test("password byte limits prevent bcrypt truncation, including multi-byte input", () => {
  for (const password of ["a".repeat(72), "🔒".repeat(18)]) {
    assert.equal(validateRegistrationInput({ ...valid, password }).password, password);
    assert.equal(validateLoginInput({ email: valid.email, password }).password, password);
  }
  for (const password of ["a".repeat(73), "🔒".repeat(19)]) {
    invalid(validateRegistrationInput, { ...valid, password }, "password");
    invalid(validateLoginInput, { email: valid.email, password }, "password");
  }
});

test("registration still rejects unsupported fields and cannot create admin accounts", () => {
  for (const field of ["role", "status", "confirmPassword", "extraFields", "constructor", "unknown"]) {
    assert.throws(() => validateRegistrationInput({ ...valid, [field]: "value" }), (error) => (
      error.status === 422 && error.code === "VALIDATION_FAILED"
      && error.fieldErrors === null && error.message.startsWith("Unsupported registration field")
    ));
  }
  const prototypeField = JSON.parse(JSON.stringify(valid).replace(/}$/, ',"__proto__":"bad"}'));
  assert.throws(() => validateRegistrationInput(prototypeField), (error) => error.status === 422);
  for (const accountType of ["admin", "public", "business_owner", "user ", ""]) {
    invalid(validateRegistrationInput, { ...valid, accountType }, "accountType");
  }
});

test("login rejects malformed bodies/credentials instead of throwing type errors", () => {
  for (const body of [undefined, null, [], 4, "text"]) invalid(validateLoginInput, body, "body");
  for (const email of [undefined, {}, 8, "", "  ", "not-an-email", "a".repeat(151)]) {
    invalid(validateLoginInput, { email, password: valid.password }, "email");
  }
  for (const password of [undefined, {}, 8, "", "  "]) {
    invalid(validateLoginInput, { email: valid.email, password }, "password");
  }
  assert.deepEqual(validateLoginInput({ email: valid.email, password: valid.password, ignored: true }), {
    email: "alex@example.com", password: valid.password,
  });
});

test("registration validates before database lookup or hashing and preserves server-owned roles", async () => {
  for (const accountType of ["user", "business"]) {
    const { service, calls } = services();
    const result = await service.registerUser({ ...valid, accountType });
    const expectedRole = accountType === "business" ? "business_owner" : "public";
    assert.deepEqual(plain(result), { message: "Registered!", user: { id: 7, name: "Alex Member", role: expectedRole } });
    assert.deepEqual(plain(calls.find(([name]) => name === "create")[1]), {
      fullName: "Alex Member", email: "alex@example.com", passwordHash: "hashed-not-plaintext", role: expectedRole,
    });
    assert.deepEqual(calls.find(([name]) => name === "hash"), ["hash", valid.password, 10]);
  }
  for (const body of [null, { ...valid, password: " " }, { ...valid, accountType: "admin" }, { ...valid, role: "admin" }]) {
    const { service, calls } = services();
    await assert.rejects(service.registerUser(body), (error) => error.status === 422);
    assert.deepEqual(calls, []);
  }
});

test("duplicate email retains the existing 409 error envelope and never hashes/inserts", async () => {
  const { service, calls } = services({ existing: { userId: 9 } });
  await assert.rejects(service.registerUser(valid), (error) => (
    error.status === 409 && error.code === "EMAIL_EXISTS" && typeof error.fieldErrors.email === "string"
  ));
  assert.deepEqual(calls.map(([name]) => name), ["findOne"]);
});

test("a concurrent email insert conflict returns the same 409 without exposing database details", async () => {
  const { UniqueConstraintError } = require("sequelize");
  const error = new UniqueConstraintError({ fields: { email: valid.email }, message: "private SQL details" });
  const { service, calls } = services({ createError: error });
  await assert.rejects(service.registerUser(valid), (failure) => (
    failure.status === 409 && failure.code === "EMAIL_EXISTS"
    && typeof failure.fieldErrors.email === "string" && !failure.message.includes("SQL")
  ));
  assert.deepEqual(calls.map(([name]) => name), ["findOne", "hash", "create"]);
});

test("registration does not disguise unrelated unique constraints or database failures as duplicate email", async () => {
  const { UniqueConstraintError } = require("sequelize");
  for (const error of [new UniqueConstraintError({ fields: { user_id: 7 } }), new Error("database unavailable")]) {
    const { service } = services({ createError: error });
    await assert.rejects(service.registerUser(valid), (failure) => failure === error);
  }
});

test("valid login normalizes lookup, preserves password, and stores the real session", async () => {
  const account = { userId: 7, fullName: "Alex Member", email: "alex@example.com", passwordHash: "hashed", role: "public", status: "active" };
  const { service, calls } = services({ existing: account });
  assert.deepEqual(plain(await service.loginUser(valid.email, valid.password, { ipAddress: "127.0.0.1", userAgent: " Unit browser " })), {
    user: { id: 7, name: "Alex Member", email: "alex@example.com", role: "public" }, token: "unit-token",
  });
  assert.deepEqual(plain(calls.find(([name]) => name === "findOne")[1]), { where: { email: "alex@example.com" } });
  assert.deepEqual(calls.find(([name]) => name === "compare"), ["compare", valid.password, "hashed"]);
  assert.deepEqual(plain(calls.find(([name]) => name === "session")[1]), {
    userId: 7, token: "unit-token", ipAddress: "127.0.0.1", userAgent: "Unit browser", status: "active",
  });
  assert.equal(calls.find(([name]) => name === "lockedAccount")[2].lock, "UPDATE");
  assert.match(calls.find(([name]) => name === "sign")[3].jwtid, /^[A-Za-z0-9_-]{22}$/);
});

test("login rechecks the locked current account before creating a session", async () => {
  const existing = { userId: 7, passwordHash: "hashed", role: "public", status: "active" };
  for (const fresh of [null, { ...existing, status: "suspended" }]) {
    const { service, calls } = services({ existing, fresh });
    await assert.rejects(service.loginUser(valid.email, valid.password), (error) => [401, 403].includes(error.status));
    assert.equal(calls.some(([name]) => name === "sign" || name === "session"), false);
  }
});

test("invalid login cannot query, sign a token, or create a session", async () => {
  for (const [email, password] of [[{}, valid.password], [valid.email, null], ["bad", "a"], [valid.email, "a".repeat(73)]]) {
    const { service, calls } = services();
    await assert.rejects(service.loginUser(email, password), (error) => error.status === 422);
    assert.deepEqual(calls, []);
  }
  const active = { userId: 7, passwordHash: "hashed", role: "public", status: "active" };
  for (const options of [{ existing: null }, { existing: active, compare: false }, { existing: { ...active, status: "suspended" } }]) {
    const { service, calls } = services(options);
    await assert.rejects(service.loginUser(valid.email, valid.password), (error) => [401, 403].includes(error.status));
    assert.equal(calls.some(([name]) => name === "sign" || name === "session"), false);
  }
});

test("logout validates a single Bearer token and invalidates only its active session", async () => {
  for (const header of [undefined, null, [], 3, "", "Basic token", "Bearer", "Bearer token extra", "Bearer  token", "Bearer token\n"]) {
    const { service, calls } = services();
    await assert.rejects(service.logoutUser(header), (error) => error.status === 401 && error.code === "INVALID_TOKEN");
    assert.deepEqual(calls, []);
  }
  const { service, calls } = services();
  assert.equal(await service.logoutUser("bearer unit-token"), undefined);
  const [, values, options] = calls[0];
  assert.equal(values.status, "expired");
  assert.equal(Number.isNaN(values.logoutAt.getTime()), false);
  assert.deepEqual(plain(options), { where: { token: "unit-token", status: "active" } });
  await assert.rejects(services({ updateRows: 0 }).service.logoutUser("Bearer unit-token"), (error) => error.status === 401);
});

test("auth controllers mask unexpected failures and do not log secret-bearing errors", async () => {
  const privateText = "private-password token=private-token SQL=private-sql";
  for (const action of ["registration", "login", "logout"]) {
    const logs = [];
    const failure = Object.assign(new Error(privateText), { status: 503, code: privateText, fieldErrors: { password: privateText } });
    const failing = async () => { throw failure; };
    const controller = isolatedModule("../../src/controllers/auth.js", {
      "../services/authServices": { registerUser: failing, loginUser: failing, logoutUser: failing },
    }, logs);
    const res = response();
    await controller[action]({ body: valid, headers: { authorization: "Bearer unit-token" }, ip: "127.0.0.1", get: () => "Unit browser" }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { status: 500, code: "INTERNAL_SERVER_ERROR", message: "Something went wrong", fieldErrors: null });
    assert.equal(logs.length, 1);
    assert.equal(JSON.stringify(logs).includes("private-"), false);
    assert.equal(JSON.stringify(logs).includes(valid.password), false);
  }
});

test("auth controllers retain known 4xx responses without error/body logging", async () => {
  const logs = [];
  const failure = Object.assign(new Error("Unable to create your account"), { status: 409, code: "EMAIL_EXISTS", fieldErrors: { email: "Email is already registered" } });
  const controller = isolatedModule("../../src/controllers/auth.js", {
    "../services/authServices": { registerUser: async () => { throw failure; } },
  }, logs);
  const res = response();
  await controller.registration({ body: valid }, res);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { status: 409, code: "EMAIL_EXISTS", message: failure.message, fieldErrors: failure.fieldErrors });
  assert.deepEqual(logs, []);
});

test("controller registration validates the real JSON body and login rejects non-objects", async () => {
  const logs = [];
  const { service, calls } = services();
  const controller = isolatedModule("../../src/controllers/auth.js", { "../services/authServices": service }, logs);
  for (const body of [undefined, null, []]) {
    for (const action of ["registration", "login"]) {
      const res = response();
      await controller[action]({ body, get: () => "Unit browser" }, res);
      assert.equal(res.statusCode, 422);
      assert.equal(res.body.code, "VALIDATION_FAILED");
      assert.equal(typeof res.body.fieldErrors.body, "string");
    }
  }
  assert.deepEqual(calls, []);
  assert.deepEqual(logs, []);
});

test("controller successful responses retain registration/login/logout statuses and bodies", async () => {
  const account = { userId: 7, fullName: "Alex Member", email: "alex@example.com", passwordHash: "hashed", role: "public", status: "active" };
  const controller = isolatedModule("../../src/controllers/auth.js", {
    "../services/authServices": { ...services().service, loginUser: services({ existing: account }).service.loginUser },
  });
  const request = { body: valid, headers: { authorization: "Bearer unit-token" }, ip: "127.0.0.1", get: () => "Unit browser" };
  const registration = response(); await controller.registration(request, registration);
  assert.equal(registration.statusCode, 201);
  assert.equal(registration.body.user.role, "public");
  const login = response(); await controller.login(request, login);
  assert.equal(login.statusCode, 200);
  assert.equal(login.body.token, "unit-token");
  const logout = response(); await controller.logout(request, logout);
  assert.equal(logout.statusCode, 204);
  assert.equal(logout.sent, true);
  assert.equal(logout.body, undefined);
});

test("production database logging is disabled without changing local/test settings", () => {
  const config = isolatedModule("../../src/database/config/config.js", {
    dotenv: { config() {} },
  });
  assert.equal(config.production.logging, false);
  assert.equal(config.development.logging, undefined);
  assert.equal(config.test.logging, undefined);
  for (const environment of ["production", "development", "test"]) {
    assert.equal(config[environment].dialect, "mysql");
  }
});

test("auth malformed JSON gets a safe 422 before routes run, without exposing/logging request text", async (t) => {
  const server = await parserServer(t);
  for (const route of ["/api/auth/register", "/api/auth/login", "/api/auth/logout"]) {
    const res = await server.request(route, { body: '{"password":"private-parser-secret",' });
    assert.equal(res.status, 422);
    assert.match(res.headers.get("content-type"), /application\/json/);
    const body = await res.json();
    assert.deepEqual(body, { status: 422, code: "VALIDATION_FAILED", message: "Account data is invalid", fieldErrors: { body: "Send a valid JSON object" } });
    assert.equal(JSON.stringify(body).includes("private-parser-secret"), false);
  }
  assert.equal(server.routeCalls(), 0);
  assert.deepEqual(server.logs, []);
});

test("auth oversized JSON returns a safe 413 without reaching routes or logging input", async (t) => {
  const server = await parserServer(t);
  for (const route of ["/api/auth/register", "/api/auth/login", "/api/auth/logout"]) {
    const res = await server.request(route, { body: JSON.stringify({ password: `private-oversize-secret${"a".repeat(128 * 1024)}` }) });
    assert.equal(res.status, 413);
    assert.deepEqual(await res.json(), { status: 413, code: "REQUEST_TOO_LARGE", message: "Request body is too large", fieldErrors: null });
  }
  assert.equal(server.routeCalls(), 0);
  assert.deepEqual(server.logs, []);
});

test("auth unsupported encoding/content type parser failures retain a safe JSON envelope", async (t) => {
  const server = await parserServer(t);
  for (const headers of [
    { "Content-Type": "application/json; charset=iso-8859-1" },
    { "Content-Type": "application/json", "Content-Encoding": "gzip" },
  ]) {
    const res = await server.request("/api/auth/login", { headers, body: '{"password":"private-encoding-secret"}' });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.code, "VALIDATION_FAILED");
    assert.equal(JSON.stringify(body).includes("private-encoding-secret"), false);
  }
  assert.equal(server.routeCalls(), 0);
  assert.deepEqual(server.logs, []);
});

test("auth unexpected pipeline errors return/log only a safe generic 500", async (t) => {
  const server = await parserServer(t, { routeError: new Error("private-pipeline-password SQL=private-sql") });
  const res = await server.request("/api/auth/login", { body: "{}" });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { status: 500, code: "INTERNAL_SERVER_ERROR", message: "Something went wrong", fieldErrors: null });
  assert.equal(server.routeCalls(), 1);
  assert.equal(server.logs.length, 1);
  assert.equal(JSON.stringify(server.logs).includes("private-"), false);
});

test("auth parser handling does not intercept valid JSON or change campaign error messages", async (t) => {
  const server = await parserServer(t);
  const validResponse = await server.request("/api/auth/login", { body: "{}" });
  assert.equal(validResponse.status, 204);
  assert.equal(server.routeCalls(), 1);
  const campaignResponse = await server.request("/api/campaigns", { body: '{"title":' });
  assert.equal(campaignResponse.status, 422);
  assert.equal((await campaignResponse.json()).message, "Campaign data is invalid");
  assert.equal(server.routeCalls(), 1);
  assert.deepEqual(server.logs, []);
});
