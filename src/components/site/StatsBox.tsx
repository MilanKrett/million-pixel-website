"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useFormatter, useLocale, useTranslations } from "use-intl/react";
import type { WallStats } from "@/lib/wall/snapshot";

const POLL_MS = 60_000;

// A clock that ticks every 30 s; null on the server so the HTML never depends on the time.
let clock = typeof window === "undefined" ? 0 : Date.now();
function subscribeClock(onChange: () => void) {
  const timer = window.setInterval(() => {
    clock = Date.now();
    onChange();
  }, 30_000);
  return () => window.clearInterval(timer);
}
const useNow = () =>
  useSyncExternalStore<number | null>(
    subscribeClock,
    () => clock,
    () => null,
  );

function relativeTime(iso: string, now: number, intlLocale: string, justNow: string): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  if (Math.abs(seconds) < 45) return justNow;
  const rtf = new Intl.RelativeTimeFormat(intlLocale, { numeric: "auto", style: "short" });
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(days, "day");
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return rtf.format(months, "month");
  return rtf.format(Math.round(days / 365), "year");
}

/** Counters in the header: rented / free pixels, last rental and a retro progress bar. */
export function StatsBox({ initial }: { initial: WallStats }) {
  const t = useTranslations("header");
  const format = useFormatter();
  const intlLocale = useLocale();
  const [stats, setStats] = useState(initial);
  const now = useNow();

  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        if (res.ok) setStats((await res.json()) as WallStats);
      } catch {
        // Keep the last values.
      }
    };
    const timer = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const share = stats.totalPixels > 0 ? stats.rentedPixels / stats.totalPixels : 0;
  const percent = format.number(share, { style: "percent", maximumFractionDigits: share > 0 && share < 0.1 ? 1 : 0 });
  // 20 segments, like an old progress bar; any rented pixel lights the first one.
  const segments = share > 0 ? Math.max(1, Math.round(share * 20)) : 0;

  return (
    <div className="stats" aria-label={t("statsLabel")} role="group">
      <div className="stats-row">
        {t("rented")}: <b>{format.number(stats.rentedPixels)}</b> <span className="sep">|</span> {t("free")}:{" "}
        <b>{format.number(stats.freePixels)}</b>
      </div>
      <div className="stats-row">
        {t("lastRental")}:{" "}
        <b>
          {stats.lastRentalAt
            ? now === null
              ? "…"
              : relativeTime(stats.lastRentalAt, now, intlLocale, t("justNow"))
            : t("lastRentalNone")}
        </b>
      </div>
      <div className="progress">
        <div
          className="progress-bar"
          role="progressbar"
          aria-label={t("progressLabel", { percent })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(share * 1000) / 10}
        >
          {Array.from({ length: 20 }, (_, i) => (
            <span key={i} className={i < segments ? "on" : undefined} />
          ))}
        </div>
        <span>{t("progress", { percent })}</span>
      </div>
    </div>
  );
}
