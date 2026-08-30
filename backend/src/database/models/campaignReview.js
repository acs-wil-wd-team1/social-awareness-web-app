'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class CampaignReview extends Model {
        static associate(models) {
            CampaignReview.belongsTo(models.Campaign, { foreignKey: 'campaign_id', as: 'campaign' });
            CampaignReview.belongsTo(models.User, { foreignKey: 'admin_id', as: 'admin' });
        }
    }

    CampaignReview.init(
        {
            reviewId: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            campaignId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            adminId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            action: {
                type: DataTypes.ENUM('approved', 'rejected'),
                allowNull: false,
            },
            comments: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            reviewedAt: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
        },
        {
            sequelize,
            modelName: 'CampaignReview',
            tableName: 'campaign_reviews',
            underscored: true,
            // Table has no created_at/updated_at columns (only reviewed_at).
            timestamps: false,
        }
    );

    return CampaignReview;
};
