"use strict";

const { serviceError, validationError } = require("../utils/serviceError");
const { isCanonicalTimestamp } = require("./campaignModeration");
const { toIso } = require("../utils/campaignSerializer");

function validateBody(body, allowed) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw validationError({ body: "Send a JSON object" });
  const errors = Object.create(null);
  for (const key of Object.keys(body)) if (!allowed.includes(key)) errors[key] = "This field is not accepted";
  if (Object.keys(errors).length) throw validationError(errors);
}

function validateVersion(body) {
  if (!isCanonicalTimestamp(body.expectedUpdatedAt)) throw validationError({ expectedUpdatedAt: "Send the campaign's current updatedAt value" });
  return body.expectedUpdatedAt;
}

function validateReason(body) {
  if (typeof body.reason !== "string" || !body.reason.trim() || body.reason.trim().length > 2000) {
    throw validationError({ reason: "A reason of 1 to 2000 characters is required" });
  }
  return body.reason.trim();
}

function checkVersion(campaign, expectedUpdatedAt) {
  if (toIso(campaign.updatedAt) !== expectedUpdatedAt) throw serviceError(409, "CAMPAIGN_CHANGED", "This campaign changed after it was loaded. Reload and try again");
}

function nextVersion(previous) {
  return new Date(Math.max(Date.now(), new Date(previous).getTime() + 1));
}

// Account first, then session, then target campaign/upload. A status change and
// its session revocations cannot slip between this check and a committed write.
async function lockActor({ User, UserSession }, actor, token, roles, transaction) {
  const user = await User.findByPk(actor?.id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!user) throw serviceError(401, "INVALID_TOKEN", "Your account is unavailable");
  if (user.status !== "active") throw serviceError(403, "ACCOUNT_SUSPENDED", "Account is suspended");
  if (!roles.includes(user.role)) throw serviceError(403, "FORBIDDEN", "You do not have access to this action");
  const session = await UserSession.findOne({ where: { userId: user.userId, token, status: "active" }, transaction, lock: transaction.LOCK.UPDATE });
  if (!session) throw serviceError(401, "INVALID_TOKEN", "Session expired or logged out");
  return user;
}

function parseManagementQuery(query = {}, { accounts = false } = {}) {
  const errors = {};
  const result = { page: 1, pageSize: 10 };
  for (const key of ["page", "pageSize"]) {
    if (query[key] === undefined) continue;
    if (typeof query[key] !== "string" || !/^[1-9]\d{0,9}$/.test(query[key]) || Number(query[key]) > (key === "pageSize" ? 100 : 2147483647)) {
      errors[key] = key === "pageSize" ? "Use a page size between 1 and 100" : "Use a positive page number";
    } else result[key] = Number(query[key]);
  }
  if (accounts && query.status !== undefined) {
    if (!["active", "suspended"].includes(query.status)) errors.status = "Status must be active or suspended";
    else result.status = query.status;
  }
  if (accounts && query.search !== undefined) {
    if (typeof query.search !== "string" || query.search.trim().length > 150) errors.search = "Search must be text of at most 150 characters";
    else result.search = query.search.trim();
  }
  if (Object.keys(errors).length) throw validationError(errors, "Query parameters are invalid");
  return result;
}

module.exports = { validateBody, validateVersion, validateReason, checkVersion, nextVersion, lockActor, parseManagementQuery };
