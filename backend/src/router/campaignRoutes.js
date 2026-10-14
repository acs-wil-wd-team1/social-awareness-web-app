const express = require("express");
const router = express.Router();
const Controllers = require("../controllers");
const protected = require("../middleware/authentication")
const requireAdmin = require("../middleware/adminAuthentication")
const { User, UserSession } = require("../database/models");
const { createCampaignAuthorGuard } = require("../middleware/campaignAuthorAuthentication");
const requireCampaignAuthor = createCampaignAuthorGuard({ User, UserSession });

router.get("/categories", Controllers.campaignsController.getCampaignCategories);
router.post("/", requireCampaignAuthor, Controllers.campaignsController.submitCampaign);
router.post("/business", protected, Controllers.businessCampaignsController.createBusinessCampaigns);
router.get("/admin", protected, requireAdmin, Controllers.campaignsController.getAdminCampaigns);
router.get("/admin/:id", protected, requireAdmin, Controllers.campaignsController.getAdminCampaignById);
router.get("/", Controllers.campaignsController.getPublicCampaigns);
router.get("/:id", Controllers.campaignsController.getPublicCampaignById);

module.exports = router;
