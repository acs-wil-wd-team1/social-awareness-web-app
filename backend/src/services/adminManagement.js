"use strict";

const { Op, fn, col, where: sqlWhere } = require("sequelize");
const { parseCampaignId } = require("./campaignQueries");
const { serializeReview, toIso } = require("../utils/campaignSerializer");
const { serviceError, validationError } = require("../utils/serviceError");
const { validateBody, validateVersion, validateReason, checkVersion, nextVersion, lockActor, parseManagementQuery } = require("./campaignManagementSupport");

const serializeUser = (user) => ({ id: user.userId, name: user.fullName, email: user.email, role: user.role, status: user.status, createdAt: toIso(user.createdAt) });
const ACCOUNT_FIELDS = ["userId", "fullName", "email", "role", "status", "createdAt"];

function createAdminManagementService(models) {
  const { sequelize, Campaign, CampaignReview, User, UserSession, ManagementAudit } = models;
  async function campaignForAction(campaignId, transaction) {
    const campaign = await Campaign.findByPk(campaignId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!campaign || campaign.deletedAt) throw serviceError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found");
    return campaign;
  }
  return {
    async reviews(id, query, actor, token) {
      const campaignId = parseCampaignId(id);
      const { page, pageSize } = parseManagementQuery(query);
      return sequelize.transaction(async (transaction) => {
        await lockActor(models, actor, token, ["admin"], transaction);
        await campaignForAction(campaignId, transaction);
        const { rows, count } = await CampaignReview.findAndCountAll({ where: { campaignId }, order: [["reviewedAt", "DESC"], ["reviewId", "DESC"]], limit: pageSize, offset: (page - 1) * pageSize, transaction });
        return { reviews: rows.map(serializeReview), page, pageSize, total: count };
      });
    },
    async unpublish(id, body, actor, token) {
      const campaignId = parseCampaignId(id);
      validateBody(body, ["status", "reason", "expectedUpdatedAt"]);
      if (body.status !== "pending") throw validationError({ status: "Status must be pending" });
      const expectedUpdatedAt = validateVersion(body);
      const reason = validateReason(body);
      return sequelize.transaction(async (transaction) => {
        const user = await lockActor(models, actor, token, ["admin"], transaction);
        const campaign = await campaignForAction(campaignId, transaction);
        checkVersion(campaign, expectedUpdatedAt);
        if (campaign.status !== "approved") throw serviceError(409, "CAMPAIGN_STATE_CHANGED", "Only an approved campaign can be unpublished");
        const now = nextVersion(campaign.updatedAt);
        await Campaign.update({ status: "pending", updatedAt: now }, { where: { campaignId }, transaction, silent: true });
        await ManagementAudit.create({ actorId: user.userId, targetType: "campaign", targetId: campaignId, action: "campaign_unpublished", previousState: { status: "approved" }, newState: { status: "pending" }, reason, occurredAt: now }, { transaction });
        return { campaign: { id: campaignId, status: "pending", updatedAt: toIso(now) } };
      });
    },
    async remove(id, body, actor, token) {
      const campaignId = parseCampaignId(id);
      validateBody(body, ["reason", "expectedUpdatedAt"]);
      const expectedUpdatedAt = validateVersion(body);
      const reason = validateReason(body);
      await sequelize.transaction(async (transaction) => {
        const user = await lockActor(models, actor, token, ["admin"], transaction);
        const campaign = await campaignForAction(campaignId, transaction);
        checkVersion(campaign, expectedUpdatedAt);
        const now = nextVersion(campaign.updatedAt);
        await Campaign.update({ deletedAt: now, deletedBy: user.userId, deletionReason: reason, updatedAt: now }, { where: { campaignId }, transaction, silent: true });
        await ManagementAudit.create({ actorId: user.userId, targetType: "campaign", targetId: campaignId, action: "campaign_deleted", previousState: { status: campaign.status, deleted: false }, newState: { status: campaign.status, deleted: true }, reason, occurredAt: now }, { transaction });
      });
    },
    async users(query, actor, token) {
      const { page, pageSize, status, search } = parseManagementQuery(query, { accounts: true });
      const where = {};
      if (status) where.status = status;
      if (search) {
        const pattern = `%${search.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
        where[Op.or] = [sqlWhere(fn("LOWER", col("full_name")), { [Op.like]: pattern }), sqlWhere(fn("LOWER", col("email")), { [Op.like]: pattern })];
      }
      return sequelize.transaction(async (transaction) => {
        await lockActor(models, actor, token, ["admin"], transaction);
        const { rows, count } = await User.findAndCountAll({ attributes: ACCOUNT_FIELDS, where, order: [["createdAt", "DESC"], ["userId", "DESC"]], limit: pageSize, offset: (page - 1) * pageSize, transaction });
        return { users: rows.map(serializeUser), page, pageSize, total: count };
      });
    },
    async changeUserStatus(id, body, actor, token) {
      if (typeof id !== "string" || !/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2147483647) throw serviceError(400, "INVALID_USER_ID", "Invalid user ID");
      const userId = Number(id);
      validateBody(body, ["status"]);
      if (!["active", "suspended"].includes(body.status)) throw validationError({ status: "Status must be active or suspended" });
      return sequelize.transaction(async (transaction) => {
        const admin = await lockActor(models, actor, token, ["admin"], transaction);
        if (userId === admin.userId) throw serviceError(403, "FORBIDDEN", "Administrator accounts cannot be changed");
        const user = await User.findByPk(userId, { attributes: ACCOUNT_FIELDS, transaction, lock: transaction.LOCK.UPDATE });
        if (!user) throw serviceError(404, "USER_NOT_FOUND", "User not found");
        if (user.role === "admin") throw serviceError(403, "FORBIDDEN", "Administrator accounts cannot be changed");
        const previousStatus = user.status;
        const now = new Date();
        // Also clean up any anomalous active sessions on an already-suspended account.
        if (body.status === "suspended") await UserSession.update({ status: "expired", logoutAt: now }, { where: { userId, status: "active" }, transaction });
        if (previousStatus !== body.status) {
          await user.update({ status: body.status }, { transaction });
          await ManagementAudit.create({ actorId: admin.userId, targetType: "user", targetId: userId, action: body.status === "suspended" ? "user_suspended" : "user_reactivated", previousState: { status: previousStatus }, newState: { status: body.status }, reason: null, occurredAt: now }, { transaction });
        }
        return { user: serializeUser(user) };
      });
    },
  };
}

module.exports = { createAdminManagementService, serializeUser };
