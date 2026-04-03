-- Material Hub database initialization
-- Run as MySQL root (e.g. via Adminer or mysql client)
-- Replace <password> with a secure password before executing

CREATE DATABASE IF NOT EXISTS material_hub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE material_hub;

CREATE TABLE IF NOT EXISTS raw_in_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  started_at DATETIME NOT NULL,
  location_street VARCHAR(255),
  location_area VARCHAR(255),
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  supplier VARCHAR(100),
  transporter VARCHAR(100),
  vehicle_registration VARCHAR(20),
  vehicle_state ENUM('clean', 'dirty'),
  damaged_bags ENUM('yes', 'no'),
  pallets_wrapped ENUM('yes', 'no'),
  driver_name VARCHAR(100),
  invoice_number VARCHAR(50),
  additional_comments TEXT,
  checked_by VARCHAR(100),
  completed_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create app user (run these lines after replacing <password>)
-- CREATE USER IF NOT EXISTS 'material_hub'@'%' IDENTIFIED BY '<password>';
-- GRANT ALL ON material_hub.* TO 'material_hub'@'%';
-- FLUSH PRIVILEGES;
