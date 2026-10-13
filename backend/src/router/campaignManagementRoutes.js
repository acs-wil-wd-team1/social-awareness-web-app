"use strict";

const router = require("express").Router();
const { User, UserSession } = require("../database/models");
const { createCampaignAuthorGuard } = require("../middleware/campaignAuthorAuthentication");
const { createAdminGuard } = require("../middleware/adminAuthentication");
const controller = require("../controllers/campaignManagement");
const author = createCampaignAuthorGuard({ User, UserSession });
const admin = createAdminGuard({ User, UserSession });

// Mount at /api alongside the existing read/submission router.
router.patch("/campaigns/mine/:id", author, controller.editOwnedCampaign);
router.delete("/campaigns/mine/:id", author, controller.deleteOwnedCampaign);
router.get("/campaigns/admin/:id/reviews", admin, controller.getCampaignReviews);
router.patch("/campaigns/admin/:id/publication", admin, controller.unpublishCampaign);
router.delete("/campaigns/admin/:id", admin, controller.deleteAdminCampaign);
router.get("/admin/users", admin, controller.getAdminUsers);
router.patch("/admin/users/:id/status", admin, controller.updateUserStatus);

module.exports = router;
