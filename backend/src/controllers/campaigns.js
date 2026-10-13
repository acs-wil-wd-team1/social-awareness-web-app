"use strict";

const { getCampaigns, campaignById  } = require("../services/campaignServices");
const { apiErrorResponse } = require("../utils/apiErrorResponse");
const models = require("../database/models");
const { createCampaignSubmissionService } = require("../services/campaignSubmission");
const { createCampaignQueryService } = require("../services/campaignQueries");
const { sendServiceError } = require("../utils/serviceError");
const { attachImage, buildImageUrl } = require("../services/campaignImages");
const submissionService = createCampaignSubmissionService(models, { attachImage, buildImageUrl });
const queryService = createCampaignQueryService(models, { buildImageUrl });

const getCampaignCategories = async (req, res) => {
  try {
    return res.status(200).json(await submissionService.listCategories());
  } catch {
    return apiErrorResponse(res, 500, "INTERNAL_SERVER_ERROR", "Something went wrong", null);
  }
};

const submitCampaign = async (req, res) => {
  try {
    return res.status(201).json(await submissionService.submit(req.body, req.user, req.token));
  } catch (err) {
    return sendServiceError(res, err);
  }
};

// Owner view: only campaigns created by the signed-in account, any status.
const getMyCampaigns = async (req, res) => {
  try {
    return res.status(200).json(await queryService.list(req.query, { createdBy: req.user.id, audience: "owner", currentUser: req.user, token: req.token }));
  } catch (err) {
    return sendServiceError(res, err);
  }
};

const getMyCampaignById = async (req, res) => {
  try {
    return res.status(200).json(await queryService.findById(req.params.id, { createdBy: req.user.id, audience: "owner", currentUser: req.user, token: req.token }));
  } catch (err) {
    return sendServiceError(res, err);
  }
};

const getPublicCampaigns = async (req, res) => {
  try {
    const result = await getCampaigns(req.query);

    return res.status(200).json(result);
  } catch (err) {
    return sendServiceError(res, err);
  }
};

const getPublicCampaignById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await campaignById(
      id,
      "approved"
    );

    return res.status(200).json(result);
  } catch (err) {
    return sendServiceError(res, err);
  }
};

module.exports = {
  getCampaignCategories,
  submitCampaign,
  getPublicCampaigns,
  getPublicCampaignById,
  getMyCampaigns,
  getMyCampaignById,
};
