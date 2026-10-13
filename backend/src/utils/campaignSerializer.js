"use strict";

const toIso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);

function serializeReview(review) {
  if (!review) return null;
  return {
    id: review.reviewId,
    campaignId: review.campaignId,
    adminId: review.adminId,
    action: review.action,
    comments: review.comments ?? null,
    reviewedAt: toIso(review.reviewedAt),
  };
}

// Owner/admin campaign object as described in docs/api/campaign-read-contract.md.
function serializeCampaign(campaign, { review = null, imageUrl = campaign.imageUrl ?? null, publicView = false } = {}) {
  const business = campaign.business;
  return {
    id: campaign.campaignId,
    title: campaign.title,
    description: campaign.description ?? "",
    categoryId: campaign.categoryId,
    category: campaign.category?.categoryName ?? null,
    type: campaign.businessId == null ? "cause" : "business",
    imageUrl,
    targetAudience: campaign.targetAudience ?? null,
    startDate: campaign.startDate ?? null,
    endDate: campaign.endDate ?? null,
    createdBy: campaign.createdBy,
    businessId: campaign.businessId ?? null,
    business: business
      ? { id: business.businessId, businessName: business.businessName, website: business.website ?? null }
      : null,
    status: campaign.status,
    createdAt: toIso(campaign.createdAt),
    updatedAt: toIso(campaign.updatedAt),
    ...(!publicView ? { review: serializeReview(review) } : {}),
  };
}

module.exports = { serializeCampaign, serializeReview, toIso };
