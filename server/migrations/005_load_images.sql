-- Add load_images column to raw_out_submissions
-- Stores JSON array of image file paths on disk
-- Run after 004_raw_out.sql

USE material_hub;

ALTER TABLE raw_out_submissions ADD COLUMN load_images JSON DEFAULT NULL;
