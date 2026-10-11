"use client";

import { useEffect, useRef } from "react";

/**
 * The content drawn into its neighbourhood on the current wall, enlarged
 * with sharp pixels, so the moderator sees it as visitors will.
 */
export function InWallPreview({
  src,
  rect,
  blockSize,
  wallImage,
  cols,
  rows,
  maxWidth = 360,
}: {
  src: string;
  rect: { x: number; y: number; w: number; h: number };
  blockSize: number;
  wallImage: string | null;
  cols: number;
  rows: number;
  maxWidth?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const margin = Math.max(4, Math.ceil(Math.max(rect.w, rect.h) * 0.6));
    const area = {
      x: Math.max(0, rect.x - margin),
      y: Math.max(0, rect.y - margin),
      x1: Math.min(cols, rect.x + rect.w + margin),
      y1: Math.min(rows, rect.y + rect.h + margin),
    };
    const srcW = (area.x1 - area.x) * blockSize;
    const srcH = (area.y1 - area.y) * blockSize;
    const scale = srcW <= maxWidth ? Math.max(1, Math.floor(maxWidth / srcW)) : maxWidth / srcW;
    canvas.width = Math.round(srcW * scale);
    canvas.height = Math.round(srcH * scale);
    canvas.style.width = `${canvas.width}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#f4f4f4";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let cancelled = false;
    const content = new Image();
    const drawContent = () => {
      if (cancelled) return;
      const dx = (rect.x - area.x) * blockSize * scale;
      const dy = (rect.y - area.y) * blockSize * scale;
      ctx.drawImage(content, dx, dy, rect.w * blockSize * scale, rect.h * blockSize * scale);
      ctx.strokeStyle = "#e03131";
      ctx.lineWidth = 2;
      ctx.strokeRect(dx - 1, dy - 1, rect.w * blockSize * scale + 2, rect.h * blockSize * scale + 2);
    };
    content.onload = () => {
      if (!wallImage) return drawContent();
      const wall = new Image();
      wall.onload = () => {
        if (cancelled) return;
        ctx.drawImage(wall, area.x * blockSize, area.y * blockSize, srcW, srcH, 0, 0, canvas.width, canvas.height);
        drawContent();
      };
      wall.onerror = drawContent;
      wall.src = wallImage;
    };
    content.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, rect.x, rect.y, rect.w, rect.h, blockSize, wallImage, cols, rows, maxWidth]);

  return <canvas ref={ref} className="in-wall-preview" />;
}
