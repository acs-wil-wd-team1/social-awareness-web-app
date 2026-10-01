"use strict";

const jwt = require("jsonwebtoken");
const { apiErrorResponse } = require("../utils/apiErrorResponse");

// Creation checks the current database account, not role/status claims in an old JWT.
function createCampaignAuthorGuard({ User, UserSession }) {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    const match = typeof header === "string" && /^Bearer ([^\s]+)$/i.exec(header);
    if (!match) return apiErrorResponse(res, 401, "INVALID_TOKEN", "A valid Bearer token is required", null);

    if (!process.env.JWT_SECRET) {
      return apiErrorResponse(res, 500, "INTERNAL_SERVER_ERROR", "Something went wrong", null);
    }

    let claims;
    try {
      claims = jwt.verify(match[1], process.env.JWT_SECRET);
    } catch {
      return apiErrorResponse(res, 401, "INVALID_TOKEN", "Your session is invalid or has expired", null);
    }
    if (!Number.isSafeInteger(claims?.id) || claims.id < 1) {
      return apiErrorResponse(res, 401, "INVALID_TOKEN", "Your session is invalid or has expired", null);
    }

    try {
      const session = await UserSession.findOne({
        where: { token: match[1], userId: claims.id, status: "active" },
      });
      if (!session) return apiErrorResponse(res, 401, "INVALID_TOKEN", "Session expired or logged out", null);

      const user = await User.findByPk(claims.id);
      if (!user) return apiErrorResponse(res, 401, "INVALID_TOKEN", "Your account is unavailable", null);
      if (user.status !== "active") {
        return apiErrorResponse(res, 403, "ACCOUNT_SUSPENDED", "Account is suspended", null);
      }
      if (user.role !== "public") {
        return apiErrorResponse(res, 403, "FORBIDDEN", "Campaign submission currently supports public accounts only", null);
      }

      req.user = { id: user.userId, role: user.role, status: user.status };
      req.token = match[1];
      return next();
    } catch {
      return apiErrorResponse(res, 500, "INTERNAL_SERVER_ERROR", "Something went wrong", null);
    }
  };
}

module.exports = { createCampaignAuthorGuard };
