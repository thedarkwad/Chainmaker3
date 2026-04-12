import { Font, StyleSheet } from "@react-pdf/renderer";
import type { PdfColorTheme, PdfFont, ResolvedColorPalette } from "../types";

type StaticColorTheme = Exclude<PdfColorTheme, "app-theme">;

Font.register({
  family: "Fira Sans",
  fonts: [
    { src: "/fonts/Fira Sans/FiraSans-Regular.ttf", fontStyle: "normal" },
    { src: "/fonts/Fira Sans/FiraSans-Italic.ttf", fontStyle: "italic" },
  ],
});
Font.register({
  family: "Fira Sans Bold",
  src: "/fonts/Fira Sans/FiraSans-Bold.ttf",
});

Font.register({
  family: "Libre Baskerville",
  fonts: [
    { src: "/fonts/Libre Baskerville/LibreBaskerville-Regular.ttf", fontStyle: "normal" },
    { src: "/fonts/Libre Baskerville/LibreBaskerville-Italic.ttf", fontStyle: "italic" },
  ],
});
Font.register({
  family: "Libre Baskerville Bold",
  src: "/fonts/Libre Baskerville/LibreBaskerville-Bold.ttf",
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
    divider: { borderTopWidth: 1, borderTopColor: border, marginTop: 8, marginBottom: 8 },
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

export function getTheme(
  colorTheme: PdfColorTheme,
  font: PdfFont,
  resolvedPalette?: ResolvedColorPalette,
): ThemeShape {
  if (colorTheme === "app-theme") {
    return buildTheme(resolvedPalette ?? COLORS["paper"], FONTS[font]);
  }
  return THEMES[colorTheme][font];
}
