/*
# Seed categories

The "select category" dropdown on Post a Job / Post a Listing was empty
because no category rows ever existed — the table and its RLS were correct,
there was just no data. Seeding the categories named in the original spec.
Uses ON CONFLICT on slug so this is safe to re-run.
*/

INSERT INTO categories (name, slug, ecosystem, sort_order) VALUES
  ('Graphics Design', 'graphics-design', 'hire', 1),
  ('Web Design', 'web-design', 'hire', 2),
  ('Tailoring', 'tailoring', 'hire', 3),
  ('Shoe Construction', 'shoe-construction', 'hire', 4),
  ('Bag Construction', 'bag-construction', 'hire', 5),
  ('Plumbing', 'plumbing', 'hire', 6),
  ('Furniture Construction', 'furniture-construction', 'hire', 7),
  ('Event Planning', 'event-planning', 'hire', 8),
  ('Interior Decoration', 'interior-decoration', 'hire', 9),
  ('Painting', 'painting', 'hire', 10),
  ('Catering', 'catering', 'hire', 11),

  ('Clothes', 'clothes', 'shop', 1),
  ('Shoes', 'shoes', 'shop', 2),
  ('Bags', 'bags', 'shop', 3),
  ('Caps', 'caps', 'shop', 4),
  ('Underwear', 'underwear', 'shop', 5),
  ('Kitchen Items', 'kitchen-items', 'shop', 6),
  ('Foodstuffs', 'foodstuffs', 'shop', 7),
  ('Gadgets', 'gadgets', 'shop', 8),
  ('Furniture', 'furniture', 'shop', 9),
  ('Cars', 'cars', 'shop', 10),
  ('Bikes', 'bikes', 'shop', 11),
  ('Land', 'land', 'shop', 12),
  ('Thrift Items', 'thrift-items', 'shop', 13),

  ('Remote Jobs', 'remote-jobs', 'jobs', 1),
  ('Office Jobs', 'office-jobs', 'jobs', 2),
  ('Contract Jobs', 'contract-jobs', 'jobs', 3),
  ('Hybrid Jobs', 'hybrid-jobs', 'jobs', 4),
  ('Internship', 'internship', 'jobs', 5)
ON CONFLICT (slug) DO NOTHING;
