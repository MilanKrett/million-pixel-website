import type { Sql } from "@/lib/db";
import { paymentProvider } from "@/lib/payments/provider";
import type { Settings } from "@/lib/settings/schema";
import { notifyEnded, notifyGraceStarted, notifyReminder } from "./notify";

/**
 * The end of rentals (spec section 8), run by the scheduled jobs every 15
 * minutes and once a day:
 *  1. extension payments that were never finished are closed,
 *  2. rentals whose grace period is over end: the content leaves the wall
 *     and the blocks are free again (a trigger releases block_cells),
 *  3. rentals past their end date enter the grace period: the content stays
 *     and only the renter can extend,
 *  4. reminders go out 30 / 7 / 1 days (settings.reminder_days) before the end.
 * Every step is safe to repeat; e-mails are sent after the database changed.
 */

export interface LifecycleResult {
  reminded: number;
  graced: number;
  ended: number;
  expiredPayments: number;
}

export async function runLifecycle(sql: Sql, settings: Settings): Promise<LifecycleResult> {
  const expiredPayments = await expireExtensionPayments(sql);
  const ended = await endAfterGrace(sql, settings);
  const graced = await startGrace(sql, settings);
  const reminded = await sendReminders(sql, settings);
  return { reminded, graced, ended, expiredPayments };
}

/** Extension payments whose payment page ran out (Stripe also reports this itself). */
async function expireExtensionPayments(sql: Sql): Promise<number> {
  const rows = await sql<{ stripe_session_id: string }[]>`
    update payments set status = 'expired'
    where kind = 'extension' and status = 'pending' and expires_at < now() - interval '5 minutes'
    returning stripe_session_id
  `;
  if (rows.length) {
    const provider = paymentProvider();
    for (const row of rows) await provider.expireCheckout(row.stripe_session_id).catch(() => {});
  }
  return rows.length;
}

/**
 * The grace period is over. A rental whose renter is paying for an extension
 * right now waits until that payment page closes.
 */
async function endAfterGrace(sql: Sql, settings: Settings): Promise<number> {
  const rows = await sql<{ id: string; send: boolean }[]>`
    update rentals r set status = 'ended'
    where r.status in ('active', 'grace') and r.ends_at is not null
      and r.ends_at + make_interval(days => ${settings.grace_days}) <= now()
      and not exists (
        select 1 from payments p
        where p.rental_id = r.id and p.kind = 'extension' and p.status = 'pending' and p.expires_at > now()
      )
    returning r.id, (r.email is not null and not r.is_reserved) as send
  `;
  if (!rows.length) return 0;
  await sql`
    insert into audit_log (action, target, details)
    select 'rental.ended', 'rental:' || id, ${sql.json({ by: "system" })}
    from unnest(${rows.map((r) => r.id)}::uuid[]) as id
  `;
  for (const row of rows) if (row.send) await notifyEnded(sql, row.id);
  return rows.length;
}

/** The end date passed: the content stays during the grace period. */
async function startGrace(sql: Sql, settings: Settings): Promise<number> {
  const rows = await sql<{ id: string; send: boolean; grace_until: Date }[]>`
    update rentals set status = 'grace'
    where status = 'active' and ends_at is not null and ends_at <= now()
    returning id, (email is not null and not is_reserved) as send,
              ends_at + make_interval(days => ${settings.grace_days}) as grace_until
  `;
  if (!rows.length) return 0;
  await sql`
    insert into audit_log (action, target, details)
    select 'rental.grace_started', 'rental:' || id, ${sql.json({ by: "system" })}
    from unnest(${rows.map((r) => r.id)}::uuid[]) as id
  `;
  for (const row of rows) if (row.send) await notifyGraceStarted(sql, row.id, row.grace_until);
  return rows.length;
}

/**
 * The reminder that is due: the smallest of settings.reminder_days that is
 * not smaller than the days left. A missed run therefore never sends an
 * outdated "30 days" reminder a few days before the end.
 */
export function dueReminder(reminderDays: readonly number[], daysLeft: number): number | null {
  const due = [...reminderDays].sort((a, b) => a - b).find((d) => daysLeft <= d);
  return due ?? null;
}

async function sendReminders(sql: Sql, settings: Settings): Promise<number> {
  if (!settings.reminder_days.length) return 0;
  const maxDays = Math.max(...settings.reminder_days);
  const candidates = await sql<{ id: string; ends_at: Date; days_left: number }[]>`
    select r.id, r.ends_at, extract(epoch from (r.ends_at - now())) / 86400 as days_left
    from rentals r
    where r.status = 'active' and r.reminders_enabled and r.email is not null and not r.is_reserved
      and r.hidden_at is null
      and r.ends_at > now() and r.ends_at <= now() + make_interval(days => ${maxDays})
      -- At most one reminder a day, also when an extension moved the end date.
      and not exists (select 1 from rental_reminders rr where rr.rental_id = r.id and rr.sent_at > now() - interval '20 hours')
  `;
  let sent = 0;
  for (const c of candidates) {
    const due = dueReminder(settings.reminder_days, Number(c.days_left));
    if (due === null) continue;
    const inserted = await sql`
      insert into rental_reminders (rental_id, ends_at, days) values (${c.id}, ${c.ends_at}, ${due})
      on conflict do nothing
      returning rental_id
    `;
    if (!inserted.length) continue;
    await notifyReminder(sql, c.id, Math.max(1, Math.round(Number(c.days_left))));
    sent++;
  }
  return sent;
}
