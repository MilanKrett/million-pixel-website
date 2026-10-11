-- Phase 3: accounts (sign-in with a link sent by e-mail), two-factor login for
-- staff, moderation, reports, transfers and editable e-mail texts.

-- ---------------------------------------------------------------------------
-- Accounts. The site keeps its own users instead of Supabase Auth: the server
-- sends the sign-in link itself (same e-mail system, languages and log as all
-- other e-mails), so local development and production work the same way.
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (char_length(email) <= 254 and email = lower(email)),
  role text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  locale text not null default 'en' check (locale in ('en', 'sk')),
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  -- Two-factor login (TOTP authenticator app), required for moderators and admins.
  totp_secret text,              -- encrypted with AUTH_SECRET
  totp_enabled_at timestamptz,
  totp_last_step bigint,         -- last accepted time step: a code works only once
  recovery_codes text[] not null default '{}'  -- SHA-256 hashes, each usable once
);

-- Profiles were planned for Supabase Auth; their fields now live in users.
drop table public.profiles;

-- Nothing referenced auth.users yet (no accounts existed before this phase).
update public.rentals set user_id = null where user_id is not null;
update public.content_versions set moderator_id = null where moderator_id is not null;
update public.audit_log set actor_id = null where actor_id is not null;

alter table public.rentals drop constraint rentals_user_id_fkey;
alter table public.rentals
  add constraint rentals_user_id_fkey foreign key (user_id) references public.users (id) on delete set null;
alter table public.content_versions drop constraint content_versions_moderator_id_fkey;
alter table public.content_versions
  add constraint content_versions_moderator_id_fkey foreign key (moderator_id) references public.users (id) on delete set null;
alter table public.audit_log drop constraint audit_log_actor_id_fkey;
alter table public.audit_log
  add constraint audit_log_actor_id_fkey foreign key (actor_id) references public.users (id) on delete set null;

-- The browser never talks to the database directly (no Supabase API keys are
-- handed out), so Row Level Security stays enabled with no policies: the
-- public API sees nothing, and the server checks ownership itself.
drop policy "Users read their own rentals" on public.rentals;
drop policy "Users read content of their own rentals" on public.content_versions;
drop policy "Users read their own payments" on public.payments;
drop policy "Users read stats of their own rentals" on public.click_stats;

-- One-time sign-in links. Only a hash of the token is stored.
create table public.login_tokens (
  token_hash text primary key,
  email text not null,
  next_path text,
  locale text not null default 'en' check (locale in ('en', 'sk')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index login_tokens_email_idx on public.login_tokens (email, created_at desc);

-- Signed-in browsers. The cookie holds a random token; only its hash is stored.
create table public.sessions (
  id_hash text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  -- When the second factor was confirmed in this session (staff only).
  mfa_at timestamptz
);

create index sessions_user_idx on public.sessions (user_id);
create index sessions_expires_idx on public.sessions (expires_at);

-- Request counters for limits (sign-in links, reports, …): hits per key and window.
create table public.rate_limits (
  bucket text not null,
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, key, window_start)
);

-- ---------------------------------------------------------------------------
-- Rentals and content
-- ---------------------------------------------------------------------------

alter table public.rentals
  -- Reminder e-mails before the end (phase 4); the renter can turn them off.
  add column reminders_enabled boolean not null default true,
  -- Content rejected before the rental started: new content is accepted until
  -- this moment, afterwards the payment is refunded and the space released.
  add column reupload_until timestamptz,
  add column hidden_reason text;

create index rentals_reupload_idx on public.rentals (reupload_until) where status = 'rejected';

alter table public.content_versions
  -- When the renter sent it for review (drafts have none).
  add column submitted_at timestamptz,
  -- Which content rule a rejection or removal refers to (translation key).
  add column reason_code text,
  -- Illegal content: never shown again to anyone, kept as evidence.
  add column blocked_at timestamptz,
  -- The link failed a safety check: /go shows a warning instead of redirecting.
  add column link_flagged_at timestamptz,
  add column checks_done_at timestamptz;

create index content_versions_url_idx on public.content_versions (rental_id) where url is not null;

-- The payer, for the receipt. After a rental is given to someone else, its
-- receipts stay with the person who paid.
alter table public.payments add column buyer_email text check (buyer_email is null or char_length(buyer_email) <= 254);
update public.payments p set buyer_email = r.email
from public.rentals r
where r.id = p.rental_id and p.status in ('paid', 'refunded', 'partially_refunded');

-- ---------------------------------------------------------------------------
-- Reports (DSA notice and action)
-- ---------------------------------------------------------------------------

alter table public.reports
  -- The number the reporter saw; kept even if the rental is deleted later.
  add column rental_no integer,
  -- The content shown when the report was made.
  add column content_id uuid references public.content_versions (id) on delete set null,
  add column locale text not null default 'en' check (locale in ('en', 'sk')),
  add column client_hash text,
  -- What was done: none | hidden | removed.
  add column action text check (action is null or action in ('none', 'hidden', 'removed')),
  add column decided_by uuid references public.users (id) on delete set null,
  -- Automatic reports (e.g. the daily link check) have no reporter.
  add column source text not null default 'visitor' check (source in ('visitor', 'system'));

create index reports_rental_idx on public.reports (rental_id);

-- ---------------------------------------------------------------------------
-- Giving a rental to someone else: the new owner accepts with a link sent to
-- their e-mail address, so a typo never gives the rental away.
-- ---------------------------------------------------------------------------

create table public.rental_transfers (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals (id) on delete cascade,
  from_user_id uuid references public.users (id) on delete set null,
  to_email text not null check (char_length(to_email) <= 254),
  token_hash text not null unique,
  locale text not null default 'en' check (locale in ('en', 'sk')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  cancelled_at timestamptz
);

create unique index rental_transfers_open_idx on public.rental_transfers (rental_id)
  where accepted_at is null and cancelled_at is null;

-- ---------------------------------------------------------------------------
-- E-mail texts changed in the admin. Keys are paths inside the "email"
-- namespace of the translation files (e.g. "paid.subject").
-- ---------------------------------------------------------------------------

create table public.email_texts (
  locale text not null check (locale in ('en', 'sk')),
  key text not null,
  value text not null check (char_length(value) <= 5000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null,
  primary key (locale, key)
);

alter table public.users enable row level security;
alter table public.login_tokens enable row level security;
alter table public.sessions enable row level security;
alter table public.rate_limits enable row level security;
alter table public.rental_transfers enable row level security;
alter table public.email_texts enable row level security;
