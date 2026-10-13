"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateOwnerEdit, createOwnerCampaignManagementService } = require("../../src/services/ownerCampaignManagement");
const { createAdminManagementService, serializeUser } = require("../../src/services/adminManagement");
const { parseManagementQuery, lockActor } = require("../../src/services/campaignManagementSupport");

const version = "2026-10-01T05:00:00.123Z";
const edit = { title: " Updated title ", description: "Details", categoryId: 2, startDate: "2028-01-01", endDate: "2028-01-02", expectedUpdatedAt: version };
const fail = (fn, code, status) => assert.rejects(fn, (error) => error.code === code && (!status || error.status === status));

function fixture({ role = "admin", status = "active", campaignStatus = "approved", deletedAt = null, ownerId = 2 } = {}) {
  const calls = { updates: [], audits: [], sessions: [], locks: [] };
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  const actor = { userId: 1, role, status };
  const target = { userId: 2, fullName: "Test User", email: "test@example.test", role: "public", status: "active", createdAt: new Date(version), async update(values) { Object.assign(this, values); } };
  const campaign = {
    campaignId: 9, createdBy: ownerId, status: campaignStatus, updatedAt: new Date(version), deletedAt,
    title: "Campaign", description: "Details", categoryId: 2, imageUrl: "https://example.test/old.jpg", businessId: null,
    set(values) { Object.assign(this, values); }, setDataValue(key, value) { this[key] = value; }, get() { return { ...this }; },
  };
  const models = {
    sequelize: { transaction: async (work) => work(transaction) },
    User: {
      findByPk: async (id, options) => { calls.locks.push(["user", id, options.lock]); return id === 1 ? actor : id === 2 ? target : null; },
      findAndCountAll: async () => ({ rows: [target], count: 1 }),
    },
    UserSession: {
      findOne: async ({ where }) => where.token === "valid" ? {} : null,
      update: async (values, options) => { calls.sessions.push({ values, options }); return [2]; },
    },
    Campaign: {
      findByPk: async (id, options) => { calls.locks.push(["campaign", id, options.lock]); return id === 9 ? campaign : null; },
      update: async (values, options) => { calls.updates.push({ values, options }); return [1]; },
    },
    Category: { findByPk: async (id) => id === 2 ? { categoryId: 2, categoryName: "Environment" } : null },
    Business: { findOne: async () => null },
    CampaignReview: { findOne: async () => null, findAndCountAll: async () => ({ rows: [], count: 0 }) },
    ManagementAudit: { create: async (values) => calls.audits.push(values) },
  };
  return { models, calls, campaign, actor, target, transaction };
}

test("owner edit validates complete fields, version and exclusive image changes", () => {
  assert.equal(validateOwnerEdit(edit).values.title, "Updated title");
  assert.throws(() => validateOwnerEdit({ ...edit, ...JSON.parse('{"__proto__":"not accepted"}') }), (error) => error.status === 422 && Object.hasOwn(error.fieldErrors, "__proto__"));
  for (const changes of [
    { expectedUpdatedAt: "2026-10-01" }, { imageId: "" }, { imageId: null },
    { removeImage: false }, { removeImage: true, imageId: "abc" }, { businessId: 4 },
    { status: "approved" }, { categoryId: "2" }, { endDate: "2027-12-31" },
  ]) assert.throws(() => validateOwnerEdit({ ...edit, ...changes }), (error) => error.status === 422);
});

test("management pagination, filters and account projection do not leak fields", () => {
  assert.deepEqual(parseManagementQuery(), { page: 1, pageSize: 10 });
  assert.deepEqual(parseManagementQuery({ page: "2", pageSize: "100", search: " Test ", status: "active", unknown: "ignored" }, { accounts: true }), { page: 2, pageSize: 100, search: "Test", status: "active" });
  for (const query of [{ page: "0" }, { page: [] }, { pageSize: "101" }, { search: [] }, { search: "a".repeat(151) }, { status: "pending" }]) {
    assert.throws(() => parseManagementQuery(query, { accounts: true }), (error) => error.status === 422);
  }
  assert.deepEqual(Object.keys(serializeUser({ userId: 1, passwordHash: "secret", token: "secret" })), ["id", "name", "email", "role", "status", "createdAt"]);
});

test("transaction guard rechecks current status, role and active session", async () => {
  for (const [options, token, code] of [[{ status: "suspended" }, "valid", "ACCOUNT_SUSPENDED"], [{ role: "public" }, "valid", "FORBIDDEN"], [{}, "expired", "INVALID_TOKEN"]]) {
    const f = fixture(options);
    await fail(() => lockActor(f.models, { id: 1 }, token, ["admin"], f.transaction), code);
    assert.equal(f.calls.locks[0][2], "UPDATE");
  }
});

test("owner edit locks, preserves ownership, returns pending and advances exact version", async () => {
  const f = fixture({ role: "public", ownerId: 1 });
  let imageCall;
  const result = await createOwnerCampaignManagementService(f.models, { applyCampaignImageChange: async (input) => { imageCall = input; input.campaign.imageUrl = null; } })
    .edit("9", { ...edit, removeImage: true }, { id: 1 }, "valid");
  assert.equal(imageCall.transaction, f.transaction);
  assert.equal(imageCall.user.id, 1);
  assert.equal(result.campaign.status, "pending");
  assert.equal(result.campaign.createdBy, 1);
  assert.equal(result.campaign.category, "Environment");
  assert.equal(result.campaign.imageUrl, null);
  assert.ok(Date.parse(result.campaign.updatedAt) > Date.parse(version));
  assert.deepEqual(f.calls.locks.map((item) => item[0]), ["user", "campaign"]);
});

test("owner rejects other owners, deleted rows and stale versions before upload mutation", async () => {
  for (const [options, body, code] of [
    [{ role: "public" }, edit, "CAMPAIGN_NOT_FOUND"],
    [{ role: "public", ownerId: 1, deletedAt: new Date() }, edit, "CAMPAIGN_NOT_FOUND"],
    [{ role: "public", ownerId: 1 }, { ...edit, expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }, "CAMPAIGN_CHANGED"],
  ]) {
    const f = fixture(options);
    await fail(() => createOwnerCampaignManagementService(f.models, { applyCampaignImageChange: async () => assert.fail("upload must not run") }).edit("9", body, { id: 1 }, "valid"), code);
    assert.equal(f.calls.updates.length, 0);
  }
});

test("owner deletion preserves row/history and records actor with nullable reason", async () => {
  const f = fixture({ role: "public", ownerId: 1 });
  await createOwnerCampaignManagementService(f.models).remove("9", { expectedUpdatedAt: version }, { id: 1 }, "valid");
  assert.equal(f.calls.updates[0].values.deletedBy, 1);
  assert.equal(f.calls.audits[0].action, "campaign_deleted");
  assert.equal(f.calls.audits[0].reason, null);
});

test("admin unpublish requires approved state, reason and the loaded version", async () => {
  const f = fixture();
  const result = await createAdminManagementService(f.models).unpublish("9", { status: "pending", reason: " Check event ", expectedUpdatedAt: version }, { id: 1 }, "valid");
  assert.equal(result.campaign.status, "pending");
  assert.equal(f.calls.audits[0].reason, "Check event");
  assert.equal(f.calls.audits[0].action, "campaign_unpublished");
  for (const [options, body, code] of [
    [{ campaignStatus: "pending" }, { status: "pending", reason: "x", expectedUpdatedAt: version }, "CAMPAIGN_STATE_CHANGED"],
    [{}, { status: "pending", reason: "x", expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }, "CAMPAIGN_CHANGED"],
    [{}, { status: "pending", reason: "", expectedUpdatedAt: version }, "VALIDATION_FAILED"],
  ]) {
    const x = fixture(options);
    await fail(() => createAdminManagementService(x.models).unpublish("9", body, { id: 1 }, "valid"), code);
    assert.equal(x.calls.updates.length, 0);
    assert.equal(x.calls.audits.length, 0);
  }
});

test("admin soft deletion rejects missing/deleted rows and writes one recoverable event", async () => {
  const f = fixture();
  await createAdminManagementService(f.models).remove("9", { reason: "Withdrawn", expectedUpdatedAt: version }, { id: 1 }, "valid");
  assert.ok(f.calls.updates[0].values.deletedAt instanceof Date);
  assert.equal(f.calls.audits[0].targetId, 9);
  const deleted = fixture({ deletedAt: new Date() });
  await fail(() => createAdminManagementService(deleted.models).remove("9", { reason: "x", expectedUpdatedAt: version }, { id: 1 }, "valid"), "CAMPAIGN_NOT_FOUND");
  assert.equal(deleted.calls.audits.length, 0);
});

test("admin status update revokes all sessions once and never restores them", async () => {
  const f = fixture();
  const service = createAdminManagementService(f.models);
  const first = await service.changeUserStatus("2", { status: "suspended" }, { id: 1 }, "valid");
  assert.equal(first.user.status, "suspended");
  assert.deepEqual(f.calls.sessions[0].options.where, { userId: 2, status: "active" });
  await service.changeUserStatus("2", { status: "suspended" }, { id: 1 }, "valid");
  assert.equal(f.calls.audits.length, 1);
  await service.changeUserStatus("2", { status: "active" }, { id: 1 }, "valid");
  assert.equal(f.calls.sessions.length, 2); // only the two suspension requests
  assert.equal(f.calls.audits[1].action, "user_reactivated");
});

test("admin status cannot change any admin, themselves, roles or unknown users", async () => {
  const f = fixture();
  const service = createAdminManagementService(f.models);
  await fail(() => service.changeUserStatus("1", { status: "suspended" }, { id: 1 }, "valid"), "FORBIDDEN");
  f.target.role = "admin";
  await fail(() => service.changeUserStatus("2", { status: "active" }, { id: 1 }, "valid"), "FORBIDDEN");
  await fail(() => service.changeUserStatus("3", { status: "suspended" }, { id: 1 }, "valid"), "USER_NOT_FOUND");
  await fail(() => service.changeUserStatus("2", { status: "active", role: "admin" }, { id: 1 }, "valid"), "VALIDATION_FAILED");
  assert.equal(f.calls.audits.length, 0);
});
