"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBusinessCampaignSubmissionService } = require("../../src/services/businessCampaignSubmissions");

const body = { title: "Business fixture", description: "Harmless business fixture", categoryId: 1, startDate: "2028-01-01", endDate: "2028-01-02" };
const actor = { id: 7, role: "business_owner" };

function fixture({ role = "business_owner", status = "active", session = true } = {}) {
  const calls = [];
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  const models = {
    sequelize: { transaction: async run => run(transaction) },
    User: { findByPk: async (id, options) => { calls.push(["account", options]); return { userId: id, role, status }; } },
    UserSession: { findOne: async options => { calls.push(["session", options]); return session ? { status: "active" } : null; } },
    Category: { findByPk: async () => ({ categoryId: 1, categoryName: "Community" }) },
    Business: { findOne: async () => ({ businessId: 9 }) },
    Campaign: { create: async (values, options) => { calls.push(["create", values, options]); return { campaignId: 3, createdAt: new Date(), updatedAt: new Date(), ...values }; } },
  };
  const service = createBusinessCampaignSubmissionService(models, {
    attachImage: async (...args) => calls.push(["attach", ...args]),
    buildImageUrl: async () => "/unit-private-photo",
  });
  return { service, calls, transaction };
}

test("dedicated business submission retains the shared transaction and photo attachment", async () => {
  const { service, calls, transaction } = fixture();
  const imageId = `img_${"a".repeat(48)}`;
  const result = await service.submit({ ...body, imageId }, actor, "unit-session");
  assert.equal(result.campaign.type, "business");
  assert.equal(result.campaign.status, "pending");
  assert.equal(result.campaign.businessId, 9);
  assert.equal(result.campaign.imageUrl, "/unit-private-photo");
  assert.deepEqual(calls.find(([name]) => name === "attach"), ["attach", imageId, 3, 7, transaction]);
  assert.equal(calls.find(([name]) => name === "create")[2].transaction, transaction);
});

test("dedicated submission rejects other roles before persistence", async () => {
  for (const role of ["public", "admin", undefined]) {
    const { service, calls } = fixture();
    await assert.rejects(service.submit(body, { ...actor, role }, "unit-session"), error => error.status === 403);
    assert.deepEqual(calls, []);
  }
});

test("a role change, suspension or revoked session cannot slip between guard and business write", async () => {
  for (const [options, expected] of [[{ role: "public" }, 403], [{ status: "suspended" }, 403], [{ session: false }, 401]]) {
    const { service, calls } = fixture(options);
    await assert.rejects(service.submit(body, actor, "unit-session"), error => error.status === expected);
    assert.equal(calls.some(([name]) => name === "create" || name === "attach"), false);
  }
});
