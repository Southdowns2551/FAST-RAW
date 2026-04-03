-- Masterbatch grades table (separate from material_grades, used by Raw In/Out)
-- Run after 012_viewer_role.sql

USE material_hub;

CREATE TABLE IF NOT EXISTS masterbatch_grades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_masterbatch_grades_name (name)
);
