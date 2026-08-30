'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Business extends Model {
        static associate(models) {
            Business.belongsTo(models.User, { foreignKey: 'owner_id', as: 'owner' });
            Business.hasMany(models.Campaign, { foreignKey: 'business_id', as: 'campaigns' });
            Business.hasMany(models.Lead, { foreignKey: 'business_id', as: 'leads' });
        }
    }

    Business.init(
        {
            businessId: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            ownerId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                unique: true,
            },
            businessName: {
                type: DataTypes.STRING(150),
                allowNull: false,
            },
            abn: {
                type: DataTypes.STRING(20),
                allowNull: true,
            },
            website: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
        },
        {
            sequelize,
            modelName: 'Business',
            tableName: 'businesses',
            underscored: true,
        }
    );

    return Business;
};
