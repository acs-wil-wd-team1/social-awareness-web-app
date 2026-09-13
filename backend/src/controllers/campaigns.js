"use strict";

const { Op } = require("sequelize");
const { Campaign, Category } = require("../database/models");

const pageRenderer = (page, pageSize) => {
  const pageNumber = Math.max(Number(page) || 1, 1);
  const limit = (Math.max(Number(pageSize) || 2, 1));
  return { pageNumber, limit }
}

const getCampaigns = async (req, res) => {
  try {
    const { page = 1, pageSize = 2, category, search } = req.query;

    const { pageNumber, limit } = pageRenderer(page, pageSize);

    const where = {};

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

    return res.status(200).json({
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
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR",
    });
  }
};

const getGuestCampaigns = async (req, res) => {
  try {
    const { page = 1, pageSize = 2, category, search } = req.query;

    const { pageNumber, limit } = pageRenderer(page, pageSize);

    const where = {
      status: "approved",
    };

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

    return res.status(200).json({
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
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR",
    });
  }
};

module.exports = {
  getCampaigns,
  getGuestCampaigns,
};
