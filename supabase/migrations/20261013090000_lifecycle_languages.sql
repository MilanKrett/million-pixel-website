-- Phase 4: ten languages, end of a rental (reminders, grace period, release),
-- paid extensions and the contact form.

-- ---------------------------------------------------------------------------
-- Languages: en, sk, cs, de, pl, hu, fr, es, it, pt
-- ---------------------------------------------------------------------------

alter table public.rentals drop constraint rentals_locale_check,
  add constraint rentals_locale_check check (locale in ('en', 'sk', 'cs', 'de', 'pl', 'hu', 'fr', 'es', 'it', 'pt'));
alter table public.users drop constraint users_locale_check,
  add constraint users_locale_check check (locale in ('en', 'sk', 'cs', 'de', 'pl', 'hu', 'fr', 'es', 'it', 'pt'));
alter table public.login_tokens drop constraint login_tokens_locale_check,
  add constraint login_tokens_locale_check check (locale in ('en', 'sk', 'cs', 'de', 'pl', 'hu', 'fr', 'es', 'it', 'pt'));
alter table public.reports drop constraint reports_locale_check,
  add constraint reports_locale_check check (locale in ('en', 'sk', 'cs', 'de', 'pl', 'hu', 'fr', 'es', 'it', 'pt'));
alter table public.rental_transfers drop constraint rental_transfers_locale_check,
  add constraint rental_transfers_locale_check check (locale in ('en', 'sk', 'cs', 'de', 'pl', 'hu', 'fr', 'es', 'it', 'pt'));
alter table public.email_texts drop constraint email_texts_locale_check,
  add constraint email_texts_locale_check check (locale in ('en', 'sk', 'cs', 'de', 'pl', 'hu', 'fr', 'es', 'it', 'pt'));

-- The slogan and the announcement now have one text per language
-- ({"en": "…", "de": "…"}); a missing language uses the built-in slogan
-- (or the English announcement). Own texts are kept, the old defaults are not.
insert into public.settings (key, value)
select 'tagline', jsonb_strip_nulls(jsonb_build_object(
  'en', nullif(nullif((select value #>> '{}' from public.settings where key = 'tagline_en'), ''), 'Leave your mark on the internet'),
  'sk', nullif(nullif((select value #>> '{}' from public.settings where key = 'tagline_sk'), ''), 'Nechaj na internete svoju stopu')
))
on conflict (key) do nothing;

insert into public.settings (key, value)
select 'announcement', jsonb_strip_nulls(jsonb_build_object(
  'en', nullif((select value #>> '{}' from public.settings where key = 'announcement_en'), ''),
  'sk', nullif((select value #>> '{}' from public.settings where key = 'announcement_sk'), '')
))
on conflict (key) do nothing;

delete from public.settings where key in ('tagline_en', 'tagline_sk', 'announcement_en', 'announcement_sk');

-- ---------------------------------------------------------------------------
-- End of a rental
-- ---------------------------------------------------------------------------

-- One row per reminder e-mail ("ends in 30 / 7 / 1 days"). Keyed by the end
-- date, so an extended rental is reminded again before its new end.
create table public.rental_reminders (
  rental_id uuid not null references public.rentals (id) on delete cascade,
  ends_at timestamptz not null,
  days smallint not null check (days >= 1),
  sent_at timestamptz not null default now(),
  primary key (rental_id, ends_at, days)
);

create index rental_reminders_sent_idx on public.rental_reminders (rental_id, sent_at desc);

alter table public.rental_reminders enable row level security;

-- Consents given when paying for an extension (a new purchase).
alter table public.payments
  add column terms_accepted_at timestamptz,
  add column withdrawal_waiver_at timestamptz;

-- ---------------------------------------------------------------------------
-- Contact form (also the DSA point of contact for users and authorities)
-- ---------------------------------------------------------------------------

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic in ('general', 'rental', 'payment', 'legal', 'authority', 'press')),
  name text check (name is null or char_length(name) <= 100),
  email text not null check (char_length(email) between 3 and 254),
  message text not null check (char_length(message) between 1 and 5000),
  rental_no integer,
  locale text not null check (locale in ('en', 'sk', 'cs', 'de', 'pl', 'hu', 'fr', 'es', 'it', 'pt')),
  -- Salted hash of the sender's IP address, only for the rate limit.
  client_hash text,
  status text not null default 'new' check (status in ('new', 'done')),
  handled_by uuid references public.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create index contact_messages_new_idx on public.contact_messages (created_at) where status = 'new';
create index contact_messages_created_idx on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;
