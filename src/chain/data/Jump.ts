import { Duration } from "@/utilities/units";
import { PurchaseType, SimpleValue, Value } from "./Purchase";
import { createId, GID, Id, LID, PartialIndex, PartialLookup, Registry, TID } from "./types";

/** The default (primary) currency ID — always key 0 in a jump's currency registry. */
export const DEFAULT_CURRENCY_ID = createId<LID.Currency>(0);

export enum JumpSourceType {
  Unknown,
  URL,
  Jumpdoc,
}

export type JumpSource =
  | { type: JumpSourceType.Unknown }
  | { type: JumpSourceType.URL; URL: string }
  | { type: JumpSourceType.Jumpdoc; docId: string };

export interface Currency {
  name: string;
  abbrev: string;
  budget: number;
  essential: boolean;
  /** JumpDoc-only: purchases discounted to ≤ this amount become free. */
  discountFreeThreshold?: number;
}

export interface CurrencyExchange {
  oCurrency: Id<LID.Currency>;
  tCurrency: Id<LID.Currency>;
  oamount: number;
  tamount: number;
  /** Index into the JumpDoc's availableCurrencyExchanges array this was created from. */
  templateIndex?: number;
}

export interface OriginCategory {
  name: string;
  singleLine: boolean;
  multiple: boolean;
  default?: string;
  /** When true (and singleLine is false), origins in this category discount purchases. */
  providesDiscounts?: boolean;
  floatingDiscounts?: { currency: Id<LID.Currency>; thresholds: number[] };
}

export type SubtypePlacement = "normal" | "route" | "section";

export interface PurchaseSubtype<T extends LID.Currency | TID.Currency = LID.Currency> {
  name: string;
  stipend: Value<T>;
  type: PurchaseType.Item | PurchaseType.Perk;
  essential: boolean;
  allowSubpurchases: boolean;
  placement: SubtypePlacement;
  floatingDiscountThresholds?: SimpleValue<T>[];
  /**
   * JumpDoc-only: how floating discounts are granted.
   * - "free"   — any purchase in this subtype may use a floating discount.
   * - "origin" — a qualifying origin is required to use a floating discount.
   * Defaults to "free" when absent.
   */
  floatingDiscountMode?: "free" | "origin";
  /** JumpDoc-only: preferred currency to focus when opening a cost editor. */
  defaultCurrency?: Id<TID.Currency>;
}

export interface Origin {
  value: SimpleValue;
  summary: string;
  /** Raw template name (with ${…} placeholders) when it differs from summary. Used for matching
   *  when the user resolved placeholders at pick-time, so summary no longer equals the doc name. */
  templateName?: string;
  description?: string;
  /** Original cost before synergy modification; present when the origin has synergy origins. */
  baseCost?: SimpleValue;
  /** Resolved synergy origin references (name + category name) stored at add-time. */
  synergyOrigins?: { categoryName: string; originName: string }[];
  /** How a qualifying synergy origin affects this origin's cost or access. */
  synergyBenefit?: "discounted" | "free" | "access";
}

export interface NarrativeBlurb {
  goals: string;
  challenges: string;
  accomplishments: string;
}

export type Jump = {
  name: string;
  source: JumpSource;

  id: Id<GID.Jump>;
  parentJump?: Id<GID.Jump>;
  duration: Duration;

  drawbackLimit?: number | null;
  originStipend?: SimpleValue;
  companionStipend?: SimpleValue;

  originCategories: Registry<LID.OriginCategory, OriginCategory>;
  currencies: Registry<LID.Currency, Currency>;
  purchaseSubtypes: Registry<LID.PurchaseSubtype, PurchaseSubtype>;

  characters: Id<GID.Character>[];
  purchases: PartialIndex<GID.Character, GID.Purchase>;
  drawbacks: PartialIndex<GID.Character, GID.Purchase>;
  scenarios: PartialIndex<GID.Character, GID.Purchase>;

  bankDeposits: PartialLookup<GID.Character, number>;
  currencyExchanges: PartialLookup<GID.Character, CurrencyExchange[]>;

  supplementPurchases: PartialLookup<GID.Character, GID.Supplement, Id<GID.Purchase>[]>;
  supplementInvestments: PartialLookup<GID.Character, GID.Supplement, number>;

  notes: PartialLookup<GID.Character, string>;
  narratives: PartialLookup<GID.Character, NarrativeBlurb>;
  origins: PartialLookup<GID.Character, LID.OriginCategory, Origin[]>;
  altForms: PartialIndex<GID.Character, GID.AltForm>;

  useSupplements: boolean;
  useNarrative: boolean;
  useAltForms: boolean;

  obsoletions: Id<GID.Purchase>[];
};
