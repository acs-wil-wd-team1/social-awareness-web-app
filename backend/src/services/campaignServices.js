"use strict";

const { Op } = require("sequelize");
const { Campaign, Category } = require("../database/models");
const { errorMonitor } = require("events");

const getCampaigns = async ({ page, pageSize, category, search, status }) => {

  const pageNumber = Math.max(Number(page) || 1, 1);
  const limit = Math.max(Number(pageSize) || 20, 1);

  const where = {};

  if (status) {
    where.status = status;
  }

  if (category) {
    where.categoryId = category;
  }

  if (search) {
    where.title = {
      [Op.like]: `%${search}%`,
    };
  }

  const data = await Campaign.findAll({
    where,
    order: [
      ["createdAt", "DESC"],
      ["campaignId", "DESC"],
    ],
    include: [
      {
        model: Category,
        as: "category",
        attributes: ["categoryName"],
      },
    ],
    limit,
    offset: (pageNumber - 1) * limit,
  });

  return {
    campaigns: data.map((campaign) => ({
      id: campaign.campaignId,
      title: campaign.title,
      description: campaign.description,
      category: campaign.category?.categoryName,
      imageUrl: campaign.imageUrl,
      createdBy: campaign.createdBy,
      status: campaign.status,
      createdAt: campaign.createdAt,
    })),
    page: pageNumber,
    pageSize: limit,
  };
};

const campaignById = async (id, status) => {
  const campaignId = Number(id);

  if (!Number.isInteger(campaignId) || campaignId < 1) {
    const error = new Error("Invalid campaign ID");
    error.status = 400;
    error.code = "INVALID_CAMPAIGN_ID";
    error.fieldErrors = {
      id: "Campaign ID must be a positive integer",
    };

    throw error;
  }

  const where = {
    campaignId,
  };

  if (status) {
    where.status = status;
  }

  const campaign = await Campaign.findOne({
    where,
    include: [
      {
        model: Category,
        as: "category",
        attributes: ["categoryName"],
      },
    ],
  });

  if (!campaign) {
    const error = new Error("Campaign not found");
    error.status = 404;
    error.code = "CAMPAIGN_NOT_FOUND";
    error.fieldErrors = null;

    throw error;
  }

  return {
    id: campaign.campaignId,
    title: campaign.title,
    description: campaign.description,
    category: campaign.category?.categoryName,
    imageUrl: campaign.imageUrl,
    createdBy: campaign.createdBy,
    status: campaign.status,
    createdAt: campaign.createdAt,
  };
};

module.exports = {
  getCampaigns,
  campaignById
};
