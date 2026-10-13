"use strict";

const allowedFields = new Set([
  "title", "description", "categoryId", "targetAudience", "startDate", "endDate", "imageId",
]);

const { serviceError, validationError: buildValidationError } = require("../utils/serviceError");

const validationError = (fieldErrors) => buildValidationError(fieldErrors, "Campaign data is invalid");

function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (Number(value.slice(0, 4)) < 1000) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateCampaignInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw validationError({ body: "Send a JSON object containing the campaign fields" });
  }

  const errors = Object.create(null);
  for (const key of Object.keys(body)) {
    if (!allowedFields.has(key)) errors[key] = "This field is not accepted";
  }

  const values = {};
  for (const [key, limit] of [["title", 150], ["description", 5000]]) {
    if (typeof body[key] !== "string" || !body[key].trim()) {
      errors[key] = `${key === "title" ? "Title" : "Description"} is required`;
    } else {
      values[key] = body[key].trim();
      if (values[key].length > limit) errors[key] = `Use ${limit} characters or fewer`;
    }
  }

  if (!Number.isSafeInteger(body.categoryId) || body.categoryId < 1 || body.categoryId > 2147483647) {
    errors.categoryId = "Category ID must be a positive integer no larger than 2147483647";
  } else {
    values.categoryId = body.categoryId;
  }

  if (body.targetAudience == null) {
    values.targetAudience = null;
  } else if (typeof body.targetAudience !== "string") {
    errors.targetAudience = "Target audience must be a string or null";
  } else {
    values.targetAudience = body.targetAudience.trim() || null;
    if (values.targetAudience?.length > 255) errors.targetAudience = "Use 255 characters or fewer";
  }

  for (const key of ["startDate", "endDate"]) {
    if (!isCalendarDate(body[key])) {
      errors[key] = "Enter a real date in YYYY-MM-DD format, from year 1000 onwards";
    } else {
      values[key] = body[key];
    }
  }
  if (!errors.startDate && !errors.endDate && values.endDate < values.startDate) {
    errors.endDate = "End date must be on or after the start date";
  }
  if (Object.hasOwn(body, "imageId")) {
    if (typeof body.imageId !== "string" || !/^img_[a-f0-9]{48}$/.test(body.imageId)) errors.imageId = "Choose a valid uploaded photo";
    else values.imageId = body.imageId;
  }

  if (Object.keys(errors).length) throw validationError(errors);
  return values;
}

// Business owners always post for their own linked business; public users post causes.
async function resolveBusinessId(Business, currentUser, transaction) {
  if (currentUser.role !== "business_owner") return null;
  const business = await Business.findOne({ where: { ownerId: currentUser.id }, transaction });
  if (!business) {
    throw serviceError(409, "BUSINESS_PROFILE_REQUIRED", "Create your business profile before posting a campaign");
  }
  return business.businessId;
}

function createCampaignSubmissionService(models, { attachImage, buildImageUrl } = {}) {
  const { Campaign, Category, Business, sequelize } = models;
  return {
    async listCategories() {
      const categories = await Category.findAll({
        attributes: ["categoryId", "categoryName"],
        order: [["categoryName", "ASC"], ["categoryId", "ASC"]],
      });
      return { categories: categories.map((category) => ({ id: category.categoryId, name: category.categoryName })) };
    },

    async submit(body, currentUser, token) {
      const { imageId, ...values } = validateCampaignInput(body);
      const create = async (transaction) => {
        if (transaction) {
          const { lockActor } = require("./campaignManagementSupport");
          const user = await lockActor(models, currentUser, token, ["public", "business_owner"], transaction);
          currentUser = { id: user.userId, role: user.role };
        }
        const category = await Category.findByPk(values.categoryId, { transaction });
        if (!category) throw validationError({ categoryId: "Choose an existing category" });

        const businessId = await resolveBusinessId(Business, currentUser, transaction);

        const campaign = await Campaign.create({
          ...values,
          createdBy: currentUser.id,
          businessId,
          status: "pending",
          imageUrl: null,
        }, { transaction });
        if (imageId) {
          if (!attachImage || !transaction) throw serviceError(503, "SERVICE_UNAVAILABLE", "Image storage is unavailable");
          await attachImage(imageId, campaign.campaignId, currentUser.id, transaction);
        }
        if (typeof campaign.reload === "function") await campaign.reload({ transaction });

        return {
          campaign: {
            id: campaign.campaignId,
            title: campaign.title,
            description: campaign.description,
            categoryId: campaign.categoryId,
            category: category.categoryName,
            type: businessId == null ? "cause" : "business",
            imageUrl: imageId && buildImageUrl ? await buildImageUrl(campaign.campaignId, { audience: "owner", currentUser, token, transaction }) : null,
            targetAudience: campaign.targetAudience,
            startDate: campaign.startDate,
            endDate: campaign.endDate,
            createdBy: campaign.createdBy,
            businessId,
            status: "pending",
            createdAt: campaign.createdAt,
            updatedAt: campaign.updatedAt,
          },
        };
      };
      return sequelize ? sequelize.transaction(create) : create();
    },
  };
}

module.exports = { createCampaignSubmissionService, validateCampaignInput };
