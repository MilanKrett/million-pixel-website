import { cacheLife } from "next/cache";

/** The current year, refreshed daily (cached so the footer can stay static). */
export async function CurrentYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}
