import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditRental } from "@/components/account/EditRental";
import { LoginForm } from "@/components/account/LoginForm";
import { ClientMessages } from "@/i18n/client-messages";
import { localePath } from "@/i18n/config";
import { getLocale, getTranslator } from "@/i18n/server";
import { getSession } from "@/lib/auth/current";
import { getSiteSettings } from "@/lib/data";
import { db } from "@/lib/db";
import { isOwnerEditable, loadRental } from "@/lib/orders/order";
import { orderResponse } from "@/lib/orders/order-response";
import { isDevPaymentsAllowed } from "@/lib/payments/provider";
import { rentConfig } from "@/lib/rent-config";
import { turnstileSiteKey } from "@/lib/turnstile";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("mine.editTitle"), robots: { index: false } };
}

export default function EditRentalPage({ params }: PageProps<"/[locale]/my-pixels/[no]">) {
  return (
    <div className="content wide">
      <Suspense fallback={<p>…</p>}>
        <EditSection params={params} />
      </Suspense>
    </div>
  );
}

async function EditSection({ params }: { params: PageProps<"/[locale]/my-pixels/[no]">["params"] }) {
  const [{ no }, session, locale, settings, t] = await Promise.all([params, getSession(), getLocale(), getSiteSettings(), getTranslator()]);
  const number = Number(no);
  if (!Number.isSafeInteger(number) || number <= 0) notFound();
  if (!session) {
    const devEmails = isDevPaymentsAllowed() && (process.env.EMAIL_DRIVER ?? "log") === "log";
    return (
      <>
        <h1>{t("mine.editTitle")}</h1>
        <p>{t("mine.signInIntro")}</p>
        <ClientMessages namespaces={["login"]}>
          <LoginForm next={localePath(locale, `/my-pixels/${number}`)} minutes={settings.magic_link_minutes} siteKey={turnstileSiteKey()} devEmails={devEmails} />
        </ClientMessages>
      </>
    );
  }
  const sql = db();
  const [row] = await sql<{ id: string; active_content_id: string | null }[]>`
    select id, active_content_id from rentals where no = ${number} and user_id = ${session.user.id}
  `;
  if (!row) notFound();
  const rental = await loadRental(sql, row.id);
  if (!rental) notFound();
  // The content on the wall, or for a rejected rental the last version that was not approved.
  const [current] = await sql<{ id: string; kind: string; title: string | null; url: string | null; display_name: string | null; params: Record<string, unknown> }[]>`
    select id, kind, title, url, display_name, params from content_versions
    where rental_id = ${row.id} and blocked_at is null
      and (id = ${row.active_content_id ?? null} or (${row.active_content_id === null} and status in ('rejected', 'changes_requested')))
    order by created_at desc limit 1
  `;
  const order = await orderResponse(sql, settings, rental);
  return (
    <ClientMessages namespaces={["mine", "rent"]}>
      <EditRental
        initialOrder={order}
        current={current ? { id: current.id, kind: current.kind, title: current.title, url: current.url, displayName: current.display_name, params: current.params } : null}
        config={rentConfig(settings)}
        editable={isOwnerEditable(rental)}
        rejected={rental.status === "rejected"}
      />
    </ClientMessages>
  );
}
