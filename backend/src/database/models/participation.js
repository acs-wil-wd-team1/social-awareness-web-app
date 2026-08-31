'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Participation extends Model {
        static associate(models) {
            Participation.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
            Participation.belongsTo(models.Campaign, { foreignKey: 'campaign_id', as: 'campaign' });
        }
    }

    Participation.init(
        {
            participationId: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            userId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            campaignId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            participatedAt: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
            status: {
                type: DataTypes.ENUM('joined', 'withdrawn'),
                allowNull: false,
                defaultValue: 'joined',
            },
        },
        {
            sequelize,
            modelName: 'Participation',
            tableName: 'participations',
            underscored: true,
            // Table has no created_at/updated_at columns (only participated_at).
            timestamps: false,
        }
    );

    return Participation;
};
