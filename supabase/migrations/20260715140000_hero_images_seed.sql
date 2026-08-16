/*
# Hero slideshow images (admin-editable)

The homepage hero slideshow was a hardcoded array of 5 stock photo URLs —
not connected to the superadmin at all, despite the spec calling for an
admin-uploadable slideshow. Storing the image list as a JSON array in
site_content (page_key='homepage_hero', section_key='hero_images') so it
can be edited/uploaded from the Site Content admin tab, with the old
hardcoded URLs as the default so nothing breaks if the admin hasn't set
custom images yet.
*/

INSERT INTO site_content (page_key, section_key, content_type, value)
VALUES (
  'homepage_hero', 'hero_images', 'json',
  '["https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg","https://images.pexels.com/photos/4467687/pexels-photo-4467687.jpeg","https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg","https://images.pexels.com/photos/3184339/pexels-photo-3184339.jpeg","https://images.pexels.com/photos/5905798/pexels-photo-5905798.jpeg"]'
)
ON CONFLICT (page_key, section_key) DO NOTHING;
