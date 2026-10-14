"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateReviewInput, createCampaignModerationService } = require("../../src/services/campaignModeration");

const version = "2026-10-01T05:00:00.123Z";

function invalid(body, field) {
  assert.throws(() => validateReviewInput(body), (err) => (
    err.status === 422 && err.code === "VALIDATION_FAILED" && Boolean(err.fieldErrors[field])
  ));
}

test("review input accepts approvals with optional comments and trims rejection reasons", () => {
  assert.deepEqual(validateReviewInput({ status: "approved", expectedUpdatedAt: version }),
    { status: "approved", comments: null, expectedUpdatedAt: version });
  assert.equal(validateReviewInput({ status: "approved", comments: "   ", expectedUpdatedAt: version }).comments, null);
  assert.equal(validateReviewInput({ status: "rejected", comments: "  Add a location ", expectedUpdatedAt: version }).comments, "Add a location");
});

test("review input rejects bad decisions, reasons, versions and client-owned fields", () => {
  for (const body of [undefined, null, [], "approved"]) invalid(body, "body");
  for (const status of [undefined, "pending", "APPROVED", 1]) invalid({ status, expectedUpdatedAt: version }, "status");
  invalid({ status: "rejected", expectedUpdatedAt: version }, "comments");
  invalid({ status: "rejected", comments: "  ", expectedUpdatedAt: version }, "comments");
  invalid({ status: "approved", comments: 4, expectedUpdatedAt: version }, "comments");
  invalid({ status: "rejected", comments: "x".repeat(2001), expectedUpdatedAt: version }, "comments");
  for (const value of [undefined, "", "2026-10-01", "2026-10-01T05:00:00Z", "2026-02-30T05:00:00.000Z", 1700000000000]) {
    invalid({ status: "approved", expectedUpdatedAt: value }, "expectedUpdatedAt");
  }
  for (const field of ["adminId", "campaignId", "reviewedAt"]) {
    invalid({ status: "approved", expectedUpdatedAt: version, [field]: 1 }, field);
  }
});

function fakeModels({ campaign, updatedRows = 1 }) {
  const calls = { updates: [], reviews: [] };
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  return {
    calls,
    sequelize: { transaction: async (work) => work(transaction) },
    Campaign: {
      findByPk: async (id, options) => { calls.lock = options.lock; return campaign && campaign.campaignId === id ? campaign : null; },
      update: async (values, options) => { calls.updates.push({ values, options }); return [updatedRows]; },
    },
    CampaignReview: {
      create: async (row) => { calls.reviews.push(row); return { ...row, reviewId: 4 }; },
    },
  };
}

test("approves a pending campaign once, locks the row and advances the version", async () => {
  const models = fakeModels({ campaign: { campaignId: 9, status: "pending", updatedAt: new Date(version) } });
  const result = await createCampaignModerationService(models)
    .review("9", { status: "rejected", comments: "Needs a date", expectedUpdatedAt: version }, { id: 1 });

  assert.equal(models.calls.lock, "UPDATE");
  assert.deepEqual(models.calls.updates[0].options.where, { campaignId: 9, status: "pending" });
  assert.equal(models.calls.updates[0].options.silent, true);
  assert.equal(models.calls.reviews.length, 1);
  assert.equal(models.calls.reviews[0].adminId, 1);
  assert.equal(result.campaign.status, "rejected");
  assert.ok(Date.parse(result.campaign.updatedAt) > Date.parse(version));
  assert.deepEqual(result.review, {
    id: 4, campaignId: 9, adminId: 1, action: "rejected", comments: "Needs a date", reviewedAt: new Date(Math.floor(Date.parse(result.campaign.updatedAt) / 1000) * 1000).toISOString(),
  });
});

test("returns conflicts without writing a review", async () => {
  const cases = [
    [{ campaignId: 9, status: "approved", updatedAt: new Date(version) }, 1, 409, "CAMPAIGN_ALREADY_REVIEWED"],
    [{ campaignId: 9, status: "pending", updatedAt: new Date("2026-10-01T05:00:00.124Z") }, 1, 409, "CAMPAIGN_CHANGED"],
    [{ campaignId: 9, status: "pending", updatedAt: new Date(version) }, 0, 409, "CAMPAIGN_ALREADY_REVIEWED"],
    [null, 1, 404, "CAMPAIGN_NOT_FOUND"],
    [{ campaignId: 9, status: "pending", updatedAt: new Date(version), deletedAt: new Date(version) }, 1, 404, "CAMPAIGN_NOT_FOUND"],
  ];
  for (const [campaign, updatedRows, status, code] of cases) {
    const models = fakeModels({ campaign, updatedRows });
    await assert.rejects(
      createCampaignModerationService(models).review(9, { status: "approved", expectedUpdatedAt: version }, { id: 1 }),
      (err) => err.status === status && err.code === code,
    );
    assert.equal(models.calls.reviews.length, 0);
  }
  await assert.rejects(
    createCampaignModerationService(fakeModels({})).review("abc", { status: "approved", expectedUpdatedAt: version }, { id: 1 }),
    (err) => err.status === 400 && err.code === "INVALID_CAMPAIGN_ID",
  );
});
