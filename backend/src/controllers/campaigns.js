"use strict";

const { getCampaigns, campaignById  } = require("../services/campaignServices");
const { apiErrorResponse } = require("../utils/apiErrorResponse");

const getPublicCampaigns = async (req, res) => {
  try {
    const { page = 1, pageSize = 2, category, search } = req.query;

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
  getPublicCampaigns,
  getPublicCampaignById,
  getAdminCampaigns,
  getAdminCampaignById
};
