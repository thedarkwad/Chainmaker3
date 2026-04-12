import { Chain } from "./Chain";
import { Character } from "./Character";
import { AltForm, LengthUnit, WeightUnit } from "./AltForm";
import { Currency, Jump, JumpSource, JumpSourceType, OriginCategory, PurchaseSubtype } from "./Jump";
import { type JumpDoc } from "./JumpDoc";
import { DefaultSubtype, PurchaseType, SimpleValue } from "./Purchase";
import { createId, createRegistry, GID, Id, LID, Registry } from "./types";
import {
  BodyModPresets,
  DefaultBodyMods,
  DefaultPerkCategories,
  DefaultWarehouseMods,
  PerkCategoryPresets,
  WarehouseModPresets,
} from "./chainPresets";
import { ChainSupplement } from "./ChainSupplement";

export function jumpFromDoc(
  doc: JumpDoc,
  docPublicUid: string,
  jumpId: Id<GID.Jump>,
  defaultCP: number,
  ignoreDrawbackLimit: boolean,
): Jump {
  const currencies: Registry<LID.Currency, Currency> = {
    O: Object.fromEntries(
      Object.entries(doc.currencies.O).filter((e): e is [string, Currency] => e[1] != null),
    ),
    fId: createId<LID.Currency>(doc.currencies.fId),
  };
  const defaultCurrId = createId<LID.Currency>(0);
  const defaultCurr = currencies.O[defaultCurrId];
  if (defaultCurr && defaultCurr.budget === 1000) {
    currencies.O[defaultCurrId] = { ...defaultCurr, budget: +defaultCP || 0 };
  }

  const originCategories: Registry<LID.OriginCategory, OriginCategory> = {
    O: Object.fromEntries(
      Object.entries(doc.originCategories.O)
        .filter((e): e is [string, NonNullable<typeof e[1]>] => e[1] != null)
        .map(([k, v]) => [
          k,
          {
            name: v.name,
            singleLine: v.singleLine,
            multiple: v.multiple,
            ...(v.providesDiscounts ? { providesDiscounts: true } : {}),
          },
        ]),
    ),
    fId: createId<LID.OriginCategory>(doc.originCategories.fId),
  };

  const purchaseSubtypes: Registry<LID.PurchaseSubtype, PurchaseSubtype> = {
    O: Object.fromEntries(
      Object.entries(doc.purchaseSubtypes.O)
        .filter((e): e is [string, NonNullable<typeof e[1]>] => e[1] != null)
        .map(([k, v]) => [
          k,
          {
            ...v,
            placement: v.essential ? "normal" : "section",
            stipend: v.stipend.map((s) => ({
              amount: s.amount,
              currency: createId<LID.Currency>(s.currency),
            })),
            ...(v.floatingDiscountThresholds
              ? {
                  floatingDiscountThresholds: v.floatingDiscountThresholds.map((s) => ({
                    amount: s.amount,
                    currency: createId<LID.Currency>(s.currency),
                  })),
                }
              : {}),
          },
        ]),
    ),
    fId: createId<LID.PurchaseSubtype>(doc.purchaseSubtypes.fId),
  };

  return {
    id: jumpId,
    name: doc.name,
    source: { type: JumpSourceType.Jumpdoc, docId: docPublicUid },
    duration: doc.duration,
    originCategories,
    currencies,
    purchaseSubtypes,
    characters: [],
    purchases: {},
    drawbacks: {},
    scenarios: {},
    bankDeposits: {},
    currencyExchanges: {},
    supplementPurchases: {},
    supplementInvestments: {},
    notes: {},
    narratives: {},
    origins: {},
    altForms: {},
    companionStipend: doc.companionStipend as SimpleValue,
    originStipend: doc.originStipend as SimpleValue,
    useSupplements: true,
    useNarrative: true,
    useAltForms: true,
    obsoletions: [],
    drawbackLimit: ignoreDrawbackLimit ? undefined : doc.drawbackLimit,
  };
}

/**
 * Builds a new jump with standard default currencies, origin categories, and purchase
 * subtypes. Used by both new-chain creation (URL/unknown source) and useAddJump so the
 * initialization logic is never duplicated.
 */
export function jumpWithDefaults(
  jumpId: Id<GID.Jump>,
  name: string,
  source: JumpSource,
  defaultCP: number,
): Jump {
  const cpId = createId<LID.Currency>(0);
  const perkId = DefaultSubtype[PurchaseType.Perk]; // 0
  const itemId = DefaultSubtype[PurchaseType.Item]; // 1

  const originCategories: Registry<LID.OriginCategory, OriginCategory> = {
    O: {
      0: { name: "Age", singleLine: true, multiple: false },
      1: { name: "Gender", singleLine: true, multiple: false },
      2: { name: "Location", singleLine: false, multiple: false },
      3: { name: "Origin", singleLine: false, multiple: false },
    } as Record<Id<LID.OriginCategory>, OriginCategory>,
    fId: createId<LID.OriginCategory>(4),
  };

  const currencies: Registry<LID.Currency, Currency> = {
    O: {
      [cpId as number]: {
        name: "Choice Points",
        abbrev: "CP",
        budget: +defaultCP || 0,
        essential: true,
      },
    } as Record<Id<LID.Currency>, Currency>,
    fId: createId<LID.Currency>(1),
  };

  const purchaseSubtypes: Registry<LID.PurchaseSubtype, PurchaseSubtype> = {
    O: {
      [perkId as number]: {
        name: "Perk",
        type: PurchaseType.Perk,
        essential: true,
        allowSubpurchases: false,
        placement: "normal",
        stipend: [{ amount: 0, currency: cpId }],
      },
      [itemId as number]: {
        name: "Item",
        type: PurchaseType.Item,
        essential: true,
        allowSubpurchases: false,
        placement: "normal",
        stipend: [{ amount: 0, currency: cpId }],
      },
      2: {
        name: "Power",
        type: PurchaseType.Perk,
        essential: false,
        allowSubpurchases: false,
        placement: "normal",
        stipend: [{ amount: 0, currency: cpId }],
      },
    } as Record<Id<LID.PurchaseSubtype>, PurchaseSubtype>,
    fId: createId<LID.PurchaseSubtype>(3),
  };

  return {
    id: jumpId,
    name,
    source,
    duration: { days: 0, months: 0, years: 10 },
    originCategories,
    currencies,
    purchaseSubtypes,
    characters: [],
    purchases: {},
    drawbacks: {},
    scenarios: {},
    bankDeposits: {},
    currencyExchanges: {},
    supplementPurchases: {},
    supplementInvestments: {},
    notes: {},
    narratives: {},
    origins: {},
    altForms: {},
    useSupplements: true,
    useNarrative: true,
    useAltForms: true,
    obsoletions: [],
  };
}

export function buildNewChain({
  name,
  jumperName,
  jumpName = "Jump 1",
  jumpSource,
  doc,
  docPublicUid,
  bodyMod,
  warehouseMod,
  perkCategories,
}: {
  name: string;
  jumperName: string;
  jumpName?: string;
  jumpSource?: JumpSource;
  /** When provided, the first jump is seeded from this JumpDoc (same as useAddJumpFromDoc). */
  doc?: JumpDoc;
  docPublicUid?: string;
  bodyMod?: DefaultBodyMods;
  warehouseMod?: DefaultWarehouseMods;
  perkCategories?: DefaultPerkCategories;
}): Chain {
  const charId = createId<GID.Character>(0);
  const jumpId = createId<GID.Jump>(0);
  const altFormId = createId<GID.AltForm>(0);

  const altForm: AltForm = {
    id: altFormId,
    height: { value: 0, unit: LengthUnit.Feet },
    weight: { value: 0, unit: WeightUnit.Pounds },
    sex: "",
    name: jumperName,
    species: "Human",
    physicalDescription: "",
    capabilities: "",
  };

  const character: Character = {
    id: charId,
    name: jumperName,
    gender: "Mysterious",
    originalAge: 0,
    personality: {},
    background: { summary: "Typical Universe Denizen", description: "" },
    notes: "",
    primary: true,
    originalForm: altFormId,
  };

  const jump: Jump =
    doc && docPublicUid
      ? jumpFromDoc(doc, docPublicUid, jumpId, 1000, false)
      : jumpWithDefaults(
          jumpId,
          jumpName,
          jumpSource ?? { type: JumpSourceType.Unknown },
          1000,
        );

  // Build supplements
  const supplementEntries: [number, ChainSupplement][] = [];
  if (bodyMod) {
    const id = createId<GID.Supplement>(supplementEntries.length);
    supplementEntries.push([id as number, { ...BodyModPresets[bodyMod], id }]);
  }
  if (warehouseMod) {
    const id = createId<GID.Supplement>(supplementEntries.length);
    supplementEntries.push([id as number, { ...WarehouseModPresets[warehouseMod], id }]);
  }

  // Build perk categories
  const perkCatEntries = PerkCategoryPresets[perkCategories ?? "Default"];
  const perkCatO: Record<number, string> = Object.fromEntries(perkCatEntries.map((n, i) => [i, n]));

  return {
    name,
    versionNumber: "3.0",
    budgetFlag: 0,
    purchases: { fId: createId<GID.Purchase>(0), O: {} },
    characters: createRegistry<GID.Character, Character>({ [charId]: character }),
    jumps: createRegistry<GID.Jump, Jump>({ [jumpId]: jump }),
    altforms: createRegistry<GID.AltForm, AltForm>({ [altFormId]: altForm }),
    chainDrawbackList: [],
    purchaseGroups: {},
    supplements: {
      fId: createId<GID.Supplement>(supplementEntries.length),
      O: Object.fromEntries(supplementEntries),
    },
    notesList: [],
    notes: {},
    purchaseCategories: {
      [PurchaseType.Perk]: createRegistry(perkCatO),
      [PurchaseType.Item]: createRegistry({ 0: "Item" }),
    },
    jumpList: [jumpId],
    characterList: [charId],
    chainSettings: {
      defaultCP: 1000,
      chainDrawbacksForCompanions: false,
      chainDrawbacksSupplements: true,
      narratives: "restricted",
      altForms: true,
      startWithJumpZero: false,
      allowItemGroups: true,
      allowPerkGroups: false,
      ignoreDrawbackLimit: false,
      supplementBlockDrawbackSharing: false,
    },
    bankSettings: {
      enabled: false,
      maxDeposit: 0,
      depositRatio: 0,
      interestRate: 0,
    },
  };
}
