-- Million Pixel Wall: initial schema.
--
-- Coordinates and sizes of rentals are stored in blocks (10 × 10 px by
-- default, see the `block_size_px` setting). Block (0, 0) is the top-left
-- corner of the wall.
--
-- The application server talks to Postgres directly with a privileged role and
-- enforces business rules itself. Row Level Security is enabled on every table
-- so that the public Supabase API (anon/authenticated keys) can only ever read
-- a user's own rows.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings: every tunable number of the business (prices, sizes, deadlines).
-- Defaults live in src/lib/settings/defaults.ts and are inserted by
-- `npm run db:migrate` when a key is missing.
-- ---------------------------------------------------------------------------

create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  locale text not null default 'en' check (locale in ('en', 'sk')),
  marketing_consent boolean not null default false,
  role text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Rentals
-- ---------------------------------------------------------------------------
-- Lifecycle:
--   hold -> awaiting_payment -> in_review -> active -> grace -> ended
--   hold / awaiting_payment -> expired          (not paid in time)
--   in_review -> rejected -> in_review | refunded
--   active / grace -> removed                   (rules violation)
--   any paid state -> refunded                  (admin refund)

create table public.rentals (
  id uuid primary key default gen_random_uuid(),
  -- Short public number used in URLs (/p/123, /go/123) and in wall.json.
  no integer generated always as identity unique,
  user_id uuid references auth.users (id) on delete set null,
  -- Renters do not need an account to order; the account is linked by e-mail.
  email text check (email is null or char_length(email) <= 254),
  x smallint not null check (x >= 0),
  y smallint not null check (y >= 0),
  w smallint not null check (w >= 1),
  h smallint not null check (h >= 1),
  status text not null check (status in (
    'hold', 'awaiting_payment', 'in_review', 'active', 'grace',
    'ended', 'rejected', 'removed', 'refunded', 'expired'
  )),
  period_years smallint check (period_years >= 1),
  hold_expires_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  price_cents integer check (price_cents >= 0),
  currency text not null default 'EUR',
  active_content_id uuid,
  paid_at timestamptz,
  -- Emergency hide by a moderator: the space stays taken, the content disappears.
  hidden_at timestamptz,
  -- Space reserved by an admin without payment (own ads, charity, contests).
  is_reserved boolean not null default false,
  -- Rows created by the test-data script; never present in production.
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index rentals_status_idx on public.rentals (status);
create index rentals_user_idx on public.rentals (user_id);
create index rentals_email_idx on public.rentals (lower(email));
create index rentals_ends_at_idx on public.rentals (ends_at) where status in ('active', 'grace');
create index rentals_hold_expires_idx on public.rentals (hold_expires_at)
  where status in ('hold', 'awaiting_payment');
create index rentals_paid_at_idx on public.rentals (paid_at desc) where paid_at is not null;
create index rentals_is_test_idx on public.rentals (is_test) where is_test;

create trigger rentals_set_updated_at
  before update on public.rentals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Occupancy: one row per block. The primary key makes overlapping rentals
-- impossible, even for requests arriving in the same millisecond.
-- ---------------------------------------------------------------------------

create table public.block_cells (
  bx smallint not null check (bx >= 0),
  by smallint not null check (by >= 0),
  rental_id uuid not null references public.rentals (id) on delete cascade,
  primary key (bx, by)
);

create index block_cells_rental_idx on public.block_cells (rental_id);

-- Statuses in which a rental no longer occupies its blocks.
create or replace function public.rental_status_releases_space(s text)
returns boolean
language sql
immutable
as $$
  select s in ('expired', 'ended', 'removed', 'refunded');
$$;

create or replace function public.release_block_cells()
returns trigger
language plpgsql
as $$
begin
  if public.rental_status_releases_space(new.status)
     and not public.rental_status_releases_space(old.status) then
    delete from public.block_cells where rental_id = new.id;
  end if;
  return null;
end;
$$;

create trigger rentals_release_block_cells
  after update of status on public.rentals
  for each row execute function public.release_block_cells();

-- ---------------------------------------------------------------------------
-- Content versions: every upload/drawing/text and every later change is a new
-- version that has to be approved. The approved one is rentals.active_content_id.
-- ---------------------------------------------------------------------------

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals (id) on delete cascade,
  kind text not null check (kind in ('upload', 'draw', 'text', 'admin', 'seed')),
  -- Original file as uploaded (private storage), kept for moderation and edits.
  source_path text,
  -- Final PNG, exactly (w * block) × (h * block) pixels (private storage).
  png_path text,
  title text not null check (char_length(title) between 1 and 80),
  url text check (url is null or char_length(url) <= 2048),
  display_name text check (display_name is null or char_length(display_name) <= 60),
  status text not null default 'pending' check (status in (
    'draft', 'pending', 'approved', 'rejected', 'changes_requested', 'superseded'
  )),
  auto_checks jsonb not null default '{}'::jsonb,
  moderator_id uuid references auth.users (id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index content_versions_rental_idx on public.content_versions (rental_id, created_at desc);
create index content_versions_pending_idx on public.content_versions (created_at) where status = 'pending';

alter table public.rentals
  add constraint rentals_active_content_fk
  foreign key (active_content_id) references public.content_versions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Payments (Stripe). Kept for accounting even if a rental is removed.
-- ---------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals (id) on delete restrict,
  kind text not null default 'new' check (kind in ('new', 'extension')),
  period_years smallint check (period_years >= 1),
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'EUR',
  status text not null default 'pending' check (status in (
    'pending', 'paid', 'failed', 'expired', 'refunded', 'partially_refunded'
  )),
  refunded_cents integer not null default 0 check (refunded_cents >= 0),
  invoice_number text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_rental_idx on public.payments (rental_id);
create index payments_created_idx on public.payments (created_at desc);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Reports from visitors (DSA notice and action)
-- ---------------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid references public.rentals (id) on delete set null,
  category text not null,
  description text check (char_length(description) <= 5000),
  reporter_email text check (reporter_email is null or char_length(reporter_email) <= 254),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index reports_open_idx on public.reports (created_at) where status = 'open';

-- ---------------------------------------------------------------------------
-- Per-day statistics for renters
-- ---------------------------------------------------------------------------

create table public.click_stats (
  rental_id uuid not null references public.rentals (id) on delete cascade,
  day date not null,
  clicks integer not null default 0,
  opens integer not null default 0,
  primary key (rental_id, day)
);

-- ---------------------------------------------------------------------------
-- Wall image versions. The image is stored as <image_path>.png and .webp in
-- the public "wall" bucket; the id is the version number used in URLs.
-- ---------------------------------------------------------------------------

create table public.wall_versions (
  id integer generated always as identity primary key,
  image_path text not null,
  changed_rect jsonb,
  full_rebuild boolean not null default false,
  created_at timestamptz not null default now()
);

-- Areas of the wall (in blocks) that must be redrawn. Filled by a trigger on
-- rentals, consumed by the wall renderer.
create table public.wall_dirty (
  id bigint generated always as identity primary key,
  x smallint not null,
  y smallint not null,
  w smallint not null,
  h smallint not null,
  created_at timestamptz not null default now()
);

create or replace function public.rental_is_displayed(
  status text, hidden_at timestamptz, active_content_id uuid
)
returns boolean
language sql
immutable
as $$
  select status in ('active', 'grace') and hidden_at is null and active_content_id is not null;
$$;

create or replace function public.mark_wall_dirty()
returns trigger
language plpgsql
as $$
declare
  old_shown boolean := false;
  new_shown boolean := false;
  same_rect boolean := false;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    old_shown := public.rental_is_displayed(old.status, old.hidden_at, old.active_content_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    new_shown := public.rental_is_displayed(new.status, new.hidden_at, new.active_content_id);
  end if;
  if tg_op = 'UPDATE' then
    same_rect := (old.x, old.y, old.w, old.h) = (new.x, new.y, new.w, new.h);
    if not old_shown and not new_shown then
      return null;
    end if;
    if old_shown and new_shown and same_rect
       and old.active_content_id is not distinct from new.active_content_id then
      return null;
    end if;
  end if;

  if old_shown then
    insert into public.wall_dirty (x, y, w, h) values (old.x, old.y, old.w, old.h);
  end if;
  if new_shown and not (old_shown and same_rect) then
    insert into public.wall_dirty (x, y, w, h) values (new.x, new.y, new.w, new.h);
  end if;
  return null;
end;
$$;

create trigger rentals_mark_wall_dirty
  after insert or update or delete on public.rentals
  for each row execute function public.mark_wall_dirty();

-- ---------------------------------------------------------------------------
-- Audit log of every moderation and admin decision
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Stripe webhook idempotency: every event is processed only once.
-- ---------------------------------------------------------------------------

create table public.stripe_events (
  event_id text primary key,
  type text,
  processed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.rentals enable row level security;
alter table public.block_cells enable row level security;
alter table public.content_versions enable row level security;
alter table public.payments enable row level security;
alter table public.reports enable row level security;
alter table public.click_stats enable row level security;
alter table public.wall_versions enable row level security;
alter table public.wall_dirty enable row level security;
alter table public.audit_log enable row level security;
alter table public.stripe_events enable row level security;

create policy "Users read their own profile" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Users update their own profile" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and role = 'user');

create policy "Users read their own rentals" on public.rentals
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Users read content of their own rentals" on public.content_versions
  for select to authenticated using (
    exists (
      select 1 from public.rentals r
      where r.id = content_versions.rental_id and r.user_id = (select auth.uid())
    )
  );

create policy "Users read their own payments" on public.payments
  for select to authenticated using (
    exists (
      select 1 from public.rentals r
      where r.id = payments.rental_id and r.user_id = (select auth.uid())
    )
  );

create policy "Users read stats of their own rentals" on public.click_stats
  for select to authenticated using (
    exists (
      select 1 from public.rentals r
      where r.id = click_stats.rental_id and r.user_id = (select auth.uid())
    )
  );
