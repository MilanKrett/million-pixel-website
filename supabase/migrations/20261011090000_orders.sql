-- Phase 2: ordering without an account, payments through a replaceable
-- provider (test provider now, Stripe later) and an e-mail log.

-- ---------------------------------------------------------------------------
-- Orders: a rental row is the order. The buyer is identified by a random
-- order token kept in an httpOnly cookie (only its hash is stored).
-- ---------------------------------------------------------------------------

alter table public.rentals
  add column order_token_hash text,
  -- Salted hash of the buyer's IP address, only for "max N reservations per IP".
  add column client_hash text,
  add column locale text not null default 'en' check (locale in ('en', 'sk')),
  add column terms_accepted_at timestamptz,
  -- Consent to start the service before the 14-day withdrawal period ends.
  add column withdrawal_waiver_at timestamptz,
  add column marketing_consent boolean not null default false;

create index rentals_client_hash_idx on public.rentals (client_hash)
  where status in ('hold', 'awaiting_payment');

-- A reservation nobody can complete any more. Unpaid holds end at
-- hold_expires_at; a started payment gets 5 extra minutes so a payment
-- confirmation that arrives a little late still finds its space.
create or replace function public.rental_hold_is_stale(status text, hold_expires_at timestamptz)
returns boolean
language sql
stable
as $$
  select (status = 'hold' and hold_expires_at < now())
      or (status = 'awaiting_payment' and hold_expires_at < now() - interval '5 minutes');
$$;

-- ---------------------------------------------------------------------------
-- Content drafts: the content is made before the title and link are known.
-- ---------------------------------------------------------------------------

alter table public.content_versions alter column title drop not null;
alter table public.content_versions drop constraint content_versions_title_check;
alter table public.content_versions
  add constraint content_versions_title_check
    check (title is null or char_length(title) between 1 and 80),
  add constraint content_versions_title_required
    check (status = 'draft' or title is not null),
  -- Editor parameters (crop, palette, text settings) so the content can be edited later.
  add column params jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Payments through a provider ("dev" test provider or "stripe").
-- ---------------------------------------------------------------------------

alter table public.payments
  add column provider text not null default 'stripe' check (provider in ('stripe', 'dev')),
  add column expires_at timestamptz,
  add column paid_at timestamptz;

create index payments_pending_idx on public.payments (rental_id) where status = 'pending';

-- Receipt numbers: YYYY-000001, …
create sequence public.invoice_seq;

-- ---------------------------------------------------------------------------
-- Every e-mail the site sends (or, in development, would send).
-- ---------------------------------------------------------------------------

create table public.email_log (
  id bigint generated always as identity primary key,
  rental_id uuid references public.rentals (id) on delete set null,
  to_email text not null,
  template text not null,
  locale text not null,
  subject text not null,
  html text not null,
  text_body text not null,
  status text not null check (status in ('logged', 'sent', 'failed')),
  provider_id text,
  error text,
  created_at timestamptz not null default now()
);

create index email_log_created_idx on public.email_log (created_at desc);
create index email_log_rental_idx on public.email_log (rental_id);

alter table public.email_log enable row level security;
