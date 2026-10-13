'use strict';

// campaigns.updated_at is the optimistic-locking version used by admin review and
// owner edits, so it needs millisecond precision to round-trip as an ISO timestamp.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('campaigns', 'updated_at', {
      type: Sequelize.DATE(3),
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP(3)'),
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('campaigns', 'updated_at', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    });
  },
};
