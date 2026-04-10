// ── Theme ─────────────────────────────────────────────────────────────────────

export const THEMES = [
  { id: "rose" as const, label: "Rose" }, // H≈10
  { id: "imperial" as const, label: "Crimson" }, // H≈248 navy + crimson
  { id: "hazard" as const, label: "Hazard" }, // H≈18
  { id: "autumn" as const, label: "Autumn" }, // H≈30
  { id: "desert-rose" as const, label: "Desert" }, // H≈28 sandy+rose
  { id: "copper" as const, label: "Copper" }, // H≈44
  { id: "toxic" as const, label: "Toxic" }, // H≈120
  { id: "emerald" as const, label: "Emerald" }, // H≈155
  { id: "seafoam" as const, label: "Seafoam" }, // H≈175
  { id: "neon" as const, label: "Neon" },
  { id: "arctic" as const, label: "Arctic" }, // H≈228
  { id: "indigo" as const, label: "Indigo" }, // H≈248
  { id: "azure" as const, label: "Azure" }, // H≈248 blue + gold
  { id: "void" as const, label: "Void" }, // H≈295
  { id: "faerie" as const, label: "Faerie" }, // H≈138
  { id: "mana" as const, label: "Mana" }, // H≈315
  { id: "rgb" as const, label: "RGB" }, // special
] as const;

export type ThemeSetting = (typeof THEMES)[number]["id"];
