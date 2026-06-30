-- 011_community_videos.sql
-- Creates the community_videos table and seeds existing videos

CREATE TABLE IF NOT EXISTS community_videos (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  url        VARCHAR(500) NOT NULL,
  title      VARCHAR(200) NOT NULL DEFAULT 'Community Testimonial',
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP
);

-- Seed existing hardcoded videos
INSERT IGNORE INTO community_videos (id, url, title) VALUES
  (1,  'https://youtube.com/shorts/gmab7MMwTS0', 'Customer Testimonial 1'),
  (2,  'https://youtube.com/shorts/3mDx-b_aJUs', 'Customer Testimonial 2'),
  (3,  'https://youtube.com/shorts/guFlqRD0I_E', 'Customer Testimonial 3'),
  (4,  'https://youtube.com/shorts/zQhZzCupONw', 'Customer Testimonial 4'),
  (5,  'https://youtube.com/shorts/HIBIcWbHPV4', 'Customer Testimonial 5'),
  (6,  'https://youtube.com/shorts/pT8TXA9mGF8', 'Customer Testimonial 6'),
  (7,  'https://youtube.com/shorts/3D6cqJygUBQ', 'Customer Testimonial 7'),
  (8,  'https://youtube.com/shorts/OYRGBsWlblE', 'Customer Testimonial 8'),
  (9,  'https://youtube.com/shorts/-AGzwaJFPA0', 'Customer Testimonial 9'),
  (10, 'https://youtube.com/shorts/-GYdXWQHchM', 'Customer Testimonial 10');
  
  
