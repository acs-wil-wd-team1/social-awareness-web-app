"use strict";

const router = require("express").Router();
const { User, UserSession } = require("../database/models");
const { createCurrentAccountGuard } = require("../middleware/currentAccountAuthentication");
const controller = require("../controllers/engagement");

const requireParticipant = createCurrentAccountGuard({ User, UserSession }, { roles: ["public", "business_owner"] });
const requireBusiness = createCurrentAccountGuard({ User, UserSession }, { roles: ["business_owner"] });
const privateResponse = (req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); };

// Mount at /api before campaignRoutes. These are exact subroutes, not an ID catch-all.
router.get("/campaigns/:id/participation", privateResponse, requireParticipant, controller.getParticipation);
router.put("/campaigns/:id/participation", privateResponse, requireParticipant, controller.setParticipation);
router.get("/participations/mine", privateResponse, requireParticipant, controller.listParticipation);
router.post("/campaigns/:id/enquiries", privateResponse, requireParticipant, controller.sendEnquiry);
router.get("/business/me/enquiries", privateResponse, requireBusiness, controller.listBusinessEnquiries);

module.exports = router;
