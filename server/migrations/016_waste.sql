-- Waste submissions table
-- Run after 015_invoice_images_array.sql

USE material_hub;

CREATE TABLE IF NOT EXISTS waste_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  started_at DATETIME NOT NULL,
  shift VARCHAR(20) NOT NULL,
  department VARCHAR(50) NOT NULL,
  waste_type VARCHAR(20) DEFAULT NULL,
  kg DECIMAL(10, 2) NOT NULL,
  completed_by VARCHAR(100),
  completed_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
