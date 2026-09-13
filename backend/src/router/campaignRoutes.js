const express = require("express");
const router = express.Router();
const Controllers = require("../controllers");


router.get("/", Controllers.campaignsContoller.getCampaigns);

module.exports = router;