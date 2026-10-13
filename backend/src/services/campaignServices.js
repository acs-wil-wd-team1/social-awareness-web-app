"use strict";

const models = require("../database/models");
const { createCampaignQueryService } = require("./campaignQueries");
const { buildImageUrl } = require("./campaignImages");
const query = createCampaignQueryService(models, { buildImageUrl });

// Public callers cannot widen visibility with a client-supplied status filter.
const getCampaigns = (filters) => query.list(filters, { audience: "public" });
const campaignById = (id) => query.findById(id, { audience: "public" });

module.exports = { getCampaigns, campaignById };
