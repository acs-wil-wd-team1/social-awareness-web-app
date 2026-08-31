'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class User extends Model {
        static associate(models) {
            User.hasOne(models.Business, { foreignKey: 'owner_id', as: 'business' });
            User.hasMany(models.Campaign, { foreignKey: 'created_by', as: 'campaigns' });
            User.hasMany(models.Participation, { foreignKey: 'user_id', as: 'participations' });
            User.hasMany(models.CampaignReview, { foreignKey: 'admin_id', as: 'campaignReviews' });
            User.hasMany(models.Lead, { foreignKey: 'user_id', as: 'leads' });
            User.hasMany(models.UserSession, { foreignKey: 'user_id', as: 'sessions' });
        }
    }

    User.init(
        {
            userId: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            fullName: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },
            email: {
                type: DataTypes.STRING(150),
                allowNull: false,
                unique: true,
            },
            passwordHash: {
                type: DataTypes.STRING(255),
                allowNull: false,
            },
            role: {
                type: DataTypes.ENUM('public', 'business_owner', 'admin'),
                allowNull: false,
                defaultValue: 'public',
            },
            status: {
                type: DataTypes.ENUM('active', 'suspended'),
                allowNull: false,
                defaultValue: 'active',
            },
        },
        {
            sequelize,
            modelName: 'User',
            tableName: 'users',
            underscored: true,
            // password_hash must never come back from a plain query. Login
            // code needs it explicitly, so use User.scope('withPassword').
            defaultScope: {
                attributes: { exclude: ['passwordHash'] },
            },
            scopes: {
                withPassword: {
                    attributes: {},
                },
            },
        }
    );

    return User;
};
