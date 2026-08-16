/*
# Add location + brand to listings

"Post a Listing" was missing location and brand fields, both explicitly
requested. Adding to products (both apply) and services (location only —
"brand" doesn't really apply to a freelance service).
*/

ALTER TABLE products ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS location text;
