@AGENTS.md

# Million Pixel Website — notes for coding agents

- The full product spec (Slovak) is in `docs/SPEC.md`; the user's original is the Claude Docs document
  "Prompt – Milión pixelov na prenájom". Work in the phases of section 14 and stop after each phase
  with a summary, test instructions and what the user must set up.
- Talk to the user in Slovak. Code, identifiers, database names and code comments in English.
- Never make an important decision silently: explain deviations from the spec and why.
- The user changed the spec during phase 4 (see the note at the top of `docs/SPEC.md`): pixels are
  bought forever at a one-time price (no periods, reminders, grace period or extensions; only places
  reserved in the admin may end), the site has 10 languages, and there is no hosting or domain yet
  (the site runs from a desktop icon). Code and database still call a bought place a "rental".
- Since 2026-10-12 the site is called "Million Pixel Website" and user-facing texts never call the pixels
  a "wall" in any language (say "the pixels", "published"); a test in `tests/unit/i18n.test.ts` checks it.
  Code identifiers (`wall`, `wall_dirty`, `/api/wall.json`) keep their names. The logo is our own pixel
  drawing in `src/lib/logo.ts`; after changing it run `npm run logo` to rewrite the icon files.

## Stack and conventions

- Next.js 16 App Router with Cache Components and Partial Prefetching (read `node_modules/next/dist/docs`
  before using an API). Root layout is `src/app/[locale]/layout.tsx`; `src/proxy.ts` rewrites `/…` to
  `/en/…`, redirects `/en/…` and the old `/rent…` (now `/buy…`), and sends a first visit of `/` to the
  browser's language (cookie `pw_lang`). The other languages live under `/sk`, `/cs`, `/de`, `/pl`,
  `/hu`, `/fr`, `/es`, `/it`, `/pt` (`src/i18n/config.ts`).
- Data reads for pages go through `src/lib/data.ts` (`"use cache"` + `cacheTag("wall" | "settings")`).
  Refresh with `src/lib/revalidate.ts` after mutations. Anything streaming must sit in `<Suspense>`.
- Client components get the locale with `useAppLocale()` (not root params) to keep navigations instant.
  Pages send only the message namespaces they need to the browser with `<ClientMessages namespaces={…}>`.
- Database: plain Postgres via `postgres` (`src/lib/db.ts`), migrations in `supabase/migrations`
  (applied by `scripts/lib/migrate.ts`). RLS is enabled on every table; the server role bypasses it.
- `src/lib/**` modules used by scripts must not import `server-only` or Next APIs.
- All business numbers live in `settings` (defaults in `src/lib/settings/schema.ts`). Never hard-code them.
- Prices are computed only on the server. Space is reserved by inserting into `block_cells` in the same
  transaction as the rental (primary key (bx, by) prevents overlaps).
- Wall image: `src/lib/wall/render.ts` redraws rectangles queued in `wall_dirty` (filled by a trigger).
- Orders have no account: the httpOnly cookie `pw_order` = `<rentalId>.<token>`, only the token hash is
  stored (`src/lib/orders/tokens.ts`). API routes check it with `authorizeOrder` (`src/lib/orders/request.ts`).
  A hold past its time is free everywhere via `rental_hold_is_stale()`, even before the cron job runs.
  A new hold from the same cookie replaces the old order and copies its draft (`createHold`).
- Payments go through `src/lib/payments/provider.ts` (`dev` now, `stripe` later). `completeCheckout` must
  stay idempotent and takes the amount from the payment row, never from the editable order.
- E-mails: `src/lib/email` (`log` driver → `/dev/emails`, or `resend`); `notify*` functions never throw.
- Uploads go straight to storage (`createUploadUrl`), then the server processes them (`src/lib/content`).
- Accounts (`src/lib/auth`): sign-in links by e-mail (token in the URL #fragment, consumed by a POST),
  session cookie `pw_session` (hash stored), staff need TOTP 2FA (`hasFreshMfa`, 12 h). Pages read the
  session only inside `<Suspense>` with `export const instant = false`; admin pages call
  `requireStaffPage`, admin APIs `requireStaffApi`, owner APIs `authorizeRental` (owner first, then order
  cookie, then staff). `ADMIN_EMAILS` bootstraps the first admin. No Supabase Auth, no RLS policies.
- Moderation (`src/lib/moderation`): every decision is one transaction + `audit_log`; e-mails and
  `refreshWall()` after commit. Reason "child" blocks content and never notifies the uploader.
- Admin UI language comes from `users.locale` (`adminT`); all admin texts are in the `admin` namespace.
- Retro UI rules (spec section 4): white background, Verdana/Tahoma 11–13 px, 1 px #ccc borders, blue
  underlined links, accent colour only in the logo and the "Buy pixels" button, no gradients, shadows,
  big radii or animated sections.
- All UI text in `src/messages/<locale>.json` for all 10 languages; admin texts only in English and
  Slovak (`src/messages/admin/`). `tests/unit/i18n.test.ts` enforces identical keys, placeholders and tags
  and that nothing stays in English by mistake (`SAME_AS_ENGLISH` lists the allowed exceptions). Write
  the typographic apostrophe ’ (ICU reads ' as a quote) and use each language's plural categories.
- Legal pages render `legal.*` texts with `RichText` (`## ` headings, `- ` lists, `[text](/path)` links);
  operator details not filled in the settings show as a highlighted "[to be completed]".
- Security headers and the CSP are in `next.config.ts` (no nonces: Partial Prerendering needs
  `'unsafe-inline'` scripts). Third-party origins (Turnstile, analytics, Supabase) must be added there.
- Desktop: `npm run desktop` (icon from `npm run desktop:install`) backs up `.data`, builds when the code
  changed and runs `next start -H localhost` plus the cron jobs. Never bind to `127.0.0.1`: Next.js then
  treats the proxy rewrite as external and redirects in a loop.

## Checks before finishing work

`npm run lint`, `npm run typecheck`, `npm run test:all`, `npm run build`, and look at the page in a
browser (desktop and 375 px mobile).
