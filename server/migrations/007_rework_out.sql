-- Rework Out submissions table
-- Run after 006_invoice_image.sql

USE material_hub;

CREATE TABLE IF NOT EXISTS rework_out_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  started_at DATETIME NOT NULL,
  location_street VARCHAR(255),
  location_area VARCHAR(255),
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  recycler_name VARCHAR(100),
  grades_sent JSON DEFAULT NULL,
  vehicle_registration VARCHAR(20),
  load_images JSON DEFAULT NULL,
  invoice_image VARCHAR(512) DEFAULT NULL,
  driver_name VARCHAR(100),
  invoice_number VARCHAR(50),
  additional_comments TEXT,
  checked_by VARCHAR(100),
  completed_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
