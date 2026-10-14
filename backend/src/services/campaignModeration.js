"use strict";

const { parseCampaignId } = require("./campaignQueries");
const { serializeReview, toIso } = require("../utils/campaignSerializer");
const { serviceError, validationError } = require("../utils/serviceError");

const DECISIONS = ["approved", "rejected"];
const ALLOWED_FIELDS = new Set(["status", "comments", "expectedUpdatedAt"]);
const MAX_COMMENT_LENGTH = 2000;

function isCanonicalTimestamp(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function validateReviewInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw validationError({ body: "Send a JSON object containing the review decision" }, "Review data is invalid");
  }

  const errors = Object.create(null);
  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) errors[key] = "This field is not accepted";
  }

  if (!DECISIONS.includes(body.status)) errors.status = "Status must be approved or rejected";

  let comments = null;
  if (body.comments != null) {
    if (typeof body.comments !== "string") errors.comments = "Comments must be a string or null";
    else {
      comments = body.comments.trim() || null;
      if (comments?.length > MAX_COMMENT_LENGTH) errors.comments = `Use ${MAX_COMMENT_LENGTH} characters or fewer`;
    }
  }
  if (body.status === "rejected" && !comments && !errors.comments) {
    errors.comments = "A reason is required when rejecting a campaign";
  }

  if (!isCanonicalTimestamp(body.expectedUpdatedAt)) {
    errors.expectedUpdatedAt = "Send the campaign's current updatedAt value";
  }

  if (Object.keys(errors).length) throw validationError(errors, "Review data is invalid");
  return { status: body.status, comments, expectedUpdatedAt: body.expectedUpdatedAt };
}

// Always move the version forward, even when two writes land in the same millisecond.
function nextVersion(previous) {
  return new Date(Math.max(Date.now(), previous.getTime() + 1));
}

function createCampaignModerationService(models) {
  const { sequelize, Campaign, CampaignReview, User } = models;
  return {
    async review(id, body, admin, token) {
      const campaignId = parseCampaignId(id);
      const decision = validateReviewInput(body);

      return sequelize.transaction(async (transaction) => {
        if (User) {
          const { lockActor } = require("./campaignManagementSupport");
          await lockActor(models, admin, token, ["admin"], transaction);
        }
        const campaign = await Campaign.findByPk(campaignId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!campaign || campaign.deletedAt) throw serviceError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found");

        if (campaign.status !== "pending") {
          throw serviceError(409, "CAMPAIGN_ALREADY_REVIEWED", "This campaign has already been reviewed");
        }
        if (toIso(campaign.updatedAt) !== decision.expectedUpdatedAt) {
          throw serviceError(409, "CAMPAIGN_CHANGED", "This campaign changed after it was loaded. Reload and review again");
        }

        const reviewedAt = nextVersion(campaign.updatedAt);
        // silent stops Sequelize replacing the explicit version; the pending filter is a second guard.
        const [updated] = await Campaign.update(
          { status: decision.status, updatedAt: reviewedAt },
          { where: { campaignId, status: "pending" }, transaction, silent: true },
        );
        if (updated !== 1) throw serviceError(409, "CAMPAIGN_ALREADY_REVIEWED", "This campaign has already been reviewed");

        const review = await CampaignReview.create({
          campaignId,
          adminId: admin.id,
          action: decision.status,
          comments: decision.comments,
          // This legacy review column stores whole seconds. The campaign's
          // concurrency version above retains milliseconds independently.
          reviewedAt: new Date(Math.floor(reviewedAt.getTime() / 1000) * 1000),
        }, { transaction });

        return {
          campaign: { id: campaignId, status: decision.status, updatedAt: toIso(reviewedAt) },
          review: serializeReview(review),
        };
      });
    },
  };
}

module.exports = { createCampaignModerationService, validateReviewInput, isCanonicalTimestamp };
