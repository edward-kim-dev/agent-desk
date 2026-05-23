import type { TextOptions } from "./types";

/**
 * 텍스트를 오프스크린 2D 캔버스에 그려서 halftone 텍스처로 쓸 수 있게 함.
 * 폰트가 늦게 로드되면 fallback 으로 첫 프레임이 다른 폰트로 그려질 수 있으니
 * 호출 전 `await document.fonts.ready` 권장.
 */
export function makeTextCanvas(text: string, opts: TextOptions = {}): HTMLCanvasElement {
  const family = opts.family ?? "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif";
  const size = opts.size ?? 200;
  const weight = opts.weight ?? 600;
  const letterSpacing = opts.letterSpacing ?? 0;
  const color = opts.color ?? "#000000";
  const background = opts.background ?? "#ffffff";
  const paddingX = opts.paddingX ?? Math.round(size * 0.18);
  const paddingY = opts.paddingY ?? Math.round(size * 0.22);

  // 측정용 임시 캔버스
  const tmp = document.createElement("canvas");
  const tctx = tmp.getContext("2d");
  if (!tctx) throw new Error("2d context unavailable");
  const fontDecl = `${weight} ${size}px ${family}`;
  tctx.font = fontDecl;

  // letter-spacing 적용한 폭 측정
  const chars = Array.from(text);
  const ls = letterSpacing * size;
  let totalWidth = 0;
  const widths = chars.map((ch) => tctx.measureText(ch).width);
  widths.forEach((w, i) => {
    totalWidth += w;
    if (i < widths.length - 1) totalWidth += ls;
  });

  const w = Math.ceil(totalWidth) + paddingX * 2;
  const h = Math.ceil(size * 1.25) + paddingY * 2;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");

  // 배경
  if (background !== "transparent") {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }

  // 텍스트
  ctx.fillStyle = color;
  ctx.font = fontDecl;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  let x = paddingX;
  const y = h / 2;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], x, y);
    x += widths[i] + ls;
  }

  return canvas;
}
