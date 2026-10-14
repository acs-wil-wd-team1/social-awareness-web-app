"use strict";

const { Op } = require("sequelize");
const { serializeCampaign } = require("../utils/campaignSerializer");
const { serviceError, validationError } = require("../utils/serviceError");

const STATUSES = ["pending", "approved", "rejected"];
const MAX_PAGE_SIZE = 100;

function positiveInteger(value) {
  return typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2147483647;
}

function parseCampaignId(id) {
  if (!positiveInteger(String(id))) {
    throw serviceError(400, "INVALID_CAMPAIGN_ID", "Invalid campaign ID", { id: "Campaign ID must be a positive integer" });
  }
  return Number(id);
}

// Owner/admin list filters; unknown query keys are ignored.
function parseListQuery(query = {}) {
  const errors = {};
  const pick = (key) => (Array.isArray(query[key]) ? null : query[key]);
  const filters = { page: 1, pageSize: 20 };

  for (const key of ["page", "pageSize", "category"]) {
    const value = pick(key);
    if (value === undefined || value === "") continue;
    if (!positiveInteger(value)) errors[key] = `${key} must be a positive integer`;
    else filters[key] = Number(value);
  }
  if (filters.pageSize > MAX_PAGE_SIZE) errors.pageSize = `pageSize must be ${MAX_PAGE_SIZE} or fewer`;

  const status = pick("status");
  if (status !== undefined && status !== "") {
    if (!STATUSES.includes(status)) errors.status = `status must be one of ${STATUSES.join(", ")}`;
    else filters.status = status;
  }

  const search = pick("search");
  if (search === null) errors.search = "search must be a single value";
  else if (search !== undefined && typeof search !== "string") errors.search = "search must be text";
  else if (typeof search === "string" && search.trim().length > 150) errors.search = "Use 150 characters or fewer";
  else if (typeof search === "string" && search.trim()) filters.search = search.trim();

  if (Object.keys(errors).length) throw validationError(errors, "Query parameters are invalid");
  return filters;
}

function createCampaignQueryService({ Campaign, Category, Business, CampaignReview }, { buildImageUrl } = {}) {
  const include = [
    { model: Category, as: "category", attributes: ["categoryName"] },
    { model: Business, as: "business", attributes: ["businessId", "businessName", "website"] },
  ];

  // Latest review per campaign, newest reviewedAt first and then highest reviewId.
  async function latestReviews(campaignIds, options = {}) {
    if (!campaignIds.length) return new Map();
    const reviews = await CampaignReview.findAll({
      where: { campaignId: { [Op.in]: campaignIds } },
      order: [["reviewedAt", "DESC"], ["reviewId", "DESC"]],
      ...options,
    });
    const latest = new Map();
    for (const review of reviews) if (!latest.has(review.campaignId)) latest.set(review.campaignId, review);
    return latest;
  }

  return {
    async list(query, { createdBy, audience = "admin", currentUser, token } = {}) {
      const { page, pageSize, status, category, search } = parseListQuery(query);
      const where = { deletedAt: null };
      if (createdBy !== undefined) where.createdBy = createdBy;
      if (audience === "public") where.status = "approved";
      else if (status) where.status = status;
      if (category) where.categoryId = category;
      if (search) where.title = { [Op.like]: `%${search.replace(/[\\%_]/g, "\\$&")}%` };

      const { rows, count } = await Campaign.findAndCountAll({
        where,
        include,
        order: [["createdAt", "DESC"], ["campaignId", "DESC"]],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        distinct: true,
      });
      const reviews = audience === "public" ? new Map() : await latestReviews(rows.map((row) => row.campaignId));

      return {
        campaigns: await Promise.all(rows.map(async (row) => serializeCampaign(row, {
          review: reviews.get(row.campaignId), publicView: audience === "public",
          imageUrl: buildImageUrl ? await buildImageUrl(row.campaignId, { audience, currentUser, token }) ?? row.imageUrl ?? null : row.imageUrl ?? null,
        }))),
        page,
        pageSize,
        total: count,
      };
    },

    async findById(id, { createdBy, audience = "admin", currentUser, token } = {}) {
      const where = { campaignId: parseCampaignId(id), deletedAt: null };
      if (createdBy !== undefined) where.createdBy = createdBy;
      if (audience === "public") where.status = "approved";

      const campaign = await Campaign.findOne({ where, include });
      if (!campaign) throw serviceError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found");

      const reviews = audience === "public" ? new Map() : await latestReviews([campaign.campaignId]);
      return serializeCampaign(campaign, {
        review: reviews.get(campaign.campaignId), publicView: audience === "public",
        imageUrl: buildImageUrl ? await buildImageUrl(campaign.campaignId, { audience, currentUser, token }) ?? campaign.imageUrl ?? null : campaign.imageUrl ?? null,
      });
    },
  };
}

module.exports = { createCampaignQueryService, parseListQuery, parseCampaignId, STATUSES };
