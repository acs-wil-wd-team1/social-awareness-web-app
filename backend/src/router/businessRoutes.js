"use strict";

const express = require("express");
const { createCurrentAccountGuard } = require("../middleware/currentAccountAuthentication");
const { createBusinessProfileService } = require("../services/businessServices");
const { createBusinessProfileController } = require("../controllers/business");

function createBusinessProfileRouter(models, { service = createBusinessProfileService(models) } = {}) {
  const router = express.Router();
  const owner = createCurrentAccountGuard(models, {
    roles: ["business_owner"], forbiddenMessage: "Only active business owners can use a business profile",
  });
  const controller = createBusinessProfileController(service);
  router.get("/me", owner, controller.getMyProfile);
  router.put("/me", owner, controller.updateProfile);
  return router;
}

module.exports = createBusinessProfileRouter(require("../database/models"));
module.exports.createBusinessProfileRouter = createBusinessProfileRouter;
