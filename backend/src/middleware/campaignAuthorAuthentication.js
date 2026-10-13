"use strict";

const { createCurrentAccountGuard } = require("./currentAccountAuthentication");

const CAMPAIGN_AUTHOR_ROLES = ["public", "business_owner"];

// Public users post cause campaigns; business owners post campaigns for their business.
function createCampaignAuthorGuard(models) {
  return createCurrentAccountGuard(models, {
    roles: CAMPAIGN_AUTHOR_ROLES,
    forbiddenMessage: "Only public and business accounts can manage their own campaigns",
  });
}

module.exports = { createCampaignAuthorGuard, CAMPAIGN_AUTHOR_ROLES };
