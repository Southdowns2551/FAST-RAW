-- Raw Out submissions table and material_out_reasons settings table
-- Run after 003_settings_tables.sql

USE material_hub;

CREATE TABLE IF NOT EXISTS raw_out_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  started_at DATETIME NOT NULL,
  location_street VARCHAR(255),
  location_area VARCHAR(255),
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  customer_name VARCHAR(100),
  transporter VARCHAR(100),
  reason_for_material_out VARCHAR(255),
  grades_sent JSON DEFAULT NULL,
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

CREATE TABLE IF NOT EXISTS material_out_reasons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_material_out_reasons_name (name)
);
