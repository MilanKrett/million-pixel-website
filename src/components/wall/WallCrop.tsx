import type { Rect } from "@/lib/geometry";

/**
 * A piece of the current wall image (a rental's place), cut out with CSS:
 * no extra download, and exactly what the wall shows. Small places are
 * enlarged in whole steps so the pixels stay sharp squares.
 */
export function WallCrop({
  image,
  wallWidth,
  wallHeight,
  block,
  rect,
  max = 120,
  label,
}: {
  image: string | null;
  wallWidth: number;
  wallHeight: number;
  block: number;
  rect: Rect;
  max?: number;
  label: string;
}) {
  const w = rect.w * block;
  const h = rect.h * block;
  const largest = Math.max(w, h);
  const scale = largest <= max ? Math.max(1, Math.floor(max / largest)) : max / largest;
  return (
    <span
      className="wall-crop"
      role="img"
      aria-label={label}
      style={{
        width: Math.max(1, Math.round(w * scale)),
        height: Math.max(1, Math.round(h * scale)),
        backgroundImage: image ? `url("${image}")` : undefined,
        backgroundSize: `${wallWidth * scale}px ${wallHeight * scale}px`,
        backgroundPosition: `${-rect.x * block * scale}px ${-rect.y * block * scale}px`,
      }}
    />
  );
}
