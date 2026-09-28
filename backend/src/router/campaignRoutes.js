const express = require("express");
const router = express.Router();
const Controllers = require("../controllers");
const protected = require("../middleware/authentication")
const requireAdmin = require("../middleware/adminAuthentication")
const { User, UserSession } = require("../database/models");
const { createCampaignAuthorGuard } = require("../middleware/campaignAuthorAuthentication");
const requireCampaignAuthor = createCampaignAuthorGuard({ User, UserSession });

router.get("/categories", Controllers.campaignsContoller.getCampaignCategories);
router.post("/", requireCampaignAuthor, Controllers.campaignsContoller.submitCampaign);
router.get("/admin", protected, requireAdmin, Controllers.campaignsContoller.getAdminCampaigns);
router.get("/admin/:id", protected, requireAdmin, Controllers.campaignsContoller.getAdminCampaignById);
router.get("/", Controllers.campaignsContoller.getPublicCampaigns);
router.get("/:id", Controllers.campaignsContoller.getPublicCampaignById);

module.exports = router;
