import type { Sql } from "@/lib/db";
import { storage } from "@/lib/storage";
import { checkImage, checkLinkReputation, linkCheckProvider, type CheckStatus, type ImageVerdict, type LinkReputation } from "./providers";
import { followRedirects } from "./safe-fetch";
import { flagText } from "./text-filter";

/**
 * Automatic checks that help the moderator (spec section 9). They never
 * approve or reject anything by themselves; the results are stored with the
 * content version (auto_checks) and highlighted in the moderation queue.
 * Child-abuse material cannot be matched by an API we can call ourselves —
 * see the README (Cloudflare CSAM Scanning Tool once the domain is on Cloudflare).
 */

export interface LinkCheck {
  status: CheckStatus | "none";
  finalUrl?: string;
  redirects?: string[];
  reputation?: LinkReputation;
  error?: string | null;
}

export interface AutoChecks {
  checkedAt: string;
  image: ImageVerdict;
  link: LinkCheck;
  text: { flagged: string[] };
}

/** Where a link really leads and whether Google lists any address on the way as dangerous. */
export async function checkLink(url: string | null): Promise<LinkCheck> {
  if (!url) return { status: "none" };
  const chain = await followRedirects(url);
  const reputation = await checkLinkReputation(chain.urls);
  // An address that resolves to our own network or a private one is suspicious in itself.
  const status: CheckStatus =
    reputation.status === "flagged" || chain.error === "private_address" ? "flagged" : reputation.status === "error" ? "error" : reputation.status;
  return { status, finalUrl: chain.finalUrl, redirects: chain.urls, reputation, error: chain.error };
}

/**
 * Quick check when the renter saves a link: refuse it only when a reputation
 * service is configured and lists it (spec 15: a page marked dangerous cannot
 * be saved). Network trouble never blocks the order.
 */
export async function isLinkUnsafe(url: string | null): Promise<boolean> {
  if (!url || linkCheckProvider() === "none") return false;
  const result = await checkLink(url);
  return result.reputation?.status === "flagged";
}

export async function runAutoChecks(sql: Sql, contentId: string): Promise<AutoChecks | null> {
  try {
    const [content] = await sql<{ id: string; png_path: string | null; source_path: string | null; title: string | null; url: string | null; display_name: string | null }[]>`
      select id, png_path, source_path, title, url, display_name from content_versions where id = ${contentId}
    `;
    if (!content) return null;
    // The original upload shows more detail to the image service than a tiny tile.
    const imagePath = content.source_path ?? content.png_path;
    const image = imagePath ? await storage().get("content", imagePath) : null;
    const type = imagePath?.endsWith(".jpg") ? "image/jpeg" : imagePath?.endsWith(".webp") ? "image/webp" : "image/png";

    const [imageVerdict, link] = await Promise.all([
      image ? checkImage(image, type) : Promise.resolve<ImageVerdict>({ provider: "none", status: "skipped", scores: {} }),
      checkLink(content.url),
    ]);
    const checks: AutoChecks = {
      checkedAt: new Date().toISOString(),
      image: imageVerdict,
      link,
      text: { flagged: flagText(content.title, content.display_name) },
    };
    await sql`
      update content_versions
      set auto_checks = ${sql.json(checks as never)}, checks_done_at = now(),
          link_flagged_at = case when ${link.status === "flagged"} then coalesce(link_flagged_at, now()) else link_flagged_at end
      where id = ${contentId}
    `;
    return checks;
  } catch (error) {
    console.error(`[checks] content ${contentId} failed:`, error);
    return null;
  }
}

/** Check the content of a rental that just went to review (after payment). */
export async function runChecksForRental(sql: Sql, rentalId: string): Promise<void> {
  const [content] = await sql<{ id: string }[]>`
    select id from content_versions where rental_id = ${rentalId} and status = 'pending' order by created_at desc limit 1
  `;
  if (content) await runAutoChecks(sql, content.id);
}

/** Something in the checks the moderator should look at first. */
export function checksNeedAttention(checks: Partial<AutoChecks> | null | undefined): boolean {
  if (!checks) return false;
  return checks.image?.status === "flagged" || checks.link?.status === "flagged" || (checks.text?.flagged.length ?? 0) > 0;
}

/**
 * Daily: check every link on the wall again (a page can turn bad after
 * approval). A dangerous one stops working at once (/go shows a warning) and
 * becomes a report for the moderators.
 */
export async function recheckActiveLinks(sql: Sql, limit = 2000): Promise<{ checked: number; flagged: number }> {
  if (linkCheckProvider() === "none") return { checked: 0, flagged: 0 };
  const rows = await sql<{ rental_id: string; no: number; content_id: string; url: string }[]>`
    select r.id as rental_id, r.no, c.id as content_id, c.url
    from rentals r join content_versions c on c.id = r.active_content_id
    where rental_is_displayed(r.status, r.hidden_at, r.active_content_id) and c.url is not null and c.link_flagged_at is null
    order by r.no
    limit ${limit}
  `;
  let flagged = 0;
  for (const row of rows) {
    const link = await checkLink(row.url);
    if (link.reputation?.status !== "flagged") continue;
    flagged++;
    await sql.begin(async (tx) => {
      await tx`update content_versions set link_flagged_at = now() where id = ${row.content_id}`;
      await tx`
        insert into reports (rental_id, rental_no, content_id, category, description, source)
        values (${row.rental_id}, ${row.no}, ${row.content_id}, 'link',
                ${`Automatic daily check: ${link.reputation?.threats.join(", ") ?? ""} (${link.finalUrl ?? row.url})`}, 'system')
      `;
    });
  }
  return { checked: rows.length, flagged };
}
