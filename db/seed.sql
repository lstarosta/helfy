-- Helfy Seed Data
-- Creates default admin user (password: admin123)

USE helfy;

INSERT INTO users (email, username, password_hash) 
VALUES ('admin@helfy.com', 'admin', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MQDXBpCLCEBnXrFTZqKNXGn2lBOYKSe')
ON DUPLICATE KEY UPDATE email = email;
