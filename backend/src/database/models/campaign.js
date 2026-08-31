'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Campaign extends Model {
        static associate(models) {
            Campaign.belongsTo(models.Business, { foreignKey: 'business_id', as: 'business' });
            Campaign.belongsTo(models.Category, { foreignKey: 'category_id', as: 'category' });
            Campaign.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
            Campaign.hasMany(models.Participation, { foreignKey: 'campaign_id', as: 'participations' });
            Campaign.hasMany(models.CampaignReview, { foreignKey: 'campaign_id', as: 'reviews' });
            Campaign.hasMany(models.Lead, { foreignKey: 'campaign_id', as: 'leads' });
        }
    }

    Campaign.init(
        {
            campaignId: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            businessId: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            categoryId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            createdBy: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            title: {
                type: DataTypes.STRING(150),
                allowNull: false,
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            targetAudience: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
            startDate: {
                type: DataTypes.DATEONLY,
                allowNull: true,
            },
            endDate: {
                type: DataTypes.DATEONLY,
                allowNull: true,
            },
            status: {
                type: DataTypes.ENUM('pending', 'approved', 'rejected'),
                allowNull: false,
                defaultValue: 'pending',
            },
        },
        {
            sequelize,
            modelName: 'Campaign',
            tableName: 'campaigns',
            underscored: true,
        }
    );

    return Campaign;
};
