/** Empty wall frame of the final size, shown while the wall data streams in. */
export function WallPlaceholder() {
  return (
    <section className="wall" aria-busy="true">
      <div className="wall-frame" style={{ maxWidth: 1000 }}>
        <div className="wall-viewport" style={{ aspectRatio: "1 / 1" }} />
      </div>
      <div className="wall-toolbar wall-toolbar-placeholder" />
    </section>
  );
}
