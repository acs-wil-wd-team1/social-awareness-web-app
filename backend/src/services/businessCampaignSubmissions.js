"use strict";

const { Category, Campaign } = require("../database/models");
const {
  isBusinessOwner,
  businessProfile,
} = require("../services/businessServices");
const { validateCampaignInput } = require("../services/campaignSubmission");

const submitBusinessCampaigns = async (body, userId) => {
  await isBusinessOwner(userId);

  const business = await businessProfile(userId);

  if (!business) {
    const error = new Error("Business profile not found");
    error.status = 404;
    error.code = "BUSINESS_NOT_FOUND";
    throw error;
  }

  const values = validateCampaignInput(body);

  const category = await Category.findByPk(values.categoryId);

  if (!category) {
    const error = new Error("Choose an existing category");
    error.status = 422;
    error.code = "VALIDATION_FAILED";
    error.fieldErrors = {
      categoryId: "Choose an existing category",
    };
    throw error;
  }

  const campaign = await Campaign.create({
    ...values,
    createdBy: userId,
    businessId: business.businessId,
    imageUrl: null,
  });

  return {
    campaign: {
      id: campaign.campaignId,
      title: campaign.title,
      description: campaign.description,
      categoryId: campaign.categoryId,
      category: category.categoryName,
      type: "business",
      imageUrl: campaign.imageUrl,
      targetAudience: campaign.targetAudience,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      createdBy: campaign.createdBy,
      businessId: campaign.businessId,
      status: campaign.status,
      createdAt: campaign.createdAt,
    },
  };
};

module.exports = {
  submitBusinessCampaigns,
};
