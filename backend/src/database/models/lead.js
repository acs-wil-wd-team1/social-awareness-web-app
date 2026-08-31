'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Lead extends Model {
        static associate(models) {
            Lead.belongsTo(models.Campaign, { foreignKey: 'campaign_id', as: 'campaign' });
            Lead.belongsTo(models.Business, { foreignKey: 'business_id', as: 'business' });
            Lead.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
        }
    }

    Lead.init(
        {
            leadId: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            campaignId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            businessId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            userId: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            name: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },
            email: {
                type: DataTypes.STRING(150),
                allowNull: false,
            },
            phone: {
                type: DataTypes.STRING(20),
                allowNull: true,
            },
            message: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
        },
        {
            sequelize,
            modelName: 'Lead',
            tableName: 'leads',
            underscored: true,
        }
    );

    return Lead;
};
