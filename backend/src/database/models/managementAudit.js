"use strict";

module.exports = (sequelize, DataTypes) => sequelize.define("ManagementAudit", {
  auditId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
  actorId: { type: DataTypes.INTEGER, allowNull: false },
  targetType: { type: DataTypes.ENUM("campaign", "user"), allowNull: false },
  targetId: { type: DataTypes.INTEGER, allowNull: false },
  action: { type: DataTypes.ENUM("campaign_unpublished", "campaign_deleted", "user_suspended", "user_reactivated"), allowNull: false },
  previousState: { type: DataTypes.JSON, allowNull: false },
  newState: { type: DataTypes.JSON, allowNull: false },
  reason: { type: DataTypes.TEXT, allowNull: true },
  occurredAt: { type: DataTypes.DATE(3), allowNull: false },
}, { tableName: "management_audit_events", underscored: true, timestamps: false });
