import Link from "next/link";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { MessageActions } from "@/components/admin/MessageActions";
import { adminLocale, isLocale, LOCALE_NAMES } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { adminFormat, adminT } from "@/lib/admin/t";
import { requireStaffPage } from "@/lib/auth/current";
import { listContactMessages } from "@/lib/contact";
import { db } from "@/lib/db";

export const instant = false;

export default function MessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  return (
    <Suspense fallback={<p>…</p>}>
      <Messages searchParams={searchParams} />
    </Suspense>
  );
}

/** Messages from the contact form (admins only). */
async function Messages({ searchParams }: { searchParams: PageProps<"/admin/messages">["searchParams"] }) {
  const session = await requireStaffPage("admin", "/admin/messages");
  const params = await searchParams;
  const which = params.show === "done" ? "done" : "new";
  const t = adminT(session.user.locale);
  const f = adminFormat(session.user.locale);
  const topics = getMessages(adminLocale(session.user.locale)).contact.topics as Record<string, string>;
  const messages = await listContactMessages(db(), which);
  return (
    <AdminShell session={session} active="messages">
      <h1>{t("messages.title")}</h1>
      <p>{t("messages.intro")}</p>
      <p>
        {which === "new" ? <b>{t("messages.new")}</b> : <Link href="/admin/messages">{t("messages.new")}</Link>} |{" "}
        {which === "done" ? <b>{t("messages.done")}</b> : <Link href="/admin/messages?show=done">{t("messages.done")}</Link>}
      </p>
      {messages.length === 0 && <p className="muted">{t("messages.empty")}</p>}
      {messages.map((m) => (
        <article key={m.id} className="admin-item">
          <div className="admin-info">
            <table className="data">
              <tbody>
                <tr>
                  <th scope="row">{t("messages.from")}</th>
                  <td>
                    {m.name ? `${m.name} · ` : ""}
                    <a href={`mailto:${m.email}`}>{m.email}</a> · {f.dateTime(m.createdAt)}
                  </td>
                </tr>
                <tr>
                  <th scope="row">{t("messages.topic")}</th>
                  <td className={m.topic === "authority" || m.topic === "legal" ? "error" : undefined}>{topics[m.topic] ?? m.topic}</td>
                </tr>
                {m.rentalNo && (
                  <tr>
                    <th scope="row">{t("messages.spot")}</th>
                    <td>
                      <a href={`/admin/rentals/${m.rentalNo}`}>#{m.rentalNo}</a>
                    </td>
                  </tr>
                )}
                <tr>
                  <th scope="row">{t("messages.language")}</th>
                  <td>{isLocale(m.locale) ? LOCALE_NAMES[m.locale] : m.locale}</td>
                </tr>
              </tbody>
            </table>
            <p className="pre-wrap quote">{m.message}</p>
            <p className="admin-actions">
              <a className="btn" href={`mailto:${m.email}`}>
                {t("messages.reply")}
              </a>{" "}
              <MessageActions id={m.id} done={m.status === "done"} />
              {m.handledAt && <span className="muted small"> {t("messages.handled", { date: f.dateTime(m.handledAt) })}</span>}
            </p>
          </div>
        </article>
      ))}
    </AdminShell>
  );
}
