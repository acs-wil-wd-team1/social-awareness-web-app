"use strict";

const models = require("../database/models");
const { createCampaignQueryService } = require("../services/campaignQueries");
const { createCampaignModerationService } = require("../services/campaignModeration");
const { sendServiceError } = require("../utils/serviceError");
const { buildImageUrl } = require("../services/campaignImages");

const queryService = createCampaignQueryService(models, { buildImageUrl });
const moderationService = createCampaignModerationService(models);

// Admins see every status, including pending submissions awaiting review.
const getAdminCampaigns = async (req, res) => {
  try {
    return res.status(200).json(await queryService.list(req.query, { audience: "admin", currentUser: req.user, token: req.token }));
  } catch (err) {
    return sendServiceError(res, err);
  }
};

const getAdminCampaignById = async (req, res) => {
  try {
    return res.status(200).json(await queryService.findById(req.params.id, { audience: "admin", currentUser: req.user, token: req.token }));
  } catch (err) {
    return sendServiceError(res, err);
  }
};

const reviewCampaign = async (req, res) => {
  try {
    return res.status(200).json(await moderationService.review(req.params.id, req.body, req.user, req.token));
  } catch (err) {
    return sendServiceError(res, err);
  }
};

module.exports = {
  getAdminCampaigns,
  getAdminCampaignById,
  reviewCampaign,
};
