-- The site is called "Million Pixel Website" (the owner's decision of 2026-10-12).
-- Only a site that still has the old default name is renamed; a name chosen in
-- the administration stays as it is.
update public.settings
set value = to_jsonb('Million Pixel Website'::text)
where key = 'site_name'
  and value = to_jsonb('Million Pixel Wall'::text);
