-- 010_stock_request_status.sql
ALTER TABLE stock_requests 
MODIFY COLUMN status ENUM('pending','ordered','received','cancelled','rejected','returned') DEFAULT 'pending';
