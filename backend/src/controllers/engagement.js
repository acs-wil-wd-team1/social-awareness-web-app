"use strict";

const models = require("../database/models");
const { createEngagementService } = require("../services/engagement");
const { apiErrorResponse } = require("../utils/apiErrorResponse");
const service = createEngagementService(models);

function action(status, run) {
  return async (req, res) => {
    try {
      return res.status(status).json(await run(req));
    } catch (error) {
      if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 && error.code) {
        return apiErrorResponse(res, error.status, error.code, error.message, error.fieldErrors ?? null);
      }
      // SQL errors can contain private contact fields; never log their raw body.
      console.error("Engagement request failed", { code: "INTERNAL_SERVER_ERROR" });
      return apiErrorResponse(res, 500, "INTERNAL_SERVER_ERROR", "Something went wrong", null);
    }
  };
}

module.exports = {
  getParticipation: action(200, req => service.getParticipation(req.params.id, req.user, req.token)),
  setParticipation: action(200, req => service.setParticipation(req.params.id, req.body, req.user, req.token)),
  listParticipation: action(200, req => service.listParticipation(req.query, req.user, req.token)),
  sendEnquiry: action(201, req => service.sendEnquiry(req.params.id, req.body, req.user, req.token)),
  listBusinessEnquiries: action(200, req => service.listBusinessEnquiries(req.query, req.user, req.token)),
};
