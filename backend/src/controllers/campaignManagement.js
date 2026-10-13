"use strict";

const models = require("../database/models");
const { createOwnerCampaignManagementService } = require("../services/ownerCampaignManagement");
const { createAdminManagementService } = require("../services/adminManagement");
const { applyCampaignImageChange, buildImageUrl } = require("../services/campaignImages");
const { sendServiceError } = require("../utils/serviceError");
const owner = createOwnerCampaignManagementService(models, { applyCampaignImageChange });
const admin = createAdminManagementService(models);

const handle = (action, status = 200) => async (req, res) => {
  try {
    const result = await action(req);
    return status === 204 ? res.status(204).end() : res.status(status).json(result);
  } catch (error) { return sendServiceError(res, error); }
};

module.exports = {
  editOwnedCampaign: handle(async (req) => {
    const result = await owner.edit(req.params.id, req.body, req.user, req.token);
    result.campaign.imageUrl = await buildImageUrl(result.campaign.id, { audience: "owner", currentUser: req.user, token: req.token }) ?? result.campaign.imageUrl;
    return result;
  }),
  deleteOwnedCampaign: handle((req) => owner.remove(req.params.id, req.body, req.user, req.token), 204),
  getCampaignReviews: handle((req) => admin.reviews(req.params.id, req.query, req.user, req.token)),
  unpublishCampaign: handle((req) => admin.unpublish(req.params.id, req.body, req.user, req.token)),
  deleteAdminCampaign: handle((req) => admin.remove(req.params.id, req.body, req.user, req.token), 204),
  getAdminUsers: handle((req) => admin.users(req.query, req.user, req.token)),
  updateUserStatus: handle((req) => admin.changeUserStatus(req.params.id, req.body, req.user, req.token)),
};
