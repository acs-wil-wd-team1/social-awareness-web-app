"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("campaign_images", {
      image_id: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
      owner_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: "users", key: "user_id" }, onUpdate: "CASCADE", onDelete: "RESTRICT",
      },
      storage_key: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      content_type: { type: Sequelize.STRING(32), allowNull: false },
      size_bytes: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      expires_at: { type: Sequelize.DATE(3), allowNull: false },
      campaign_id: {
        type: Sequelize.INTEGER, allowNull: true, unique: true,
        references: { model: "campaigns", key: "campaign_id" }, onUpdate: "CASCADE", onDelete: "RESTRICT",
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("campaign_images", ["owner_id", "campaign_id", "expires_at"], { name: "campaign_images_owner_unattached" });
    await queryInterface.addIndex("campaign_images", ["campaign_id", "expires_at"], { name: "campaign_images_cleanup" });
  },
  async down(queryInterface) { await queryInterface.dropTable("campaign_images"); },
};
