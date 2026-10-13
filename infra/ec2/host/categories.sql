INSERT INTO categories (category_name, description, created_at, updated_at) VALUES
('Environment', 'Sustainability, conservation and climate action campaigns.', UTC_TIMESTAMP(), UTC_TIMESTAMP()),
('Health & Wellbeing', 'Physical and mental health awareness campaigns.', UTC_TIMESTAMP(), UTC_TIMESTAMP()),
('Community Support', 'Local community and charity support campaigns.', UTC_TIMESTAMP(), UTC_TIMESTAMP()),
('Education', 'Education access and literacy campaigns.', UTC_TIMESTAMP(), UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE category_name = VALUES(category_name);
