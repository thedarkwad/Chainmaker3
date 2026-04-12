import type { GID, Id } from "@/chain/data/types";

// ─────────────────────────────────────────────────────────────────────────────
// Export Options
// ─────────────────────────────────────────────────────────────────────────────

export type ExportScope =
  | { kind: "chain" }
  | { kind: "jump"; jumpId: Id<GID.Jump> }
  | { kind: "purchase-list" };

export type ExportFormat = "markdown" | "bbcode" | "pdf";

export type PdfColorTheme = "app-theme" | "paper" | "black-and-white";
export type PdfFont = "sans-serif" | "serif" | "mono";

export type ExportSections = {
  costs: boolean;
  descriptions: boolean;
  origins: boolean;
  narrative: boolean;
  notes: boolean;
  companions: boolean;
  altForms: boolean;
  drawbacks: boolean;
  scenarios: boolean;
  /** "all" = show every supplement; string[] = only the named supplements */
  supplements: string[] | "all";
  budget: boolean;
};

/** Resolved hex-color palette for the "app-theme" PDF option, read from CSS vars on the main thread. */
export type ResolvedColorPalette = {
  bg: string;
  text: string;
  muted: string;
  accent: string;
  accentSubtle: string;
  border: string;
  cost: string;
};

export type ExportOptions = {
  scope: ExportScope;
  characterId: Id<GID.Character>;
  sections: ExportSections;
  pdfColorTheme: PdfColorTheme;
  pdfFont: PdfFont;
  resolvedAppThemePalette?: ResolvedColorPalette;
};

export const DEFAULT_SECTIONS: ExportSections = {
  costs: true,
  descriptions: true,
  origins: true,
  narrative: true,
  notes: true,
  companions: true,
  altForms: true,
  drawbacks: true,
  scenarios: true,
  supplements: "all",
  budget: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Intermediate Representation
// ─────────────────────────────────────────────────────────────────────────────

export type IRCost = {
  display: string;
  raw: number;
  currencyAbbrev: string;
};

export type IRPurchase = {
  name: string;
  description: string;
  cost: IRCost | null;
  subpurchases: IRPurchase[];
};

export type IRPurchaseSection = {
  heading: string;
  purchases: IRPurchase[];
};

export type IRDrawback = {
  name: string;
  description: string;
  cost: IRCost | null;
  isRetained: boolean;
  isChainDrawback: boolean;
};

export type IROrigin = {
  categoryName: string;
  summary: string;
  description: string;
  cost: IRCost | null;
};

export type IRNarrative = {
  goals: string;
  challenges: string;
  accomplishments: string;
};

export type IRScenario = {
  name: string;
  description: string;
  rewards: string[];
};

export type IRSupplementSection = {
  name: string;
  currencyName: string;
  /** Remaining budget + sum of purchase costs = pre-purchase starting budget */
  prePurchaseBudget: number | null;
  investment: number | null;
  investmentCurrencyAbbrev: string | null;
  perks: IRPurchase[];
  items: IRPurchase[];
};

export type IRCompanionImport = {
  name: string;
  characterNames: string[];
  cost: IRCost | null;
};

export type IRAltForm = {
  name: string;
  species: string;
  physicalDescription: string;
  capabilities: string;
  imageUrl: string | null;
};

export type IRBudgetEntry = {
  currencyAbbrev: string;
  amount: number; // positive = gain/income, negative = spend
};

export type IRBudgetSection = {
  label: string;
  entries: IRBudgetEntry[];
};

export type IRBudgetSummary = {
  sections: IRBudgetSection[];
  totals: IRBudgetEntry[];
};

export type IRJump = {
  jumpName: string;
  jumpNumber: number;
  duration: string;
  sourceUrl: string | null;
  startingPoints: IRBudgetEntry[] | null;
  bankDeposit: IRBudgetEntry | null;
  origins: IROrigin[];
  perkSections: IRPurchaseSection[];
  itemSections: IRPurchaseSection[];
  companions: IRCompanionImport[];
  drawbacks: IRDrawback[];
  scenarios: IRScenario[];
  supplements: IRSupplementSection[];
  narrative: IRNarrative | null;
  notes: string;
  altForms: IRAltForm[];
  budget: IRBudgetSummary | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Purchase List
// ─────────────────────────────────────────────────────────────────────────────

export type PurchaseListGroupBy = "category" | "tag" | "none";

export type PurchaseListContent = "both" | "perks" | "items";

export type PurchaseListOptions = {
  content: PurchaseListContent;
  groupBy: PurchaseListGroupBy;
  showJump: boolean;
};

export const DEFAULT_PURCHASE_LIST_OPTIONS: PurchaseListOptions = {
  content: "both",
  groupBy: "category",
  showJump: true,
};

export type IRPurchaseListEntry = {
  name: string;
  description: string;
  jumpName: string | null;
  subpurchases: IRPurchaseListEntry[];
};

export type IRPurchaseListGroup = {
  heading: string;
  entries: IRPurchaseListEntry[];
};

export type IRPurchaseListExport = {
  chainName: string;
  characterName: string;
  exportedAt: string;
  contentLabel: string;
  groups: IRPurchaseListGroup[];
};

export type ExportIR = {
  chainName: string;
  characterName: string;
  exportedAt: string;
  isSingleJump: boolean;
  jumps: IRJump[];
};

// ─────────────────────────────────────────────────────────────────────────────
// PDF Worker
// ─────────────────────────────────────────────────────────────────────────────

/** Serialisable input sent to the PDF web worker. */
export type PdfWorkerInput =
  | { kind: "chain"; ir: ExportIR; options: ExportOptions }
  | { kind: "purchase-list"; ir: IRPurchaseListExport; pdfColorTheme: PdfColorTheme; pdfFont: PdfFont; resolvedAppThemePalette?: ResolvedColorPalette };
