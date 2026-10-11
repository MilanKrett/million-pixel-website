"use client";

import { useEffect, useState } from "react";

/** mm:ss until a moment; calls onExpired once when it passes. */
export function Countdown({ until, onExpired }: { until: string | null; onExpired: () => void }) {
  const end = until ? new Date(until).getTime() : 0;
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!end) return;
    let fired = false;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (!fired && current >= end) {
        fired = true;
        onExpired();
      }
    };
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [end, onExpired]);

  if (!end || now === null) return <b className="countdown">–:––</b>;
  const left = Math.max(0, Math.round((end - now) / 1000));
  const text = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <b className={`countdown${left < 120 ? " is-low" : ""}`}>
      {text}
    </b>
  );
}
