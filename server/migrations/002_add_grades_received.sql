-- Add grades_received column for material grades (JSON array)
-- Run after 001_init.sql

USE material_hub;

ALTER TABLE raw_in_submissions ADD COLUMN IF NOT EXISTS grades_received JSON DEFAULT NULL;
