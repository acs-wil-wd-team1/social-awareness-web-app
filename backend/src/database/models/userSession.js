'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class UserSession extends Model {
        static associate(models) {
            UserSession.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
        }
    }

    UserSession.init(
        {
            sessionId: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            userId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            token: {
                type: DataTypes.STRING(255),
                allowNull: false,
                unique: true,
            },
            loginAt: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
            logoutAt: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            ipAddress: {
                type: DataTypes.STRING(45),
                allowNull: false,
            },
            userAgent: {
                type: DataTypes.STRING(255),
                allowNull: false,
            },
            status: {
                type: DataTypes.ENUM('active', 'expired'),
                allowNull: false,
                defaultValue: 'active',
            },
        },
        {
            sequelize,
            modelName: 'UserSession',
            tableName: 'user_sessions',
            underscored: true,
            // Table has no created_at/updated_at columns (login_at/logout_at
            // already cover this table's lifecycle).
            timestamps: false,
        }
    );

    return UserSession;
};
