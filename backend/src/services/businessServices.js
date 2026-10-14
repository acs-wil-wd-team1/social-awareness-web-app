"use strict";

const { validationError } = require("../utils/serviceError");
const { validateBody, lockActor } = require("./campaignManagementSupport");

const PROFILE_FIELDS = ["businessName", "abn", "website", "description"];
const PROFILE_ATTRIBUTES = ["businessId", ...PROFILE_FIELDS];

function optionalText(body, field, maximum, errors) {
  const value = body[field];
  if (value == null) return null;
  if (typeof value !== "string") {
    errors[field] = "Use text or leave this field empty";
    return null;
  }
  const trimmed = value.trim() || null;
  if (trimmed?.length > maximum) errors[field] = `Use ${maximum} characters or fewer`;
  return trimmed;
}

function validateBusinessProfileInput(body) {
  validateBody(body, PROFILE_FIELDS);
  const errors = {};
  let businessName;
  if (typeof body.businessName !== "string" || !body.businessName.trim()) {
    errors.businessName = "Business name is required";
  } else {
    businessName = body.businessName.trim();
    if (businessName.length > 150) errors.businessName = "Use 150 characters or fewer";
  }
  const abn = optionalText(body, "abn", 20, errors);
  const website = optionalText(body, "website", 255, errors);
  const description = optionalText(body, "description", 2000, errors);
  if (website && !errors.website) {
    try {
      const url = new URL(website);
      const authority = website.slice(website.indexOf("://") + 3).split(/[/?#\\]/, 1)[0];
      if (!/^https?:\/\//i.test(website) || !["http:", "https:"].includes(url.protocol) || !url.hostname
        || url.username || url.password || authority.includes("@") || /[\u0000-\u001f\u007f]/.test(website)) {
        throw new Error("Invalid profile website");
      }
    } catch {
      errors.website = "Use a full HTTP or HTTPS website address without a username or password";
    }
  }
  if (Object.keys(errors).length) throw validationError(errors, "Business profile data is invalid");
  return { businessName, abn, website, description };
}

function serializeBusinessProfile(row) {
  if (!row) return { business: null };
  return { business: {
    id: row.businessId, businessName: row.businessName,
    abn: row.abn ?? null, website: row.website ?? null, description: row.description ?? null,
  } };
}

function createBusinessProfileService(models) {
  const { sequelize, Business } = models;
  const ownedProfile = (ownerId, transaction) => Business.findOne({
    where: { ownerId }, attributes: PROFILE_ATTRIBUTES, transaction, logging: false,
  });
  return {
    async get(actor, token) {
      return sequelize.transaction(async (transaction) => {
        const user = await lockActor(models, actor, token, ["business_owner"], transaction);
        return serializeBusinessProfile(await ownedProfile(user.userId, transaction));
      });
    },
    async save(body, actor, token) {
      const values = validateBusinessProfileInput(body);
      return sequelize.transaction(async (transaction) => {
        // Every save locks the owning account first, then its session. Competing
        // first saves therefore resolve to the same unique owner row. Avoid a
        // missing-row gap lock so different owners can save concurrently.
        const user = await lockActor(models, actor, token, ["business_owner"], transaction);
        let profile = await ownedProfile(user.userId, transaction);
        if (profile) await profile.update(values, { transaction, logging: false });
        else profile = await Business.create({ ...values, ownerId: user.userId }, { transaction, logging: false });
        // Return this transaction's saved receipt, not a later writer's read.
        return serializeBusinessProfile(profile);
      });
    },
  };
}

let defaultService;
function getDefaultService() {
  if (!defaultService) defaultService = createBusinessProfileService(require("../database/models"));
  return defaultService;
}

module.exports = {
  createBusinessProfileService, validateBusinessProfileInput, serializeBusinessProfile,
  getBusinessProfile: (...args) => getDefaultService().get(...args),
  saveBusinessProfile: (...args) => getDefaultService().save(...args),
};
