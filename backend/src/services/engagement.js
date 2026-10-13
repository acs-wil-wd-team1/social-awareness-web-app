"use strict";

const { Op } = require("sequelize");
const { parseCampaignId } = require("./campaignQueries");
const { toIso } = require("../utils/campaignSerializer");
const { serviceError, validationError } = require("../utils/serviceError");
const { lockActor } = require("./campaignManagementSupport");

const PARTICIPATION_FIELDS = ["participationId", "userId", "campaignId", "status", "participatedAt"];
const LEAD_FIELDS = ["leadId", "campaignId", "businessId", "userId", "name", "email", "phone", "message", "createdAt"];
const CAMPAIGN_FIELDS = ["campaignId", "businessId", "status", "deletedAt"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function bodyErrors(body, allowed) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw validationError({ body: "Send a JSON object" });
  }
  const errors = Object.create(null);
  for (const key of Object.keys(body)) if (!allowed.includes(key)) errors[key] = "This field is not accepted";
  return errors;
}

function validateParticipationInput(body) {
  const errors = bodyErrors(body, ["status"]);
  if (!["joined", "withdrawn"].includes(body.status)) errors.status = "Status must be joined or withdrawn";
  if (Object.keys(errors).length) throw validationError(errors);
  return body.status;
}

function validateEnquiryInput(body) {
  const errors = bodyErrors(body, ["name", "email", "phone", "message"]);
  const result = {};
  for (const [key, limit] of [["name", 100], ["email", 150], ["message", 2000]]) {
    if (typeof body[key] !== "string" || !body[key].trim()) errors[key] = `${key} is required`;
    else {
      result[key] = body[key].trim();
      if (result[key].length > limit) errors[key] = `Use ${limit} characters or fewer`;
    }
  }
  if (result.email) {
    result.email = result.email.toLowerCase();
    if (!EMAIL.test(result.email)) errors.email = "Enter a valid email address";
  }
  if (body.phone == null) result.phone = null;
  else if (typeof body.phone !== "string") errors.phone = "Phone must be a string or null";
  else {
    result.phone = body.phone.trim() || null;
    if (result.phone?.length > 20) errors.phone = "Use 20 characters or fewer";
  }
  if (Object.keys(errors).length) throw validationError(errors, "Enquiry data is invalid");
  return result;
}

function parseEngagementPage(query = {}) {
  const page = { page: 1, pageSize: 10 };
  const errors = {};
  for (const key of ["page", "pageSize"]) {
    if (query[key] === undefined) continue;
    const value = query[key];
    if (typeof value !== "string" || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2147483647) {
      errors[key] = "Use a positive integer";
    } else page[key] = Number(value);
  }
  if (page.pageSize > 100) errors.pageSize = "Use 100 or fewer";
  if (Object.keys(errors).length) throw validationError(errors, "Query parameters are invalid");
  return page;
}

function participationRecord(row) {
  return { id: row.participationId, campaignId: row.campaignId, status: row.status, participatedAt: toIso(row.participatedAt) };
}

function enquiryRecord(row) {
  return {
    id: row.leadId, campaignId: row.campaignId, businessId: row.businessId,
    name: row.name, email: row.email, phone: row.phone ?? null, message: row.message,
    createdAt: toIso(row.createdAt),
  };
}

function requireApproved(campaign, type) {
  if (!campaign || campaign.status !== "approved" || campaign.deletedAt != null) {
    throw serviceError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found");
  }
  const actualType = campaign.businessId == null ? "cause" : "business";
  if (actualType !== type) throw serviceError(409, "CAMPAIGN_TYPE_MISMATCH", "This action is unavailable for this campaign type");
}

function createEngagementService(models) {
  const { sequelize, Campaign, Participation, Lead, Business } = models;
  async function ownParticipation(campaignId, userId, options = {}) {
    return Participation.findOne({ where: { campaignId, userId }, attributes: PARTICIPATION_FIELDS, ...options });
  }

  async function approvedSummaries(ids, { businessId } = {}, transaction) {
    if (!ids.length) return new Map();
    // Never join private campaign titles into a participant's history.
    const where = { campaignId: { [Op.in]: ids }, status: "approved", deletedAt: null };
    if (businessId !== undefined) where.businessId = businessId;
    const rows = await Campaign.findAll({
      where, attributes: ["campaignId", "title", "status", "businessId"], transaction,
    });
    return new Map(rows.map(row => [row.campaignId, {
      id: row.campaignId, title: row.title, status: row.status,
      type: row.businessId == null ? "cause" : "business",
    }]));
  }

  return {
    async getParticipation(id, user, token) {
      const campaignId = parseCampaignId(id);
      return sequelize.transaction(async transaction => {
        const actor = await lockActor(models, user, token, ["public", "business_owner"], transaction);
        const existing = await ownParticipation(campaignId, actor.userId, { transaction });
        if (existing) return { participation: participationRecord(existing) };
        requireApproved(await Campaign.findByPk(campaignId, { attributes: CAMPAIGN_FIELDS, transaction }), "cause");
        return { participation: null };
      });
    },

    async setParticipation(id, body, user, token) {
      const campaignId = parseCampaignId(id);
      const status = validateParticipationInput(body);
      return sequelize.transaction(async transaction => {
        const actor = await lockActor(models, user, token, ["public", "business_owner"], transaction);
        // Account, session, campaign, then dependent participation/lead rows:
        // logout/suspension and visibility changes cannot bypass the write check.
        const campaign = await Campaign.findByPk(campaignId, {
          attributes: CAMPAIGN_FIELDS, transaction, lock: transaction.LOCK.UPDATE,
        });
        let row = await ownParticipation(campaignId, actor.userId, { transaction, lock: transaction.LOCK.UPDATE });
        if (status === "joined" || !row) requireApproved(campaign, "cause");
        if (!row && status === "withdrawn") {
          throw serviceError(409, "PARTICIPATION_NOT_FOUND", "There is no participation to withdraw");
        }
        if (!row) {
          row = await Participation.create({ userId: actor.userId, campaignId, status, participatedAt: new Date() }, {
            fields: ["userId", "campaignId", "status", "participatedAt"], transaction,
          });
          // MySQL DATE without fractional precision rounds/truncates the supplied
          // time. Return the stored first-join time on the initial response too.
          await row.reload({ attributes: PARTICIPATION_FIELDS, transaction });
        } else if (row.status !== status) {
          await row.update({ status }, { fields: ["status"], transaction });
        }
        return { participation: participationRecord(row) };
      });
    },

    async listParticipation(query, user, token) {
      const { page, pageSize } = parseEngagementPage(query);
      return sequelize.transaction(async transaction => {
        const actor = await lockActor(models, user, token, ["public", "business_owner"], transaction);
        const { count, rows } = await Participation.findAndCountAll({
          where: { userId: actor.userId }, attributes: PARTICIPATION_FIELDS,
          order: [["participatedAt", "DESC"], ["participationId", "DESC"]],
          limit: pageSize, offset: (page - 1) * pageSize, transaction,
        });
        const summaries = await approvedSummaries(rows.map(row => row.campaignId), { businessId: null }, transaction);
        return {
          participations: rows.map(row => ({ ...participationRecord(row), campaign: summaries.get(row.campaignId) ?? null })),
          page, pageSize, total: count,
        };
      });
    },

    async sendEnquiry(id, body, user, token) {
      const campaignId = parseCampaignId(id);
      const values = validateEnquiryInput(body);
      return sequelize.transaction(async transaction => {
        const actor = await lockActor(models, user, token, ["public", "business_owner"], transaction);
        const campaign = await Campaign.findByPk(campaignId, {
          attributes: CAMPAIGN_FIELDS, transaction, lock: transaction.LOCK.UPDATE,
        });
        requireApproved(campaign, "business");
        const enquiry = await Lead.create({
          ...values, campaignId, businessId: campaign.businessId, userId: actor.userId,
        }, {
          fields: ["campaignId", "businessId", "userId", "name", "email", "phone", "message"], transaction,
        });
        await enquiry.reload({ attributes: LEAD_FIELDS, transaction });
        return { enquiry: enquiryRecord(enquiry) };
      });
    },

    async listBusinessEnquiries(query, user, token) {
      const { page, pageSize } = parseEngagementPage(query);
      return sequelize.transaction(async transaction => {
        const actor = await lockActor(models, user, token, ["business_owner"], transaction);
        const business = await Business.findOne({
          where: { ownerId: actor.userId }, attributes: ["businessId"], transaction,
        });
        if (!business) throw serviceError(409, "BUSINESS_PROFILE_REQUIRED", "Create your business profile to view enquiries");
        const { count, rows } = await Lead.findAndCountAll({
          // Preserve legacy incomplete rows, but do not present them as valid
          // authenticated enquiry receipts in the new inbox.
          where: { businessId: business.businessId, userId: { [Op.ne]: null }, message: { [Op.ne]: null } },
          attributes: LEAD_FIELDS, order: [["createdAt", "DESC"], ["leadId", "DESC"]],
          limit: pageSize, offset: (page - 1) * pageSize, transaction,
        });
        const summaries = await approvedSummaries(rows.map(row => row.campaignId), { businessId: business.businessId }, transaction);
        return {
          enquiries: rows.map(row => ({ ...enquiryRecord(row), campaign: summaries.get(row.campaignId) ?? null })),
          page, pageSize, total: count,
        };
      });
    },
  };
}

module.exports = { createEngagementService, validateParticipationInput, validateEnquiryInput, parseEngagementPage };
