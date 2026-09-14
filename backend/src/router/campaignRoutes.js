const express = require("express");
const router = express.Router();
const Controllers = require("../controllers");
const protected = require("../middleware/authentication")
const requireAdmin = require("../middleware/adminAuthentication")

router.get("/admin", protected, requireAdmin, Controllers.campaignsContoller.getAdminCampaigns);
router.get("/admin/:id", protected, requireAdmin, Controllers.campaignsContoller.getAdminCampaignById);
router.get("/", Controllers.campaignsContoller.getPublicCampaigns);
router.get("/:id", Controllers.campaignsContoller.getPublicCampaignById);

module.exports = router;