import { Font, StyleSheet } from "@react-pdf/renderer";
import type { PdfColorTheme, PdfFont, ResolvedColorPalette } from "../types";

type StaticColorTheme = "paper" | "black-and-white";

Font.register({
  family: "Fira Sans",
  fonts: [
    { src: "/fonts/Fira%20Sans/FiraSans-Regular.ttf", fontStyle: "normal" },
    { src: "/fonts/Fira%20Sans/FiraSans-Italic.ttf", fontStyle: "italic" },
  ],
});
Font.register({
  family: "Fira Sans Bold",
  src: "/fonts/Fira%20Sans/FiraSans-Bold.ttf",
});

Font.register({
  family: "Libre Baskerville",
  fonts: [
    { src: "/fonts/Libre%20Baskerville/LibreBaskerville-Regular.ttf", fontStyle: "normal" },
    { src: "/fonts/Libre%20Baskerville/LibreBaskerville-Italic.ttf", fontStyle: "italic" },
  ],
});
Font.register({
  family: "Libre Baskerville Bold",
  src: "/fonts/Libre%20Baskerville/LibreBaskerville-Bold.ttf",
});

// All @react-pdf/renderer styles must use numeric values, not Tailwind classes.

// ─────────────────────────────────────────────────────────────────────────────
// Color palettes
// ─────────────────────────────────────────────────────────────────────────────

type ColorPalette = {
  bg: string;
  text: string;
  muted: string;
  accent: string;
  accentSubtle: string;
  border: string;
  cost: string;
};

const COLORS: Record<StaticColorTheme, ColorPalette> = {
  "paper": {
    bg: "#fdf8f0",
    text: "#2d1b00",
    muted: "#78350f",
    accent: "#92400e",
    accentSubtle: "#78350f",
    border: "#d4a76a",
    cost: "#92400e",
  },
  "black-and-white": {
    bg: "#ffffff",
    text: "#000000",
    muted: "#555555",
    accent: "#000000",
    accentSubtle: "#222222",
    border: "#000000",
    cost: "#333333",
  },
};

const DARK_COLORS: Record<StaticColorTheme, ColorPalette> = {
  "paper": {
    bg: "#1a1108",
    text: "#f0e4c8",
    muted: "#b88c5a",
    accent: "#d4a76a",
    accentSubtle: "#c4956a",
    border: "#4a3218",
    cost: "#d4a76a",
  },
  "black-and-white": {
    bg: "#000000",
    text: "#ffffff",
    muted: "#aaaaaa",
    accent: "#ffffff",
    accentSubtle: "#dddddd",
    border: "#666666",
    cost: "#cccccc",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Font configs
// ─────────────────────────────────────────────────────────────────────────────

type FontConfig = {
  regular: string;
  bold: string;
  baseFontSize: number;
};

const FONTS: Record<PdfFont, FontConfig> = {
  "sans-serif": { regular: "Fira Sans", bold: "Fira Sans Bold", baseFontSize: 10 },
  "serif":      { regular: "Libre Baskerville", bold: "Libre Baskerville Bold", baseFontSize: 10 },
  "mono":       { regular: "Courier", bold: "Courier-Bold", baseFontSize: 9 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Theme builder
// ─────────────────────────────────────────────────────────────────────────────

function buildTheme(color: ColorPalette, font: FontConfig) {
  const { bg, text, muted, accent, accentSubtle, border, cost } = color;
  const { regular, bold, baseFontSize: fs } = font;

  return StyleSheet.create({
    page: {
      fontFamily: regular,
      fontSize: fs,
      color: text,
      backgroundColor: bg,
      paddingTop: 40,
      paddingBottom: 40,
      paddingLeft: 50,
      paddingRight: 50,
      lineHeight: 1.5,
    },
    h1: { fontSize: fs + 10, fontFamily: bold, marginBottom: 4, color: text },
    h2: {
      fontSize: fs + 5,
      fontFamily: bold,
      marginBottom: 3,
      marginTop: 12,
      color: accent,
    },
    h3: { fontSize: fs + 1, fontFamily: bold, marginBottom: 2, marginTop: 8, color: accentSubtle },
    subtitle: { fontSize: fs - 1, color: muted, marginBottom: 8 },
    body: { fontSize: fs, color: text, marginBottom: 2 },
    muted: { fontSize: fs - 1, color: muted },
    listItem: { fontSize: fs, color: text, marginBottom: 3, marginLeft: 10 },
    bullet: { marginRight: 4, color: muted },
    name: { fontFamily: bold },
    cost: { color: cost },
    tag: { color: muted, fontStyle: "italic" },
    divider: { borderTopWidth: 1, borderTopColor: accent, marginTop: 8, marginBottom: 8, opacity: 0.5 },
    narrative: {
      borderLeftWidth: 2,
      borderLeftColor: accent,
      paddingLeft: 8,
      marginTop: 4,
      marginBottom: 4,
      color: accentSubtle,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

type ThemeShape = ReturnType<typeof buildTheme>;

export type Theme = ThemeShape;

export const THEMES: Record<StaticColorTheme, Record<PdfFont, ThemeShape>> = {
  "paper":           { "sans-serif": buildTheme(COLORS["paper"], FONTS["sans-serif"]),           "serif": buildTheme(COLORS["paper"], FONTS["serif"]),           "mono": buildTheme(COLORS["paper"], FONTS["mono"]) },
  "black-and-white": { "sans-serif": buildTheme(COLORS["black-and-white"], FONTS["sans-serif"]), "serif": buildTheme(COLORS["black-and-white"], FONTS["serif"]), "mono": buildTheme(COLORS["black-and-white"], FONTS["mono"]) },
};

export const STATIC_THEMES = new Set<string>(["paper", "black-and-white"]);

/**
 * Returns the theme for the given color/font combination.
 * Static themes ("paper", "black-and-white") are looked up from THEMES.
 * App themes use the resolved CSS palette passed in from the main thread.
 * Falls back to paper if the palette is missing (should not happen in practice).
 */
export function getTheme(
  colorTheme: PdfColorTheme,
  font: PdfFont,
  resolvedPalette?: ResolvedColorPalette,
  dark?: boolean,
): ThemeShape {
  if (STATIC_THEMES.has(colorTheme)) {
    const key = colorTheme as StaticColorTheme;
    return buildTheme(dark ? DARK_COLORS[key] : COLORS[key], FONTS[font]);
  }
  return buildTheme(resolvedPalette ?? COLORS["paper"], FONTS[font]);
}
