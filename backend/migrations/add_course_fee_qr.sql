-- Add fee payment QR image storage for courses
ALTER TABLE courses
ADD COLUMN fee_qr_image LONGBLOB NULL AFTER metadata;

ALTER TABLE courses
ADD COLUMN fee_qr_image_type VARCHAR(100) NULL AFTER fee_qr_image;
