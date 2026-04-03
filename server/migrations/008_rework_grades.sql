-- Rework grades table (separate from material_grades, used only by Rework Out)
-- Run after 007_rework_out.sql

USE material_hub;

CREATE TABLE IF NOT EXISTS rework_grades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_rework_grades_name (name)
);
