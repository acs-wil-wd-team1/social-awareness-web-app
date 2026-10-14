const express = require("express");
const router = express.Router();
const Controllers = require("../controllers");

const protect = require("../middleware/authentication")

router.get("/me", protect, Controllers.businessController.getMyProfile)
router.put("/me", protect, Controllers.businessController.updateProfile)

module.exports = router;