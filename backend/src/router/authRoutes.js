const express = require("express");
const router = express.Router();
const Controllers = require("../controllers");

const protect = require("../middleware/authentication")

router.get("/", Controllers.authController.getUsers);
router.post("/register", Controllers.authController.registration);
router.post("/login", Controllers.authController.login)
router.put("/logout", protect, Controllers.authController.logout);

module.exports = router;