import { LOGO_SIZE, logoRects } from "@/lib/logo";

// The logo picture next to the site name: a tiny wall full of pixel ads (lib/logo.ts).
// 16 × 16 blocks drawn at a whole number of screen pixels per block, so it stays sharp.
const RECTS = logoRects();

export function LogoMark() {
  return (
    <svg
      className="logo-mark"
      width={LOGO_SIZE * 3}
      height={LOGO_SIZE * 3}
      viewBox={`0 0 ${LOGO_SIZE} ${LOGO_SIZE}`}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {RECTS.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
      ))}
    </svg>
  );
}
