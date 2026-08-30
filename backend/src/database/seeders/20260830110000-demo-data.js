'use strict';

const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;
// Local/demo login only. Every seeded user shares this password; the
// database only ever stores the bcrypt hash, never the plain text below.
const DEMO_PASSWORD = 'Password123!';

module.exports = {
    async up(queryInterface) {
        const now = new Date();
        const passwordHash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);

        await queryInterface.bulkInsert('users', [
            {
                user_id: 1,
                full_name: 'Alex Admin',
                email: 'admin@causeconnect.test',
                password_hash: passwordHash,
                role: 'admin',
                status: 'active',
                created_at: now,
                updated_at: now,
            },
            {
                user_id: 2,
                full_name: 'Bailey Owner',
                email: 'owner@causeconnect.test',
                password_hash: passwordHash,
                role: 'business_owner',
                status: 'active',
                created_at: now,
                updated_at: now,
            },
            {
                user_id: 3,
                full_name: 'Casey Public',
                email: 'public@causeconnect.test',
                password_hash: passwordHash,
                role: 'public',
                status: 'active',
                created_at: now,
                updated_at: now,
            },
        ]);

        await queryInterface.bulkInsert('categories', [
            {
                category_id: 1,
                category_name: 'Environment',
                description: 'Sustainability, conservation and climate action campaigns.',
                created_at: now,
                updated_at: now,
            },
            {
                category_id: 2,
                category_name: 'Health & Wellbeing',
                description: 'Physical and mental health awareness campaigns.',
                created_at: now,
                updated_at: now,
            },
            {
                category_id: 3,
                category_name: 'Community Support',
                description: 'Local community and charity support campaigns.',
                created_at: now,
                updated_at: now,
            },
            {
                category_id: 4,
                category_name: 'Education',
                description: 'Education access and literacy campaigns.',
                created_at: now,
                updated_at: now,
            },
        ]);

        await queryInterface.bulkInsert('businesses', [
            {
                business_id: 1,
                owner_id: 2,
                business_name: 'Green Leaf Cafe',
                abn: '12345678901',
                website: 'https://greenleafcafe.test',
                description: 'A local cafe supporting sustainable, zero-waste practices.',
                created_at: now,
                updated_at: now,
            },
        ]);

        await queryInterface.bulkInsert('campaigns', [
            {
                campaign_id: 1,
                business_id: 1,
                category_id: 1,
                created_by: 2,
                title: 'Zero-Waste Week',
                description: 'Green Leaf Cafe promotes a week of zero-waste practices in store.',
                target_audience: 'Local coffee drinkers',
                start_date: '2026-09-01',
                end_date: '2026-09-07',
                status: 'approved',
                created_at: now,
                updated_at: now,
            },
            {
                campaign_id: 2,
                business_id: 1,
                category_id: 2,
                created_by: 2,
                title: 'Mindful Mornings',
                description: 'Free mindfulness sessions hosted at Green Leaf Cafe.',
                target_audience: 'Local professionals',
                start_date: '2026-09-10',
                end_date: '2026-09-24',
                status: 'approved',
                created_at: now,
                updated_at: now,
            },
            {
                campaign_id: 3,
                business_id: null,
                category_id: 3,
                created_by: 3,
                title: 'Community Food Drive',
                description: 'A public-led food drive for the local shelter.',
                target_audience: 'Local residents',
                start_date: '2026-09-05',
                end_date: '2026-09-19',
                status: 'approved',
                created_at: now,
                updated_at: now,
            },
            {
                campaign_id: 4,
                business_id: null,
                category_id: 4,
                created_by: 3,
                title: 'Books for Kids',
                description: "Collecting donated children's books for the local school.",
                target_audience: 'Families with school-age children',
                start_date: '2026-09-14',
                end_date: '2026-10-05',
                status: 'approved',
                created_at: now,
                updated_at: now,
            },
            {
                campaign_id: 5,
                business_id: null,
                category_id: 1,
                created_by: 3,
                title: 'Neighbourhood Clean-Up',
                description: 'A public campaign proposing a monthly neighbourhood litter clean-up.',
                target_audience: 'Local residents',
                start_date: '2026-10-01',
                end_date: '2026-10-01',
                status: 'pending',
                created_at: now,
                updated_at: now,
            },
        ]);
    },

    async down(queryInterface) {
        await queryInterface.bulkDelete('campaigns', { campaign_id: [1, 2, 3, 4, 5] });
        await queryInterface.bulkDelete('businesses', { business_id: [1] });
        await queryInterface.bulkDelete('categories', { category_id: [1, 2, 3, 4] });
        await queryInterface.bulkDelete('users', { user_id: [1, 2, 3] });
    },
};
