import { glyph, GLYPH_ADVANCE, GLYPH_HEIGHT, GLYPH_WIDTH } from "@/lib/pixel-font";

/** Text drawn with the site's 5 × 7 pixel font as a crisp SVG (decoration, e.g. the 404 page). */
export function PixelText({ text, scale = 8, color = "#999999", className }: { text: string; scale?: number; color?: string; className?: string }) {
  const chars = [...text];
  const width = Math.max(1, chars.length * GLYPH_ADVANCE - (GLYPH_ADVANCE - GLYPH_WIDTH));
  const rects: React.ReactNode[] = [];
  chars.forEach((ch, i) =>
    glyph(ch).forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) rects.push(<rect key={`${i}-${x}-${y}`} x={i * GLYPH_ADVANCE + x} y={y} width={1} height={1} />);
      }),
    ),
  );
  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${GLYPH_HEIGHT}`}
      width={width * scale}
      height={GLYPH_HEIGHT * scale}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <g fill={color}>{rects}</g>
    </svg>
  );
}
