-- Add invoice_image column to raw_in_submissions
-- Run after 013_masterbatch_grades.sql

USE material_hub;

ALTER TABLE raw_in_submissions ADD COLUMN invoice_image VARCHAR(500) DEFAULT NULL;
