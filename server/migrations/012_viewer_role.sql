-- Add 'viewer' role to users table
ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'user', 'viewer') NOT NULL DEFAULT 'user';
