USE material_hub;
ALTER TABLE raw_in_submissions MODIFY COLUMN invoice_image TEXT DEFAULT NULL;
ALTER TABLE raw_out_submissions MODIFY COLUMN invoice_image TEXT DEFAULT NULL;
ALTER TABLE rework_out_submissions MODIFY COLUMN invoice_image TEXT DEFAULT NULL;
ALTER TABLE rework_in_submissions MODIFY COLUMN invoice_image TEXT DEFAULT NULL;
