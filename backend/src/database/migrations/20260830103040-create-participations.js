'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('participations', {
      participation_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id',
        },
        onDelete: 'RESTRICT',
      },
      campaign_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'campaigns',
          key: 'campaign_id',
        },
        onDelete: 'RESTRICT',
      },
      participated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      status: {
        type: Sequelize.ENUM('joined', 'withdrawn'),
        allowNull: false,
        defaultValue: 'joined',
      },
    });

    await queryInterface.addIndex('participations', {
      fields: ['user_id', 'campaign_id'],
      unique: true,
      name: 'participations_user_id_campaign_id_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('participations');
  },
};
