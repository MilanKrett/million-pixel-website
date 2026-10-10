// A tiny 4 × 4 "wall" of coloured pixels next to the site name.
const COLORS = [
  "#e8590c", "#f4f4f4", "#1971c2", "#2f9e44",
  "#f4f4f4", "#f59f00", "#e8590c", "#f4f4f4",
  "#7048e8", "#e8590c", "#f4f4f4", "#1971c2",
  "#2f9e44", "#f4f4f4", "#f59f00", "#e8590c",
];

export function LogoMark() {
  return (
    <svg className="logo-mark" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" shapeRendering="crispEdges">
      <rect x="0" y="0" width="32" height="32" fill="#ffffff" />
      {COLORS.map((fill, i) => (
        <rect key={i} x={(i % 4) * 8} y={Math.floor(i / 4) * 8} width="8" height="8" fill={fill} />
      ))}
      <rect x="0.5" y="0.5" width="31" height="31" fill="none" stroke="#cccccc" />
    </svg>
  );
}
