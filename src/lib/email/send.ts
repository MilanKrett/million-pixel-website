import type { Sql } from "@/lib/db";

export interface EmailMessage {
  to: string;
  template: string;
  locale: string;
  subject: string;
  html: string;
  text: string;
  rentalId?: string | null;
}

/**
 * Send (or, in development, just record) an e-mail. Every message is kept in
 * `email_log`; with EMAIL_DRIVER=log (default) nothing leaves the computer
 * and the messages can be read at /dev/emails.
 */
export async function sendEmail(sql: Sql, message: EmailMessage): Promise<void> {
  const driver = process.env.EMAIL_DRIVER ?? "log";
  let status: "logged" | "sent" | "failed" = "logged";
  let providerId: string | null = null;
  let error: string | null = null;

  if (driver === "resend") {
    try {
      providerId = await sendWithResend(message);
      status = "sent";
    } catch (e) {
      status = "failed";
      error = e instanceof Error ? e.message : String(e);
      console.error(`[email] ${message.template} to ${message.to} failed:`, error);
    }
  } else if (driver !== "log") {
    throw new Error(`Unknown EMAIL_DRIVER "${driver}"`);
  }

  await sql`
    insert into email_log (rental_id, to_email, template, locale, subject, html, text_body, status, provider_id, error)
    values (${message.rentalId ?? null}, ${message.to}, ${message.template}, ${message.locale}, ${message.subject},
            ${message.html}, ${message.text}, ${status}, ${providerId}, ${error})
  `;
}

async function sendWithResend(message: EmailMessage): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("EMAIL_DRIVER=resend needs RESEND_API_KEY and EMAIL_FROM.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { id?: string };
  return body.id ?? "";
}
