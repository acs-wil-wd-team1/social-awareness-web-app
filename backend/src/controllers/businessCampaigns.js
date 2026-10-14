"use strict";

const {
  submitBusinessCampaigns,
} = require("../services/businessCampaignSubmissions");
const { apiErrorResponse } = require("../utils/apiErrorResponse");

const createBusinessCampaigns = async (req, res) => {
  try {
    const result = await submitBusinessCampaigns(req.body, req.user.id);

    return res.status(201).json(result);
  } catch (err) {
    console.error(err);
    return apiErrorResponse(
      res,
      err.status || 500,
      err.code || "INTERNAL_SERVER_ERROR",
      err.status ? err.message : "Something went wrong",
      err.fieldErrors ?? null,
    );
  }
};

module.exports = {
    createBusinessCampaigns,
}
