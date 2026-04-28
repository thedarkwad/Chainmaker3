import { PossibleCost } from "../components/AnnotationInteractionHandler";
import { ImgData } from "./AltForm";
import { createId, GID, Id, LID, Lookup, PartialLookup, TID } from "./types";

export type StoredAltCostPrerequisite =
  | { type: "origin"; categoryName: string; originName: string }
  | { type: "drawback"; docId: string; templateId: Id<TID.Drawback> }
  | { type: "purchase"; docId: string; templateId: Id<TID.Purchase> };

/** Stored prerequisite for a BasicPurchase; used for cascade-removal when a required item is removed. */
export type StoredPurchasePrerequisite =
  | { type: "purchase"; docId: string; templateId: Id<TID.Purchase>; positive: boolean }
  | { type: "drawback"; docId: string; templateId: Id<TID.Drawback>; positive: boolean }
  | { type: "scenario"; docId: string; templateId: Id<TID.Scenario>; positive: boolean }
  | { type: "origin"; docId: string; templateId: Id<TID.Origin>; positive: boolean };

export type StoredAlternativeCost = {
  /** Resolved to LID currencies at add-time. */
  value: Value;
  /** OR semantics — any one satisfied is sufficient. */
  prerequisites: StoredAltCostPrerequisite[];
  mandatory: boolean;
  /** When true, origin discounts apply on top of this alt cost instead of being overridden by it. */
  beforeDiscounts?: boolean;
};

export const enum PurchaseType {
  Perk,
  Item,
  Companion,
  Drawback,
  Scenario,
  SupplementScenario,
  SupplementPerk,
  SupplementItem,
  ChainDrawback,
  SupplementImport,
  Subpurchase,
}

export const DefaultSubtype: Record<
  PurchaseType.Perk | PurchaseType.Item,
  Id<LID.PurchaseSubtype>
> = {
  [PurchaseType.Perk]: createId(0),
  [PurchaseType.Item]: createId(1),
};

export const enum CostModifier {
  Full,
  Reduced,
  Free,
  Custom,
}
export type ModifiedCost<T extends LID.Currency | TID.Currency = LID.Currency> =
  | { modifier: CostModifier.Full | CostModifier.Reduced | CostModifier.Free }
  | { modifier: CostModifier.Custom; modifiedTo: Value<T> | number };

export enum OverrideType {
  Enabled,
  Excluded,
  BoughtOffTemp,
  BoughtOffPermanent,
}

export type DrawbackOverride = {
  type: OverrideType;
  modifier?: ModifiedCost;
};

interface CompanionImportData {
  characters: Id<GID.Character>[];
  allowances: Lookup<LID.Currency, number>;
  stipend: Lookup<LID.Currency, LID.PurchaseSubtype, number>;
}

interface SupplementImportData {
  characters: Id<GID.Character>[];
  allowance: number;
  percentage: number;
}

export const enum RewardType {
  Currency,
  Item,
  Perk,
  Stipend,
  Note,
  Companion,
}

type BaseScenarioReward =
  | { type: RewardType.Item | RewardType.Perk; id: Id<TID.Purchase> }
  | { type: RewardType.Note; note: string }
  | { type: RewardType.Companion; id: Id<TID.Companion>; name: string };

export type ScenarioReward =
  | BaseScenarioReward
  | { type: RewardType.Currency; value: number; currency: Id<LID.Currency> }
  | {
      type: RewardType.Stipend;
      value: number;
      currency: Id<LID.Currency>;
      subtype: Id<LID.PurchaseSubtype>;
    };

export type SupplementScenarioReward =
  | BaseScenarioReward
  | { type: RewardType.Currency; value: number };

export type PurchaseGroup = {
  type: PurchaseType.Item | PurchaseType.Perk;
  name: string;
  description: string;
  components: Id<GID.Purchase>[];
};

export type SimpleValue<T extends LID.Currency | TID.Currency = LID.Currency> = {
  amount: number;
  currency: Id<T>;
};
export type Value<T extends LID.Currency | TID.Currency = LID.Currency> = SimpleValue<T>[];

export const simplifyValue: (v: Value) => Value = (v) => {
  let newValue: Value = [];
  for (let sv of v) {
    let relevantComponent = newValue.find((nv) => nv.currency == sv.currency);
    if (!relevantComponent) newValue.push(sv);
    else relevantComponent.amount += sv.amount;
  }
  return newValue;
};

export const enum CurrencyType {
  Jump,
  Supplement,
  Chain,
}

export type UniversalValue<T extends Value | SimpleValue = Value> =
  | { type: CurrencyType.Jump; value: T; jId: Id<GID.Jump> }
  | { type: CurrencyType.Supplement; value: number; suppId: Id<GID.Supplement> }
  | { type: CurrencyType.Chain; value: number };

export type UniversalSimpleValue = UniversalValue<SimpleValue>;

export const getCurrencyType = (p: PurchaseType) => {
  switch (p) {
    case PurchaseType.SupplementPerk:
    case PurchaseType.SupplementItem:
    case PurchaseType.SupplementImport:
    case PurchaseType.SupplementScenario:
      return CurrencyType.Supplement;
    case PurchaseType.ChainDrawback:
      return CurrencyType.Chain;
    default:
      return CurrencyType.Jump;
  }
};

export type AbstractPurchase = {
  id: Id<GID.Purchase>;
  charId: Id<GID.Character>;

  name: string;
  description: string;

  type: PurchaseType;
  duration?: number;

  cost: ModifiedCost;
  value: Value | number;
};

export type JumpPurchase<T extends TID | unknown = unknown> = AbstractPurchase & {
  jumpId: Id<GID.Jump>;
  template?: { jumpdoc: string; id: T extends TID ? Id<T> : unknown; originalCost?: PossibleCost};
  boosts?: { purchaseId: Id<GID.Purchase>; description: string }[];
  value: Value;
};

export type SupplementPurchase = AbstractPurchase & {
  type: PurchaseType.SupplementPerk | PurchaseType.SupplementItem;
  categories: Id<GID.PurchaseCategory>[];
  tags: string[];

  jumpId: Id<GID.Jump>;
  value: number;

  supplement: Id<GID.Supplement>;
  purchaseGroup?: Id<GID.PurchaseGroup>;

  obsolete?: Id<GID.Jump>;
};

export type BasicPurchase = JumpPurchase<TID.Purchase | TID.Companion> & {
  type: PurchaseType.Item | PurchaseType.Perk;
  categories: Id<GID.PurchaseCategory>[];
  tags: string[];

  subtype: Id<LID.PurchaseSubtype>;
  usesFloatingDiscount?: boolean;

  purchaseGroup?: Id<GID.PurchaseGroup>;

  subpurchases?: {
    stipend: Value;
    list: Id<GID.Purchase>[];
  };

  reward?: Id<TID.Scenario>;
  freebie?: Id<TID.Companion>; 
  //TODO: freebie
  /** True when this item was added as a follower companion import (as opposed to a regular perk/item). */
  follower?: true;
};

export type Subpurchase = JumpPurchase & {
  type: PurchaseType.Subpurchase;
  parent: Id<GID.Purchase>;
};

export type Drawback = (
  | (JumpPurchase<TID.Drawback> & {
      type: PurchaseType.Drawback;
    })
  | (Omit<AbstractPurchase, "charId"> & { type: PurchaseType.ChainDrawback; value: number })
) & {
  itemStipend?: number;
  companionStipend?: number;

  stipend?: Id<TID.Origin>;
  //TODO: UI, initialization
  floatingDiscountThresholds?: PartialLookup<LID.PurchaseSubtype, SimpleValue<LID.Currency>[]>;
  /** User-chosen duration in years, for drawbacks with durationMod.type === "choice". */
  customDuration?: number;

  subtype?: Id<LID.PurchaseSubtype> | null;

  overrides: PartialLookup<GID.Jump, GID.Character, DrawbackOverride>;
};

export type Scenario = JumpPurchase<TID.Scenario> & {
  type: PurchaseType.Scenario;
  rewards: ScenarioReward[];
};

export type SupplementScenario = Omit<SupplementPurchase, "type"> & {
  type: PurchaseType.SupplementScenario;
  rewards: SupplementScenarioReward[];
};

export type CompanionImport = JumpPurchase<TID.Companion> & {
  type: PurchaseType.Companion;
  importData: CompanionImportData;
};

export type SupplementImport = AbstractPurchase & {
  type: PurchaseType.SupplementImport;
  importData: SupplementImportData;
  supplement: Id<GID.Supplement>;
  jumpId: Id<GID.Jump>;
  value: number;
};

export type Purchase =
  | BasicPurchase
  | Drawback
  | Scenario
  | SupplementScenario
  | SupplementPurchase
  | CompanionImport
  | SupplementImport
  | Subpurchase;

export const getUniversalSimpleValue = (p: Purchase): UniversalSimpleValue | undefined => {
  switch (p.type) {
    case PurchaseType.Scenario:
    case PurchaseType.SupplementScenario:
    case PurchaseType.Perk:
    case PurchaseType.Item:
    case PurchaseType.Companion:
    case PurchaseType.Subpurchase:
    case PurchaseType.Drawback:
      return undefined;
    case PurchaseType.ChainDrawback:
      return { type: CurrencyType.Chain, value: p.value };
    case PurchaseType.SupplementPerk:
    case PurchaseType.SupplementItem:
    case PurchaseType.SupplementImport:
      return { type: CurrencyType.Supplement, value: p.value, suppId: p.supplement };
  }
};

export function purchaseValue<T extends TID.Currency | LID.Currency = LID.Currency>(
  value: Value<T>,
  mod: ModifiedCost<T>,
): Value<T>;

export function purchaseValue<T extends TID.Currency | LID.Currency = LID.Currency>(
  value: number,
  mod: ModifiedCost<T>,
): number;

export function purchaseValue<T extends TID.Currency | LID.Currency = LID.Currency>(
  value: Value<T> | number,
  mod: ModifiedCost<T>,
): Value<T> | number {
  switch (mod.modifier) {
    case CostModifier.Full:
      return value;
    case CostModifier.Reduced:
      return typeof value == "object"
        ? value.map((val) => ({
            amount: Math.min(val.amount, Math.floor(val.amount / 2)),
            currency: val.currency,
          }))
        : value / 2;
    case CostModifier.Free:
      return typeof value == "object"
        ? value.map((val) => ({
            amount: Math.min(val.amount, 0),
            currency: val.currency,
          }))
        : 0;
    case CostModifier.Custom:
      return mod.modifiedTo;
  }
};
