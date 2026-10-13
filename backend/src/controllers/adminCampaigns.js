"use strict";

const { sequelize, Campaign, Category, Business, CampaignReview } = require("../database/models");
const { createCampaignQueryService } = require("../services/campaignQueries");
const { createCampaignModerationService } = require("../services/campaignModeration");
const { sendServiceError } = require("../utils/serviceError");

const queryService = createCampaignQueryService({ Campaign, Category, Business, CampaignReview });
const moderationService = createCampaignModerationService({ sequelize, Campaign, CampaignReview });

// Admins see every status, including pending submissions awaiting review.
const getAdminCampaigns = async (req, res) => {
  try {
    return res.status(200).json(await queryService.list(req.query));
  } catch (err) {
    return sendServiceError(res, err);
  }
};

const getAdminCampaignById = async (req, res) => {
  try {
    return res.status(200).json(await queryService.findById(req.params.id));
  } catch (err) {
    return sendServiceError(res, err);
  }
};

const reviewCampaign = async (req, res) => {
  try {
    return res.status(200).json(await moderationService.review(req.params.id, req.body, req.user));
  } catch (err) {
    return sendServiceError(res, err);
  }
};

module.exports = {
  getAdminCampaigns,
  getAdminCampaignById,
  reviewCampaign,
};
