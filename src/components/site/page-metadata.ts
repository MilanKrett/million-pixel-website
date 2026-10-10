import type { Metadata } from "next";
import { getTranslator } from "@/i18n/server";
import type { PageKey } from "./UnderConstruction";

export async function underConstructionMetadata(page: PageKey): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t(`pages.${page}`), robots: { index: false } };
}
