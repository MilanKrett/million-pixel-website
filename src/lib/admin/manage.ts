import { createTranslator } from "use-intl/core";
import { intlLocale, LOCALES, TIME_ZONE, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { findOrCreateUser, normalizeEmail, type Role } from "@/lib/auth/accounts";
import { deleteUserSessions } from "@/lib/auth/session";
import type { Sql } from "@/lib/db";
import { loadEmailEnv } from "@/lib/email/env";
import { sendEmail } from "@/lib/email/send";
import { staffInviteEmail } from "@/lib/email/templates";
import { rectInsideGrid, type Rect } from "@/lib/geometry";
import type { Actor } from "@/lib/payments/refund";
import { loadSettings } from "@/lib/settings/load";
import { GEOMETRY_KEYS, settingsSchema, SETTING_KEYS, wallGrid, type Settings } from "@/lib/settings/schema";

// ---------------------------------------------------------------------------
// Reserved places: space for the site's own ads, charity or contests, without payment.
// ---------------------------------------------------------------------------

export type ReserveResult = { ok: true; id: string; no: number } | { ok: false; reason: "invalid" | "taken"; blocks?: [number, number][] };

export async function createReservedRental(
  sql: Sql,
  settings: Settings,
  input: { rect: Rect; endsAt: Date | null; note?: string | null },
  actor: Actor,
): Promise<ReserveResult> {
  const { cols, rows } = wallGrid(settings);
  const { x, y, w, h } = input.rect;
  if (![x, y, w, h].every(Number.isInteger) || !rectInsideGrid(input.rect, cols, rows)) return { ok: false, reason: "invalid" };
  if (input.endsAt && input.endsAt.getTime() <= Date.now()) return { ok: false, reason: "invalid" };
  try {
    const row = await sql.begin(async (tx) => {
      // Reservations in the way that can no longer be completed are released first.
      await tx`
        update rentals set status = 'expired'
        where id in (
          select distinct bc.rental_id from block_cells bc join rentals r on r.id = bc.rental_id
          where bc.bx between ${x} and ${x + w - 1} and bc.by between ${y} and ${y + h - 1}
            and rental_hold_is_stale(r.status, r.hold_expires_at)
        )
      `;
      const [rental] = await tx<{ id: string; no: number }[]>`
        insert into rentals (x, y, w, h, status, is_reserved, starts_at, ends_at, locale)
        values (${x}, ${y}, ${w}, ${h}, 'active', true, now(), ${input.endsAt}, 'sk')
        returning id, no
      `;
      await tx`
        insert into block_cells (bx, by, rental_id)
        select gx, gy, ${rental.id}
        from generate_series(${x}::int, ${x + w - 1}::int) gx
        cross join generate_series(${y}::int, ${y + h - 1}::int) gy
      `;
      await tx`
        insert into audit_log (actor_id, action, target, details)
        values (${actor.id}, 'rental.reserved', ${`rental:${rental.id}`},
                ${tx.json({ rect: { ...input.rect }, endsAt: input.endsAt, note: input.note ?? null, by: actor.label } as never)})
      `;
      return rental;
    });
    return { ok: true, id: row.id, no: row.no };
  } catch (error) {
    if ((error as { code?: string }).code !== "23505") throw error;
    const blocks = await sql<{ bx: number; by: number }[]>`
      select bc.bx, bc.by from block_cells bc join rentals r on r.id = bc.rental_id
      where bc.bx between ${x} and ${x + w - 1} and bc.by between ${y} and ${y + h - 1}
        and not rental_hold_is_stale(r.status, r.hold_expires_at)
      order by bc.by, bc.bx limit 200
    `;
    return { ok: false, reason: "taken", blocks: blocks.map((b) => [b.bx, b.by]) };
  }
}

/** End a reserved place (frees the space). */
export async function endReservedRental(sql: Sql, rentalId: string, actor: Actor): Promise<boolean> {
  const rows = await sql`
    update rentals set status = 'ended' where id = ${rentalId} and is_reserved and status in ('active', 'grace') returning id
  `;
  if (rows.length) {
    await sql`insert into audit_log (actor_id, action, target, details) values (${actor.id}, 'rental.reserved_ended', ${`rental:${rentalId}`}, ${sql.json({ by: actor.label })})`;
  }
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type SaveSettingsResult = { ok: true; changed: string[] } | { ok: false; errors: Record<string, string> };

/**
 * Save changed settings. Everything is validated together (one value may
 * depend on another); the wall geometry is locked once any rental exists.
 */
export async function saveSettings(sql: Sql, input: Record<string, unknown>, actor: Actor): Promise<SaveSettingsResult> {
  const current = await loadSettings(sql);
  const merged: Record<string, unknown> = { ...current };
  for (const key of SETTING_KEYS) if (key in input) merged[key] = input[key];
  const parsed = settingsSchema.safeParse(merged);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    // Codes the admin page translates: "too_small:1", "too_big:120", "custom", "invalid".
    for (const issue of parsed.error.issues) {
      const detail = issue as { code: string; minimum?: unknown; maximum?: unknown };
      const code =
        detail.code === "too_small" ? `too_small:${String(detail.minimum)}` : detail.code === "too_big" ? `too_big:${String(detail.maximum)}` : detail.code === "custom" ? "custom" : "invalid";
      // Texts per language report "tagline.de"; list items report the setting itself.
      const sub = issue.path[1];
      errors[typeof sub === "string" ? `${String(issue.path[0])}.${sub}` : String(issue.path[0] ?? "form")] ??= code;
    }
    return { ok: false, errors };
  }
  const next = parsed.data;
  const changed = SETTING_KEYS.filter((k) => JSON.stringify(next[k]) !== JSON.stringify(current[k]));
  if (changed.some((k) => GEOMETRY_KEYS.includes(k))) {
    const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from rentals where status <> 'expired'`;
    if (count > 0) {
      const errors: Record<string, string> = {};
      for (const k of changed.filter((c) => GEOMETRY_KEYS.includes(c))) errors[k] = "locked";
      return { ok: false, errors };
    }
  }
  if (!changed.length) return { ok: true, changed };
  await sql.begin(async (tx) => {
    for (const key of changed) {
      await tx`
        insert into settings (key, value, updated_by) values (${key}, ${tx.json(next[key] as never)}, ${actor.id})
        on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by
      `;
    }
    await tx`
      insert into audit_log (actor_id, action, target, details)
      values (${actor.id}, 'settings.updated', 'settings',
              ${tx.json({ changed: Object.fromEntries(changed.map((k) => [k, { from: current[k], to: next[k] }])) as never, by: actor.label })})
    `;
  });
  return { ok: true, changed };
}

// ---------------------------------------------------------------------------
// E-mail texts
// ---------------------------------------------------------------------------

/** All texts of the "email" namespace as "a.b" → default text. */
export function emailTextDefaults(locale: Locale): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (node: Record<string, unknown>, prefix: string) => {
    for (const [k, v] of Object.entries(node)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "string") out[key] = v;
      else if (v && typeof v === "object") walk(v as Record<string, unknown>, key);
    }
  };
  walk(getMessages(locale).email as unknown as Record<string, unknown>, "");
  return out;
}

/** Top-level placeholders of an ICU message: "{name}", "{n, plural, …}". */
export function placeholders(text: string): Map<string, "plain" | "number" | "select"> {
  const found = new Map<string, "plain" | "number" | "select">();
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{") {
      if (depth === 0) {
        const m = text.slice(i + 1).match(/^\s*([A-Za-z0-9_]+)\s*(?:,\s*(\w+))?/);
        if (m) found.set(m[1]!, m[2] === "plural" || m[2] === "number" ? "number" : m[2] === "select" ? "select" : "plain");
      }
      depth++;
    } else if (c === "}") {
      depth = Math.max(0, depth - 1);
    }
  }
  return found;
}

export type SaveTextResult = { ok: true } | { ok: false; reason: "unknown_key" | "too_long" | "unknown_placeholder" | "syntax"; detail?: string };

/** Change (or with an empty value, reset) one e-mail text. Placeholders must exist in the original. */
export async function saveEmailText(sql: Sql, locale: Locale, key: string, value: string | null, actor: Actor): Promise<SaveTextResult> {
  if (!LOCALES.includes(locale)) return { ok: false, reason: "unknown_key" };
  const defaults = emailTextDefaults(locale);
  const original = defaults[key];
  if (original === undefined) return { ok: false, reason: "unknown_key" };
  const text = value?.replace(/\r\n?/g, "\n").trim() ?? "";
  if (!text || text === original) {
    await sql`delete from email_texts where locale = ${locale} and key = ${key}`;
  } else {
    if (text.length > 5000) return { ok: false, reason: "too_long" };
    const allowed = placeholders(original);
    const used = placeholders(text);
    for (const name of used.keys()) if (!allowed.has(name)) return { ok: false, reason: "unknown_placeholder", detail: name };
    // Format once with sample values: a broken {…} structure fails here, not in a customer's e-mail.
    const sample: Record<string, string | number> = {};
    for (const [name, type] of allowed) sample[name] = type === "number" ? 2 : type === "select" ? "other" : "x";
    try {
      const t = createTranslator({
        locale: intlLocale(locale),
        messages: { test: text },
        timeZone: TIME_ZONE,
        onError: (error) => {
          throw error;
        },
      });
      t("test" as never, sample as never);
    } catch (error) {
      return { ok: false, reason: "syntax", detail: error instanceof Error ? error.message : String(error) };
    }
    await sql`
      insert into email_texts (locale, key, value, updated_by) values (${locale}, ${key}, ${text}, ${actor.id})
      on conflict (locale, key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()
    `;
  }
  await sql`
    insert into audit_log (actor_id, action, target, details)
    values (${actor.id}, 'email_text.updated', ${`email:${locale}:${key}`}, ${sql.json({ reset: !text || text === original, by: actor.label })})
  `;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type RoleResult = { ok: true } | { ok: false; reason: "email_invalid" | "last_admin" | "self" };

export async function setRole(sql: Sql, emailInput: unknown, role: Role, actor: Actor & { id: string }): Promise<RoleResult> {
  const email = normalizeEmail(emailInput);
  if (!email) return { ok: false, reason: "email_invalid" };
  const [existing] = await sql<{ id: string; role: Role; locale: Locale }[]>`select id, role, locale from users where email = ${email}`;
  if (existing?.id === actor.id && role !== "admin") return { ok: false, reason: "self" };
  if (existing?.role === "admin" && role !== "admin") {
    const [{ others }] = await sql<{ others: number }[]>`select count(*)::int as others from users where role = 'admin' and id <> ${existing.id}`;
    if (others === 0) return { ok: false, reason: "last_admin" };
  }
  const user = existing ?? (await findOrCreateUser(sql, email, "sk"));
  if (user.role === role) return { ok: true };
  await sql`update users set role = ${role} where id = ${user.id}`;
  // A changed role takes effect at the next sign-in.
  await deleteUserSessions(sql, user.id);
  await sql`
    insert into audit_log (actor_id, action, target, details)
    values (${actor.id}, 'user.role_changed', ${`user:${user.id}`}, ${sql.json({ from: user.role, to: role, email, by: actor.label })})
  `;
  if (role === "admin" || role === "moderator") {
    try {
      const env = await loadEmailEnv(sql);
      await sendEmail(sql, { to: email, template: "staff_invite", locale: user.locale, ...staffInviteEmail(env, { locale: user.locale, role }) });
    } catch (error) {
      console.error("[email] staff_invite failed:", error);
    }
  }
  return { ok: true };
}

export async function listStaff(sql: Sql) {
  return sql<{ id: string; email: string; role: Role; totp_enabled_at: Date | null; last_login_at: Date | null }[]>`
    select id, email, role, totp_enabled_at, last_login_at from users where role <> 'user' order by role, email
  `;
}

// ---------------------------------------------------------------------------
// Audit log and exports
// ---------------------------------------------------------------------------

export async function listAudit(sql: Sql, limit = 200) {
  return sql<{ id: number; action: string; target: string | null; details: Record<string, unknown>; created_at: Date; actor: string | null }[]>`
    select a.id, a.action, a.target, a.details, a.created_at, u.email as actor
    from audit_log a left join users u on u.id = a.actor_id
    order by a.id desc limit ${limit}
  `;
}

/** CSV for spreadsheets. Cells that a spreadsheet would run as a formula are made plain text. */
export function toCsv(rows: (string | number | boolean | Date | null | undefined)[][]): string {
  const cell = (v: string | number | boolean | Date | null | undefined) => {
    if (v === null || v === undefined) return "";
    let s = v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // A BOM makes Excel read the file as UTF-8 (Slovak letters).
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export async function exportCsv(sql: Sql, kind: "rentals" | "payments"): Promise<string> {
  if (kind === "payments") {
    const rows = await sql<{ invoice_number: string | null; paid_at: Date | null; amount_cents: number; refunded_cents: number; currency: string; status: string; buyer_email: string | null; no: number; provider: string }[]>`
      select p.invoice_number, p.paid_at, p.amount_cents, p.refunded_cents, p.currency, p.status, p.buyer_email, r.no, p.provider
      from payments p join rentals r on r.id = p.rental_id
      where p.status in ('paid', 'refunded', 'partially_refunded')
      order by p.paid_at
    `;
    return toCsv([
      ["invoice", "paid_at", "amount", "refunded", "currency", "status", "buyer_email", "spot_no", "provider"],
      ...rows.map((r) => [r.invoice_number, r.paid_at, (r.amount_cents / 100).toFixed(2), (r.refunded_cents / 100).toFixed(2), r.currency, r.status, r.buyer_email, r.no, r.provider]),
    ]);
  }
  const rows = await sql<{ no: number; x: number; y: number; w: number; h: number; status: string; email: string | null; title: string | null; url: string | null; starts_at: Date | null; ends_at: Date | null; paid_at: Date | null; price_cents: number | null; is_reserved: boolean; hidden: boolean }[]>`
    select r.no, r.x, r.y, r.w, r.h, r.status, r.email, c.title, c.url, r.starts_at, r.ends_at, r.paid_at, r.price_cents,
           r.is_reserved, r.hidden_at is not null as hidden
    from rentals r left join content_versions c on c.id = r.active_content_id
    where r.status not in ('hold', 'awaiting_payment', 'expired') and not r.is_test
    order by r.no
  `;
  return toCsv([
    ["no", "x_blocks", "y_blocks", "w_blocks", "h_blocks", "status", "email", "title", "url", "on_wall_since", "reserved_until", "paid_at", "price", "reserved", "hidden"],
    ...rows.map((r) => [r.no, r.x, r.y, r.w, r.h, r.status, r.email, r.title, r.url, r.starts_at, r.ends_at, r.paid_at, r.price_cents === null ? null : (r.price_cents / 100).toFixed(2), r.is_reserved, r.hidden]),
  ]);
}
