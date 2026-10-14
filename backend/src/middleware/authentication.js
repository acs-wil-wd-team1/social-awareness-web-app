"use strict";

const jwt = require("jsonwebtoken");

function sendLogoutError(res, status, code, message, error = message) {
  // Keep the existing error field for older logout callers, alongside the
  // typed envelope used by the frontend. Never include tokens or raw errors.
  return res.status(status).json({ error, status, code, message, fieldErrors: null });
}

function createLogoutGuard({ UserSession }, { verify = jwt.verify, getSecret = () => process.env.JWT_SECRET } = {}) {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    const match = typeof header === "string" && /^Bearer ([^\s]+)$/i.exec(header);
    if (!match) {
      return sendLogoutError(res, 401, "INVALID_TOKEN", "A valid Bearer token is required", "Access denied");
    }

    let user;
    try {
      const secret = getSecret();
      if (!secret) return sendLogoutError(res, 500, "INTERNAL_SERVER_ERROR", "Something went wrong");
      user = verify(match[1], secret);
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        return sendLogoutError(res, 401, "INVALID_TOKEN", "Your session is invalid or has expired", "Invalid token");
      }
      return sendLogoutError(res, 500, "INTERNAL_SERVER_ERROR", "Something went wrong");
    }
    if (!Number.isSafeInteger(user?.id) || user.id < 1) {
      return sendLogoutError(res, 401, "INVALID_TOKEN", "Your session is invalid or has expired", "Invalid token");
    }

    try {
      const session = await UserSession.findOne({
        where: { token: match[1], userId: user.id, status: "active" },
        logging: false,
      });
      if (!session) {
        return sendLogoutError(res, 401, "INVALID_TOKEN", "Session expired or logged out");
      }
    } catch {
      // An unavailable session store is not proof that a token was revoked.
      return sendLogoutError(res, 503, "SERVICE_UNAVAILABLE", "Your server session could not be checked. Please try again.", "Service unavailable");
    }

    req.user = user;
    req.token = match[1];
    return next();
  };
}

let defaultGuard;
function verifyToken(req, res, next) {
  if (!defaultGuard) defaultGuard = createLogoutGuard(require("../database/models"));
  return defaultGuard(req, res, next);
}

module.exports = verifyToken;
module.exports.createLogoutGuard = createLogoutGuard;
