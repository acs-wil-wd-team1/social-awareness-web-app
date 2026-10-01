"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateCampaignInput, createCampaignSubmissionService } = require("../../src/services/campaignSubmission");

const valid = {
  title: "  Community garden  ", description: "  Help plant a shared garden.  ",
  categoryId: 3, startDate: "2028-02-29", endDate: "2028-03-01",
};

function invalid(body, field) {
  assert.throws(() => validateCampaignInput(body), (err) => (
    err.status === 422 && err.code === "VALIDATION_FAILED" && Boolean(err.fieldErrors[field])
  ));
}

test("campaign input trims content and normalizes optional audience", () => {
  assert.deepEqual(validateCampaignInput(valid), {
    title: "Community garden", description: "Help plant a shared garden.",
    categoryId: 3, startDate: "2028-02-29", endDate: "2028-03-01", targetAudience: null,
  });
  for (const value of [null, "", "   "]) assert.equal(validateCampaignInput({ ...valid, targetAudience: value }).targetAudience, null);
  assert.equal(validateCampaignInput({ ...valid, targetAudience: " Neighbours " }).targetAudience, "Neighbours");
});

test("rejects absent, non-object, missing, whitespace and wrongly typed fields", () => {
  for (const body of [undefined, null, [], "text", 4, true]) invalid(body, "body");
  for (const field of ["title", "description", "categoryId", "startDate", "endDate"]) {
    const body = { ...valid }; delete body[field]; invalid(body, field);
  }
  for (const field of ["title", "description"]) {
    for (const value of ["   ", 2, [], {}]) invalid({ ...valid, [field]: value }, field);
  }
  for (const value of ["3", 0, -1, 1.5, NaN, Infinity, 2147483648]) invalid({ ...valid, categoryId: value }, "categoryId");
  invalid({ ...valid, targetAudience: 2 }, "targetAudience");
});

test("enforces text boundaries after trimming", () => {
  for (const [field, maximum] of [["title", 150], ["description", 5000], ["targetAudience", 255]]) {
    assert.equal(validateCampaignInput({ ...valid, [field]: ` ${"x".repeat(maximum)} ` })[field].length, maximum);
    invalid({ ...valid, [field]: "x".repeat(maximum + 1) }, field);
  }
});

test("requires real MySQL-range dates and ordered date ranges", () => {
  for (const value of ["2026-02-29", "2026-04-31", "0999-12-31", "0000-00-00", "10000-01-01", "2026-1-01", "2026-01-01T00:00:00Z", null, 20261010]) {
    invalid({ ...valid, startDate: value }, "startDate");
  }
  invalid({ ...valid, endDate: "2028-02-28" }, "endDate");
  assert.equal(validateCampaignInput({ ...valid, endDate: valid.startDate }).endDate, valid.startDate);
  assert.equal(validateCampaignInput({ ...valid, startDate: "1000-01-01", endDate: "9999-12-31" }).startDate, "1000-01-01");
});

test("rejects all client ownership, status, image and unknown fields", () => {
  for (const field of ["createdBy", "created_by", "businessId", "type", "status", "imageUrl", "imageId", "role", "constructor", "unknown"]) {
    invalid({ ...valid, [field]: "client-value" }, field);
  }
  invalid(JSON.parse(JSON.stringify(valid).replace(/}$/, ',"__proto__":"bad"}')), "__proto__");
});

test("category lookup maps only public fields and requests a stable order", async () => {
  let options;
  const service = createCampaignSubmissionService({
    Category: { findAll: async (query) => { options = query; return [{ categoryId: 2, categoryName: "Education", description: "not returned" }]; } },
    Campaign: {},
  });
  assert.deepEqual(await service.listCategories(), { categories: [{ id: 2, name: "Education" }] });
  assert.deepEqual(options.order, [["categoryName", "ASC"], ["categoryId", "ASC"]]);
});

test("submission validates category and server-owned campaign fields", async () => {
  let saved;
  const service = createCampaignSubmissionService({
    Category: { findByPk: async (id) => id === 3 ? { categoryName: "Community Support" } : null },
    Campaign: { create: async (row) => { saved = row; return { ...row, campaignId: 25, createdAt: new Date("2026-09-28T01:00:00Z") }; } },
  });
  const result = await service.submit(valid, { id: 7 });
  assert.equal(saved.createdBy, 7);
  assert.equal(saved.status, "pending");
  assert.equal(saved.businessId, null);
  assert.equal(saved.imageUrl, null);
  assert.equal(result.campaign.id, 25);
  assert.equal(result.campaign.type, "cause");
  assert.equal(result.campaign.category, "Community Support");
  saved = null;
  await assert.rejects(service.submit({ ...valid, categoryId: 99 }, { id: 7 }), (err) => err.status === 422 && Boolean(err.fieldErrors.categoryId));
  assert.equal(saved, null);
});
