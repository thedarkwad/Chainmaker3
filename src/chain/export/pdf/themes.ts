import { StyleSheet } from "@react-pdf/renderer";
import type { PdfColorTheme, PdfFont } from "../types";

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

const COLORS: Record<PdfColorTheme, ColorPalette> = {
  "blue-light": {
    bg: "#eef4ff",
    text: "#1a1a1a",
    muted: "#6b7280",
    accent: "#2563eb",
    accentSubtle: "#374151",
    border: "#bfdbfe",
    cost: "#4b5563",
  },
  "red-light": {
    bg: "#fff5f5",
    text: "#1a1a1a",
    muted: "#6b7280",
    accent: "#dc2626",
    accentSubtle: "#374151",
    border: "#fecaca",
    cost: "#4b5563",
  },
  "blue-dark": {
    // Cool grey dark
    bg: "#111827",
    text: "#e5e7eb",
    muted: "#9ca3af",
    accent: "#818cf8",
    accentSubtle: "#c7d2fe",
    border: "#374151",
    cost: "#c7d2fe",
  },
  "red-dark": {
    // Warm grey dark
    bg: "#1c1210",
    text: "#f0e8e8",
    muted: "#b0928e",
    accent: "#f87171",
    accentSubtle: "#fca5a5",
    border: "#3d2a28",
    cost: "#fca5a5",
  },
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
  "sans-serif": { regular: "Helvetica", bold: "Helvetica-Bold", baseFontSize: 10 },
  "serif":      { regular: "Times-Roman", bold: "Times-Bold", baseFontSize: 10 },
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

export const THEMES: Record<PdfColorTheme, Record<PdfFont, ThemeShape>> = {
  "blue-light":    { "sans-serif": buildTheme(COLORS["blue-light"], FONTS["sans-serif"]),    "serif": buildTheme(COLORS["blue-light"], FONTS["serif"]),    "mono": buildTheme(COLORS["blue-light"], FONTS["mono"]) },
  "red-light":     { "sans-serif": buildTheme(COLORS["red-light"], FONTS["sans-serif"]),     "serif": buildTheme(COLORS["red-light"], FONTS["serif"]),     "mono": buildTheme(COLORS["red-light"], FONTS["mono"]) },
  "blue-dark":     { "sans-serif": buildTheme(COLORS["blue-dark"], FONTS["sans-serif"]),     "serif": buildTheme(COLORS["blue-dark"], FONTS["serif"]),     "mono": buildTheme(COLORS["blue-dark"], FONTS["mono"]) },
  "red-dark":      { "sans-serif": buildTheme(COLORS["red-dark"], FONTS["sans-serif"]),      "serif": buildTheme(COLORS["red-dark"], FONTS["serif"]),      "mono": buildTheme(COLORS["red-dark"], FONTS["mono"]) },
  "paper":         { "sans-serif": buildTheme(COLORS["paper"], FONTS["sans-serif"]),         "serif": buildTheme(COLORS["paper"], FONTS["serif"]),         "mono": buildTheme(COLORS["paper"], FONTS["mono"]) },
  "black-and-white": { "sans-serif": buildTheme(COLORS["black-and-white"], FONTS["sans-serif"]), "serif": buildTheme(COLORS["black-and-white"], FONTS["serif"]), "mono": buildTheme(COLORS["black-and-white"], FONTS["mono"]) },
};
