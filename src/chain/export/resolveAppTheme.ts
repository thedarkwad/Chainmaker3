import type { ResolvedColorPalette } from "./types";

const _canvas = document.createElement("canvas");
_canvas.width = 1;
_canvas.height = 1;
const _ctx = _canvas.getContext("2d")!;

function resolveCSSVarToHex(varName: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  _ctx.clearRect(0, 0, 1, 1);
  _ctx.fillStyle = raw;
  _ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = _ctx.getImageData(0, 0, 1, 1).data;
  return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
}

export function resolveAppThemePalette(): ResolvedColorPalette {
  return {
    bg: resolveCSSVarToHex("--color-canvas"),
    text: resolveCSSVarToHex("--color-ink"),
    muted: resolveCSSVarToHex("--color-muted"),
    accent: resolveCSSVarToHex("--color-accent-ring"),
    accentSubtle: resolveCSSVarToHex("--color-ink"),
    border: resolveCSSVarToHex("--color-edge"),
    cost: resolveCSSVarToHex("--color-accent2"),
  };
}
