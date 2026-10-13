const express = require("express");
const router = express.Router();
const Controllers = require("../controllers");
const { User, UserSession } = require("../database/models");
const { createCampaignAuthorGuard } = require("../middleware/campaignAuthorAuthentication");
const { createAdminGuard } = require("../middleware/adminAuthentication");

const requireCampaignAuthor = createCampaignAuthorGuard({ User, UserSession });
const requireAdmin = createAdminGuard({ User, UserSession });
const campaigns = Controllers.campaignsContoller;
const admin = Controllers.adminCampaignsController;

// Literal paths must be registered before the public "/:id" route.
router.get("/categories", campaigns.getCampaignCategories);

router.post("/", requireCampaignAuthor, campaigns.submitCampaign);
router.get("/mine", requireCampaignAuthor, campaigns.getMyCampaigns);
router.get("/mine/:id", requireCampaignAuthor, campaigns.getMyCampaignById);

router.get("/admin", requireAdmin, admin.getAdminCampaigns);
router.get("/admin/:id", requireAdmin, admin.getAdminCampaignById);
router.patch("/admin/:id/status", requireAdmin, admin.reviewCampaign);

router.get("/", campaigns.getPublicCampaigns);
router.get("/:id", campaigns.getPublicCampaignById);

module.exports = router;
