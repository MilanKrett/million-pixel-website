@AGENTS.md

# Million Pixel Wall — notes for coding agents

- The full product spec (Slovak) is in `docs/SPEC.md`; the user's original is the Claude Docs document
  "Prompt – Milión pixelov na prenájom". Work in the phases of section 14 and stop after each phase
  with a summary, test instructions and what the user must set up.
- Talk to the user in Slovak. Code, identifiers, database names and code comments in English.
- Never make an important decision silently: explain deviations from the spec and why.

## Stack and conventions

- Next.js 16 App Router with Cache Components and Partial Prefetching (read `node_modules/next/dist/docs`
  before using an API). Root layout is `src/app/[locale]/layout.tsx`; `src/proxy.ts` rewrites `/…` to
  `/en/…` and redirects `/en/…`; Slovak lives under `/sk`.
- Data reads for pages go through `src/lib/data.ts` (`"use cache"` + `cacheTag("wall" | "settings")`).
  Refresh with `src/lib/revalidate.ts` after mutations. Anything streaming must sit in `<Suspense>`.
- Client components get the locale with `useAppLocale()` (not root params) to keep navigations instant.
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
  stay idempotent and takes amount and period from the payment row, never from the editable order.
- E-mails: `src/lib/email` (`log` driver → `/dev/emails`, or `resend`); `notify*` functions never throw.
- Uploads go straight to storage (`createUploadUrl`), then the server processes them (`src/lib/content`).
- `/admin` is a temporary Basic-auth page (proxy) until phase 3 replaces it with real accounts.
- Retro UI rules (spec section 4): white background, Verdana/Tahoma 11–13 px, 1 px #ccc borders, blue
  underlined links, accent colour only in the logo and the "Rent pixels" button, no gradients, shadows,
  big radii or animated sections.
- All UI text in `src/messages/{en,sk}.json` (a test enforces identical keys and placeholders).

## Checks before finishing work

`npm run lint`, `npm run typecheck`, `npm run test:all`, `npm run build`, and look at the page in a
browser (desktop and 375 px mobile).
