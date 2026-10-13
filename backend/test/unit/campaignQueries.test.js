"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseListQuery, createCampaignQueryService } = require("../../src/services/campaignQueries");

test("list query applies defaults and validates recognised filters", () => {
  assert.deepEqual(parseListQuery({}), { page: 1, pageSize: 20 });
  assert.deepEqual(parseListQuery({ page: "2", pageSize: "10", status: "pending", category: "3", search: "  garden ", other: "x" }),
    { page: 2, pageSize: 10, status: "pending", category: 3, search: "garden" });
  for (const [key, value] of [["page", "0"], ["pageSize", "101"], ["pageSize", "1.5"], ["category", "-1"], ["status", "deleted"], ["search", ["a", "b"]]]) {
    assert.throws(() => parseListQuery({ [key]: value }), (err) => err.status === 422 && Boolean(err.fieldErrors[key]));
  }
});

test("owner reads are scoped by creator and include the latest review", async () => {
  let listQuery;
  let detailWhere;
  const row = {
    campaignId: 5, title: "Garden", description: null, categoryId: 1, category: { categoryName: "Environment" },
    businessId: null, createdBy: 3, status: "rejected",
    createdAt: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-02T00:00:00.500Z"),
  };
  const service = createCampaignQueryService({
    Category: {}, Business: {},
    Campaign: {
      findAndCountAll: async (query) => { listQuery = query; return { rows: [row], count: 1 }; },
      findOne: async ({ where }) => { detailWhere = where; return where.createdBy === 3 ? row : null; },
    },
    CampaignReview: {
      findAll: async () => [
        { reviewId: 8, campaignId: 5, adminId: 1, action: "rejected", comments: "Newest", reviewedAt: new Date("2026-10-02T00:00:00Z") },
        { reviewId: 2, campaignId: 5, adminId: 1, action: "rejected", comments: "Older", reviewedAt: new Date("2026-10-01T00:00:00Z") },
      ],
    },
  });

  const page = await service.list({ status: "rejected" }, { createdBy: 3 });
  assert.deepEqual(listQuery.where, { createdBy: 3, status: "rejected", deletedAt: null });
  assert.equal(page.total, 1);
  assert.equal(page.campaigns[0].description, "");
  assert.equal(page.campaigns[0].type, "cause");
  assert.equal(page.campaigns[0].updatedAt, "2026-10-02T00:00:00.500Z");
  assert.equal(page.campaigns[0].review.comments, "Newest");

  assert.equal((await service.findById("5", { createdBy: 3 })).id, 5);
  assert.deepEqual(detailWhere, { campaignId: 5, createdBy: 3, deletedAt: null });
  await assert.rejects(service.findById("5", { createdBy: 4 }), (err) => err.status === 404);
});
