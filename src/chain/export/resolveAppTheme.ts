import type { ThemeSetting } from "@/app/ThemeSetting";
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

function readCurrentPalette(): ResolvedColorPalette {
  return {
    bg:           resolveCSSVarToHex("--color-canvas"),
    text:         resolveCSSVarToHex("--color-ink"),
    muted:        resolveCSSVarToHex("--color-muted"),
    accent:       resolveCSSVarToHex("--color-accent-ring"),
    accentSubtle: resolveCSSVarToHex("--color-ink"),
    border:       resolveCSSVarToHex("--color-edge"),
    cost:         resolveCSSVarToHex("--color-accent2"),
  };
}

/**
 * Resolves the palette for any app theme by temporarily swapping the html
 * data-theme / data-dark attributes. The swap is synchronous so nothing repaints.
 */
export function resolveThemePalette(themeId: ThemeSetting, dark: boolean): ResolvedColorPalette {
  const html = document.documentElement;
  const prevTheme = html.getAttribute("data-theme");
  const prevDark = html.hasAttribute("data-dark");

  html.setAttribute("data-theme", themeId);
  if (dark) html.setAttribute("data-dark", "");
  else html.removeAttribute("data-dark");

  const palette = readCurrentPalette();

  if (prevTheme != null) html.setAttribute("data-theme", prevTheme);
  else html.removeAttribute("data-theme");
  if (prevDark) html.setAttribute("data-dark", "");
  else html.removeAttribute("data-dark");

  return palette;
}
