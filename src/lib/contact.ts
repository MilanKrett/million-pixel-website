import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { normalizeEmail } from "@/lib/auth/accounts";
import type { Sql } from "@/lib/db";
import { loadEmailEnv } from "@/lib/email/env";
import { sendEmail } from "@/lib/email/send";
import { contactNoticeEmail } from "@/lib/email/templates";
import { hit } from "@/lib/rate-limit";
import { isUnfilled } from "@/lib/site-info";
import { CONTACT_LIMITS, CONTACT_TOPICS, type ContactTopic } from "./contact-topics";

/**
 * The contact form (spec section 13), also the point of contact under the
 * Digital Services Act. Messages are kept in the database (admin → Messages)
 * and sent to the operator's address, so a failed e-mail loses nothing.
 */

export { CONTACT_LIMITS, CONTACT_TOPICS, type ContactTopic } from "./contact-topics";

export type ContactResult =
  | { ok: true; id: string; email: string }
  | { ok: false; reason: "email_invalid" | "message_required" | "too_long" | "rate_limited" };

export async function createContactMessage(
  sql: Sql,
  input: { topic: unknown; name: unknown; email: unknown; rentalNo: unknown; message: unknown; locale: unknown; clientKey: string },
): Promise<ContactResult> {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, reason: "email_invalid" };
  const message = typeof input.message === "string" ? input.message.replace(/\r\n?/g, "\n").trim() : "";
  if (!message) return { ok: false, reason: "message_required" };
  if (message.length > CONTACT_LIMITS.maxMessage) return { ok: false, reason: "too_long" };
  const topic: ContactTopic = CONTACT_TOPICS.includes(input.topic as ContactTopic) ? (input.topic as ContactTopic) : "general";
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ").slice(0, 100) || null : null;
  const no = Number(input.rentalNo);
  const rentalNo = Number.isSafeInteger(no) && no > 0 ? no : null;
  const locale: Locale = isLocale(input.locale) ? input.locale : DEFAULT_LOCALE;
  if (!(await hit(sql, "contact", input.clientKey, CONTACT_LIMITS.perClientHour, 3600))) return { ok: false, reason: "rate_limited" };

  const [row] = await sql<{ id: string }[]>`
    insert into contact_messages (topic, name, email, message, rental_no, locale, client_hash)
    values (${topic}, ${name}, ${email}, ${message}, ${rentalNo}, ${locale}, ${input.clientKey})
    returning id
  `;
  return { ok: true, id: row.id, email };
}

/** E-mail to the operator; replying to it answers the sender. */
export async function notifyContactMessage(sql: Sql, id: string): Promise<void> {
  try {
    const env = await loadEmailEnv(sql);
    const to = env.settings.contact_email.trim();
    if (isUnfilled(to) || !normalizeEmail(to)) return;
    const [m] = await sql<{ topic: ContactTopic; name: string | null; email: string; message: string; rental_no: number | null }[]>`
      select topic, name, email, message, rental_no from contact_messages where id = ${id}
    `;
    if (!m) return;
    // In the language of the staff account behind that address, if there is one.
    const [staff] = await sql<{ locale: string }[]>`select locale from users where email = ${to.toLowerCase()}`;
    const locale: Locale = isLocale(staff?.locale) ? staff.locale : DEFAULT_LOCALE;
    const built = contactNoticeEmail(env, { locale, topic: m.topic, name: m.name, email: m.email, rentalNo: m.rental_no, message: m.message });
    await sendEmail(sql, { to, template: "contact_notice", locale, replyTo: m.email, ...built });
  } catch (error) {
    console.error(`[contact] could not send the notice for message ${id}:`, error);
  }
}

export interface ContactMessage {
  id: string;
  topic: ContactTopic;
  name: string | null;
  email: string;
  message: string;
  rentalNo: number | null;
  locale: string;
  status: "new" | "done";
  createdAt: Date;
  handledAt: Date | null;
}

export async function listContactMessages(sql: Sql, which: "new" | "done"): Promise<ContactMessage[]> {
  const rows = await sql<
    { id: string; topic: ContactTopic; name: string | null; email: string; message: string; rental_no: number | null; locale: string; status: "new" | "done"; created_at: Date; handled_at: Date | null }[]
  >`
    select id, topic, name, email, message, rental_no, locale, status, created_at, handled_at
    from contact_messages where status = ${which}
    order by created_at desc limit 200
  `;
  return rows.map((r) => ({
    id: r.id,
    topic: r.topic,
    name: r.name,
    email: r.email,
    message: r.message,
    rentalNo: r.rental_no,
    locale: r.locale,
    status: r.status,
    createdAt: r.created_at,
    handledAt: r.handled_at,
  }));
}

/** Mark a message as handled (or open again). */
export async function setContactMessageDone(sql: Sql, id: string, done: boolean, actorId: string | null): Promise<boolean> {
  const rows = await sql`
    update contact_messages
    set status = ${done ? "done" : "new"}, handled_by = ${done ? actorId : null}, handled_at = ${done ? sql`now()` : null}
    where id = ${id}
    returning id
  `;
  return rows.length > 0;
}

/** Handled messages are deleted two years later (personal data is kept only as long as needed). */
export async function pruneContactMessages(sql: Sql): Promise<void> {
  await sql`delete from contact_messages where status = 'done' and handled_at < now() - interval '2 years'`;
}
