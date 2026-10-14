"use strict";

const { getBusinessProfile, saveBusinessProfile } = require("../services/businessServices");
const { sendServiceError } = require("../utils/serviceError");

function createBusinessProfileController(service) {
  const handle = (action) => async (req, res) => {
    try { return res.status(200).json(await action(req)); }
    catch (error) { return sendServiceError(res, error); }
  };
  return {
    getMyProfile: handle((req) => service.get(req.user, req.token)),
    updateProfile: handle((req) => service.save(req.body, req.user, req.token)),
  };
}

module.exports = {
  ...createBusinessProfileController({ get: getBusinessProfile, save: saveBusinessProfile }),
  createBusinessProfileController,
};
