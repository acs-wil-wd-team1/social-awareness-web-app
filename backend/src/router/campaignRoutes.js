const express = require("express");
const router = express.Router();
const Controllers = require("../controllers");
const protected = require("../middleware/authentication")

router.get("/public", Controllers.campaignsContoller.getGuestCampaigns)
router.get("/", protected, Controllers.campaignsContoller.getCampaigns);

module.exports = router;