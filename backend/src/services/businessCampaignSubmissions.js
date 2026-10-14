"use strict";

const { createCampaignSubmissionService } = require("./campaignSubmission");
const { serviceError } = require("../utils/serviceError");

// The dedicated business route and canonical route share one submission implementation.
function createBusinessCampaignSubmissionService(models, imageOptions) {
  const submission = createCampaignSubmissionService(models, {
    ...imageOptions,
    allowedRoles: ["business_owner"],
  });
  return {
    async submit(body, currentUser, token) {
      if (currentUser?.role !== "business_owner") {
        throw serviceError(403, "FORBIDDEN", "Only business owners can post business campaigns");
      }
      // The shared transaction rechecks role/status/session and attaches the photo.
      return submission.submit(body, currentUser, token);
    },
  };
}

module.exports = {
  createBusinessCampaignSubmissionService,
};
