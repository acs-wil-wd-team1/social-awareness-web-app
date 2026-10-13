"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("campaigns", "deleted_at", { type: Sequelize.DATE(3), allowNull: true });
    await queryInterface.addColumn("campaigns", "deleted_by", {
      type: Sequelize.INTEGER, allowNull: true,
      references: { model: "users", key: "user_id" }, onDelete: "RESTRICT", onUpdate: "CASCADE",
    });
    await queryInterface.addColumn("campaigns", "deletion_reason", { type: Sequelize.TEXT, allowNull: true });
    await queryInterface.addIndex("campaigns", ["deleted_at", "status", "created_at", "campaign_id"], { name: "campaigns_visible_status_created" });
    await queryInterface.createTable("management_audit_events", {
      audit_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      actor_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: "users", key: "user_id" }, onDelete: "RESTRICT", onUpdate: "CASCADE" },
      target_type: { type: Sequelize.ENUM("campaign", "user"), allowNull: false },
      target_id: { type: Sequelize.INTEGER, allowNull: false },
      action: { type: Sequelize.ENUM("campaign_unpublished", "campaign_deleted", "user_suspended", "user_reactivated"), allowNull: false },
      previous_state: { type: Sequelize.JSON, allowNull: false },
      new_state: { type: Sequelize.JSON, allowNull: false },
      reason: { type: Sequelize.TEXT, allowNull: true },
      occurred_at: { type: Sequelize.DATE(3), allowNull: false },
    });
    await queryInterface.addIndex("management_audit_events", ["target_type", "target_id", "occurred_at", "audit_id"], { name: "management_audit_target_time" });
    await queryInterface.addIndex("user_sessions", ["user_id", "status"], { name: "user_sessions_owner_status" });
  },
  async down(queryInterface) {
    await queryInterface.removeIndex("user_sessions", "user_sessions_owner_status");
    await queryInterface.dropTable("management_audit_events");
    await queryInterface.removeIndex("campaigns", "campaigns_visible_status_created");
    await queryInterface.removeColumn("campaigns", "deletion_reason");
    await queryInterface.removeColumn("campaigns", "deleted_by");
    await queryInterface.removeColumn("campaigns", "deleted_at");
  },
};
