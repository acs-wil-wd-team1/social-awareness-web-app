"use strict";

const models = require("../database/models");
const { createBusinessCampaignSubmissionService } = require("../services/businessCampaignSubmissions");
const { attachImage, buildImageUrl } = require("../services/campaignImages");
const { sendServiceError } = require("../utils/serviceError");
const service = createBusinessCampaignSubmissionService(models, { attachImage, buildImageUrl });

const createBusinessCampaigns = async (req, res) => {
  try {
    const result = await service.submit(req.body, req.user, req.token);

    return res.status(201).json(result);
  } catch (err) {
    return sendServiceError(res, err);
  }
};

module.exports = {
    createBusinessCampaigns,
}
