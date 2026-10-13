"use strict";

const { getCampaigns, campaignById  } = require("../services/campaignServices");
const { apiErrorResponse } = require("../utils/apiErrorResponse");
const { Campaign, Category, Business, CampaignReview } = require("../database/models");
const { createCampaignSubmissionService } = require("../services/campaignSubmission");
const { createCampaignQueryService } = require("../services/campaignQueries");
const { sendServiceError } = require("../utils/serviceError");
const submissionService = createCampaignSubmissionService({ Campaign, Category, Business });
const queryService = createCampaignQueryService({ Campaign, Category, Business, CampaignReview });

const getCampaignCategories = async (req, res) => {
  try {
    return res.status(200).json(await submissionService.listCategories());
  } catch {
    return apiErrorResponse(res, 500, "INTERNAL_SERVER_ERROR", "Something went wrong", null);
  }
};

const submitCampaign = async (req, res) => {
  try {
    return res.status(201).json(await submissionService.submit(req.body, req.user));
  } catch (err) {
    return sendServiceError(res, err);
  }
};

// Owner view: only campaigns created by the signed-in account, any status.
const getMyCampaigns = async (req, res) => {
  try {
    return res.status(200).json(await queryService.list(req.query, { createdBy: req.user.id }));
  } catch (err) {
    return sendServiceError(res, err);
  }
};

const getMyCampaignById = async (req, res) => {
  try {
    return res.status(200).json(await queryService.findById(req.params.id, { createdBy: req.user.id }));
  } catch (err) {
    return sendServiceError(res, err);
  }
};

const getPublicCampaigns = async (req, res) => {
  try {
    const { page = 1, pageSize = 20, category, search } = req.query;

    const result = await getCampaigns({
      page,
      pageSize,
      category,
      search,
      status: "approved",
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error(err);

    return apiErrorResponse(
      res,
      500,
      "INTERNAL_SERVER_ERROR",
      "Something went wrong",
      null,
    );
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
    console.error(err);

    return apiErrorResponse(
      res,
      err.status || 500,
      err.code || "INTERNAL_SERVER_ERROR",
      err.message || "Something went wrong",
      err.fieldErrors ?? null
    );
  }
};

const getAdminCampaigns = async (req, res) => {
  try {
    const { page = 1, pageSize = 2, category, search, status } = req.query;

    const result = await getCampaigns({
      page,
      pageSize,
      category,
      search,
      status,
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error(err);

    return apiErrorResponse(
      res,
      500,
      "INTERNAL_SERVER_ERROR",
      "Something went wrong",
      null,
    );
  }
};

const getAdminCampaignById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await campaignById(
      id,
    );

    return res.status(200).json(result);
  } catch (err) {
    console.error(err);

    return apiErrorResponse(
      res,
      err.status || 500,
      err.code || "INTERNAL_SERVER_ERROR",
      err.message || "Something went wrong",
      err.fieldErrors ?? null
    );
  }
};

module.exports = {
  getCampaignCategories,
  submitCampaign,
  getPublicCampaigns,
  getPublicCampaignById,
  getMyCampaigns,
  getMyCampaignById,
  getAdminCampaigns,
  getAdminCampaignById,
};
