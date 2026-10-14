"use strict";

const { parseCampaignId } = require("./campaignQueries");
const { validateCampaignInput } = require("./campaignSubmission");
const { serializeCampaign } = require("../utils/campaignSerializer");
const { serviceError, validationError } = require("../utils/serviceError");
const { validateBody, validateVersion, checkVersion, nextVersion, lockActor } = require("./campaignManagementSupport");

const FIELDS = ["title", "description", "categoryId", "targetAudience", "startDate", "endDate"];

function validateOwnerEdit(body) {
  validateBody(body, [...FIELDS, "expectedUpdatedAt", "imageId", "removeImage"]);
  const expectedUpdatedAt = validateVersion(body);
  const errors = {};
  if (Object.hasOwn(body, "imageId") && (typeof body.imageId !== "string" || !body.imageId.trim() || body.imageId.length > 255)) errors.imageId = "Choose a valid uploaded image";
  if (Object.hasOwn(body, "removeImage") && body.removeImage !== true) errors.removeImage = "removeImage must be true";
  if (Object.hasOwn(body, "imageId") && Object.hasOwn(body, "removeImage")) errors.imageId = "Replace or remove the image, not both";
  if (Object.keys(errors).length) throw validationError(errors);
  const values = validateCampaignInput(Object.fromEntries(FIELDS.filter((key) => Object.hasOwn(body, key)).map((key) => [key, body[key]])));
  return { values, expectedUpdatedAt, imageId: body.imageId, removeImage: body.removeImage };
}

function createOwnerCampaignManagementService(models, { applyCampaignImageChange } = {}) {
  const { sequelize, Campaign, Category, Business, CampaignReview, ManagementAudit } = models;
  async function ownedCampaign(id, user, transaction) {
    const campaign = await Campaign.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!campaign || campaign.deletedAt || campaign.createdBy !== user.userId) throw serviceError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found");
    if (campaign.businessId != null) {
      const business = await Business.findOne({ where: { businessId: campaign.businessId, ownerId: user.userId }, transaction });
      if (!business) throw serviceError(403, "FORBIDDEN", "This business campaign cannot be changed by this account");
    }
    return campaign;
  }
  return {
    async edit(id, body, actor, token) {
      const campaignId = parseCampaignId(id);
      const input = validateOwnerEdit(body);
      return sequelize.transaction(async (transaction) => {
        const user = await lockActor(models, actor, token, ["public", "business_owner"], transaction);
        const campaign = await ownedCampaign(campaignId, user, transaction);
        checkVersion(campaign, input.expectedUpdatedAt);
        const category = await Category.findByPk(input.values.categoryId, { transaction });
        if (!category) throw validationError({ categoryId: "Choose an existing category" });
        if (applyCampaignImageChange) {
          await applyCampaignImageChange({ campaign, user: { id: user.userId, role: user.role }, transaction, imageId: input.imageId, removeImage: input.removeImage });
        } else if (input.imageId !== undefined || input.removeImage !== undefined) {
          throw serviceError(503, "SERVICE_UNAVAILABLE", "Image storage is unavailable");
        }
        const updatedAt = nextVersion(campaign.updatedAt);
        // Keep the loaded snapshot for a receipt of this write, not a later race.
        await Campaign.update({ ...input.values, imageUrl: campaign.imageUrl, status: "pending", updatedAt }, { where: { campaignId }, transaction, silent: true });
        campaign.set({ ...input.values, status: "pending" });
        campaign.setDataValue("updatedAt", updatedAt);
        const business = campaign.businessId == null ? null : await Business.findByPk(campaign.businessId, { transaction });
        const review = await CampaignReview.findOne({ where: { campaignId }, order: [["reviewedAt", "DESC"], ["reviewId", "DESC"]], transaction });
        return { campaign: serializeCampaign({ ...campaign.get({ plain: true }), category, business }, { review }) };
      });
    },
    async remove(id, body, actor, token) {
      const campaignId = parseCampaignId(id);
      validateBody(body, ["expectedUpdatedAt"]);
      const expectedUpdatedAt = validateVersion(body);
      await sequelize.transaction(async (transaction) => {
        const user = await lockActor(models, actor, token, ["public", "business_owner"], transaction);
        const campaign = await ownedCampaign(campaignId, user, transaction);
        checkVersion(campaign, expectedUpdatedAt);
        const now = nextVersion(campaign.updatedAt);
        await Campaign.update({ deletedAt: now, deletedBy: user.userId, deletionReason: null, updatedAt: now }, { where: { campaignId }, transaction, silent: true });
        await ManagementAudit.create({ actorId: user.userId, targetType: "campaign", targetId: campaignId, action: "campaign_deleted", previousState: { status: campaign.status, deleted: false }, newState: { status: campaign.status, deleted: true }, reason: null, occurredAt: now }, { transaction });
      });
    },
  };
}

module.exports = { createOwnerCampaignManagementService, validateOwnerEdit };
