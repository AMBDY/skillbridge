/*
# Homepage section reordering

Stores an ordered array of {key, visible} for the 8 real homepage sections
(hero, trust, ecosystems, featured_categories, about, top_sellers,
recent_jobs, testimonials). Admin reorders via real HTML5 drag-and-drop;
the homepage reads this on load and reorders/hides its actual DOM sections
to match — this is a real (if simpler than a full page-builder) version of
the "homepage drag-and-drop section builder" from the original spec.
*/

ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS homepage_sections jsonb;
