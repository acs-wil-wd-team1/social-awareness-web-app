"use strict";

const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class CampaignImage extends Model {
    static associate(models) {
      CampaignImage.belongsTo(models.User, { foreignKey: "ownerId", as: "owner" });
      CampaignImage.belongsTo(models.Campaign, { foreignKey: "campaignId", as: "campaign" });
    }
  }
  CampaignImage.init({
    imageId: { type: DataTypes.STRING(64), primaryKey: true, allowNull: false },
    ownerId: { type: DataTypes.INTEGER, allowNull: false },
    storageKey: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    contentType: { type: DataTypes.STRING(32), allowNull: false },
    sizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    expiresAt: { type: DataTypes.DATE(3), allowNull: false },
    campaignId: { type: DataTypes.INTEGER, allowNull: true, unique: true },
  }, { sequelize, modelName: "CampaignImage", tableName: "campaign_images", underscored: true });
  return CampaignImage;
};
