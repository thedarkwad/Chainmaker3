import { Duration } from "@/utilities/units";
import { Currency, OriginCategory, PurchaseSubtype } from "./Jump";
import { RewardType, SimpleValue, Value } from "./Purchase";
import { createId, Id, Lookup, Registry, TID } from "./types";

export type DocOriginCategory = OriginCategory & { max?: number } & (
    | { singleLine: true; options: FreeFormOrigin[] }
    | {
        singleLine: false;
        random?: { cost: SimpleValue<TID.Currency>; bounds?: PageRect[] };
      }
  );

export type AnnotationType = {
  "origin-category": { id: Id<TID.OriginCategory> };
  origin: { id: Id<TID.Origin> };
  "origin-option": { id: Id<TID.OriginCategory>; index: number };
  "origin-randomizer": { id: Id<TID.OriginCategory> };
  "currency-exchange": {
    docIndex: number;
    oCurrency: Id<TID.Currency>;
    tCurrency: Id<TID.Currency>;
    oamount: number;
    tamount: number;
  };
  purchase: { id: Id<TID.Purchase> };
  drawback: { id: Id<TID.Drawback> };
  scenarios: { id: Id<TID.Scenario> };
  companion: { id: Id<TID.Companion> };
};

export type Annotation<T extends keyof AnnotationType> = {
  rect: Rect;
  label: string;
  color: string;
} & {
  type: T;
} & AnnotationType[T];

//FullAnnotations, indexed by page; for use in chains
export type FullAnnotations = Record<
  number,
  {
    [K in keyof AnnotationType]: Annotation<K>;
  }[keyof AnnotationType][]
>;

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PageRect = Rect & {
  page: number;
};

export type OriginStipendEntry = {
  currency: Id<TID.Currency>;
  purchaseSubtype: Id<TID.PurchaseSubtype>;
  amount: number;
};

export type OriginTemplate = {
  name: string;
  id: Id<TID.Origin>;
  description?: string;
  choiceContext?: string;
  cost: SimpleValue<TID.Currency>;
  type: Id<TID.OriginCategory>;
  bounds?: PageRect[];
  /** Stipend entries granted to the character while this origin is held. */
  originStipend?: OriginStipendEntry[];

  /** Origins that affect the cost or availability of this choice. */
  synergies?: Id<TID.Origin>[];
  /** How a qualifying origin affects this choice: discounts it, makes it free, or restricts it to origin holders only. */
  synergyBenefit?: "discounted" | "free" | "access";
  prerequisites?: JumpDocPrerequisite[];
};

/** Prerequisite for an alternative cost — always "requires" semantics, no positive/negative distinction. */
export type AlternativeCostPrerequisite =
  | { type: "purchase"; id: Id<TID.Purchase> }
  | { type: "drawback"; id: Id<TID.Drawback> }
  | { type: "origin"; id: Id<TID.Origin> };

export type AlternativeCost = {
  value: Value<TID.Currency>;
  prerequisites: AlternativeCostPrerequisite[];
  beforeDiscounts?: boolean;
  mandatory: boolean;
  AND?: boolean;
};

export type JumpDocPrerequisite =
  | { type: "purchase"; id: Id<TID.Purchase>; positive: boolean }
  | { type: "drawback"; id: Id<TID.Drawback>; positive: boolean }
  | { type: "scenario"; id: Id<TID.Scenario>; positive: boolean }
  | { type: "origin"; id: Id<TID.Origin>; positive: boolean };

/** Alias for JumpDocPrerequisite — used by the purchase/drawback/companion/origin prerequisite editor. */
export type PurchasePrerequisite = JumpDocPrerequisite;

export type PurchaseTemplate<T extends TID> = {
  name: string;
  id: Id<T>;
  description: string;
  choiceContext?: string;
  cost: Value<TID.Currency>;
  allowMultiple: boolean;

  bounds?: PageRect[];

  /** Origins that affect the cost or availability of this import. */
  origins?: Id<TID.Origin>[];
  /** How a qualifying origin affects this import: discounts it, makes it free, or restricts it to origin holders only. */
  originBenefit?: "discounted" | "free" | "access";

  alternativeCosts?: AlternativeCost[];
  prerequisites?: JumpDocPrerequisite[];
};

/**
 * A single option within a singleLine origin category.
 *
 * `type: "freeform"` — the reader types their own value; `name` is unused.
 * `type: "template"` — the creator supplies a preset string in `name`, which
 *   may embed random placeholders resolved at runtime:
 *     - `${n-m}`   → random integer in the range [n, m]. Example: `${18-36}`
 *     - `${A|B|C}` → random pick from the listed options.  Example: `${Man|Woman}`
 *   These may be combined freely: `${18-36} Year-Old ${Man|Woman}`
 */
export type FreeFormOrigin = {
  name: string;
  type: "freeform" | "template";
  cost: SimpleValue<TID.Currency>;
  bounds?: PageRect[];
};

export type CompanionTemplate = Omit<
  PurchaseTemplate<TID.Companion>,
  "allowMultiple"
> & {
  allowances: Lookup<TID.Currency, number>;
  stipend: Lookup<TID.Currency, TID.PurchaseSubtype, number>;

  /** How many companions the player may take with this import. */
  count: number;

  specificCharacter: boolean;
  characterInfo?: {
    name: string;
    species: string;
    gender: string;
  }[];

  freebies?: (
    | { type: "origin"; id: Id<TID.Origin> }
    | { type: "purchase"; id: Id<TID.Purchase> }
    | { type: "drawback"; id: Id<TID.Drawback> }
  )[];
};

export type BasicPurchaseTemplate = PurchaseTemplate<TID.Purchase> & {
  capstoneBooster: boolean;
  boosted: {
    description: string;
    booster: number;
    boosterKind?: "purchase" | "drawback";
  }[];
  subtype: Id<TID.PurchaseSubtype>;
  temporary: boolean;
};

export type DrawbackDurationMod =
  | { type: "inc" | "set"; years: number }
  | { type: "choice" };

export type DrawbackTemplate = PurchaseTemplate<TID.Drawback> & {
  durationMod?: DrawbackDurationMod;
  boosted: {
    description: string;
    booster: number;
    boosterKind?: "purchase" | "drawback";
  }[];
  capstoneBooster?: boolean;
};

export type ScenarioRewardTemplate =
  | { type: RewardType.Currency; value: number; currency: Id<TID.Currency> }
  | { type: RewardType.Item | RewardType.Perk; id: Id<TID.Purchase> }
  | { type: RewardType.Companion; id: Id<TID.Companion> }
  | {
      type: RewardType.Stipend;
      value: number;
      currency: Id<TID.Currency>;
      subtype: Id<TID.PurchaseSubtype>;
    };

export type ScenarioTemplate = Omit<PurchaseTemplate<TID.Scenario>, "cost"> & {
  rewardGroups?: {
    rewards: ScenarioRewardTemplate[];
    title: string;
    context: string;
  }[];
  durationMod?: DrawbackDurationMod;
};

export type DocCurrencyExchange = {
  oCurrency: Id<TID.Currency>;
  tCurrency: Id<TID.Currency>;
  oamount: number;
  tamount: number;
  bounds?: PageRect[];

  sidebar?: boolean;
};

export type JumpDoc = {
  [x: string]: any;
  name: string;
  url: string;
  author: string;
  version?: string;

  duration: Duration;
  drawbackLimit?: number | null;
  originStipend?: SimpleValue;
  companionStipend?: SimpleValue;

  originCategories: Registry<TID.OriginCategory, DocOriginCategory>;

  origins: Registry<TID.Origin, OriginTemplate>;
  currencies: Registry<TID.Currency, Currency>;
  purchaseSubtypes: Registry<
    TID.PurchaseSubtype,
    PurchaseSubtype<TID.Currency>
  >;

  availableCurrencyExchanges?: DocCurrencyExchange[];

  availablePurchases: Registry<TID.Purchase, BasicPurchaseTemplate>;
  availableCompanions: Registry<TID.Companion, CompanionTemplate>;
  availableDrawbacks: Registry<TID.Drawback, DrawbackTemplate>;
  availableScenarios: Registry<TID.Scenario, ScenarioTemplate>;
};

export const stripTemplating = (s: string) => s.trim();

/**
 * Assigns `id` to any OriginTemplate entry that was loaded from JSON without one.
 * Call this once immediately after loading a JumpDoc from the network.
 */
export function preprocessJumpDoc(doc: JumpDoc): JumpDoc {
  for (const idStr in doc.origins.O) {
    const tid = createId<TID.Origin>(+idStr);
    const template = doc.origins.O[tid];
    if (template && !template.id) {
      template.id = tid;
    }
  }
  return doc;
}
