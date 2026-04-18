import { importChain } from "./data_old/ImportExport";
import { default as OldChain } from "./data_old/Chain";
import {
  default as OldPurchase,
  PurchaseType as OldPurchaseType,
  CostModifier as OldCostModifier,
  PurchaseGroup as OldPurchaseGroup,
  DefaultSubtype,
} from "./data_old/Purchase";
import {
  default as OldJump,
  Origin as OldOrigin,
  DrawbackOverride as OldOverrideType,
  SubsystemSummary,
} from "./data_old/Jump";
import { default as OldCharacter, Personality as OldPeronality } from "./data_old/Character";
import { default as OldAltForm } from "./data_old/AltForm";
import {
  default as OldChainSupplement,
  CompanionAccess as OldCompanionAccess,
} from "./data_old/ChainSupplement";

import { PersonalityComponent } from "./data/Character";
import { objFilter, objMap } from "@/utilities/miscUtilities";
import { JumpSourceType, JumpSource, Jump, DEFAULT_CURRENCY_ID } from "./data/Jump";
import {
  OverrideType,
  ModifiedCost,
  JumpPurchase,
  BasicPurchase,
  Drawback,
  CompanionImport,
  Subpurchase,
  SupplementImport,
  ScenarioReward,
  RewardType,
  Scenario,
  SupplementPurchase,
  CostModifier,
  PurchaseType,
  PurchaseGroup,
  Purchase,
} from "./data/Purchase";
import { createId, createRegistry, Id, GID, LID, Registry } from "./data/types";
import { ChainSupplement, CompanionAccess, SupplementType } from "./data/ChainSupplement";
import { Chain } from "./data/Chain";

function convertPersonality(p: OldPeronality) {
  let personality: Partial<Record<PersonalityComponent, string>> = {};
  personality["Personality"] = p.personality || "";
  if (p.motivation) personality["Motivation"] = p.motivation;
  if (p.likes) personality["Likes"] = p.likes;
  if (p.dislikes) personality["Dislikes"] = p.dislikes;
  if (p.quirks) personality["Quirks"] = p.quirks;
  return personality;
}

function convertOverrideType(oO: OldOverrideType) {
  switch (oO) {
    case OldOverrideType.Enabled:
      return OverrideType.Enabled;
    case OldOverrideType.Excluded:
      return OverrideType.Excluded;
    case OldOverrideType.BoughtOffTemp:
      return OverrideType.BoughtOffTemp;
    case OldOverrideType.BoughtOffPermanent:
      return OverrideType.BoughtOffPermanent;
  }
}

function convertCostModifier(
  oCM: OldCostModifier,
  purchaseValue?: number,
  currency?: number,
): ModifiedCost {
  switch (oCM) {
    case OldCostModifier.Full:
      return { modifier: CostModifier.Full };
    case OldCostModifier.Reduced:
      return { modifier: CostModifier.Reduced };
    case OldCostModifier.Free:
      return { modifier: CostModifier.Free };
    case OldCostModifier.Custom:
      return {
        modifier: CostModifier.Custom,
        modifiedTo:
          currency == undefined
            ? purchaseValue!
            : [{ amount: purchaseValue!, currency: createId<LID.Currency>(currency) }],
      };
  }
}

function convertCompanionAccess(oCA: OldCompanionAccess): CompanionAccess {
  switch (oCA) {
    case OldCompanionAccess.Unavailable:
      return CompanionAccess.Unavailable;
    case OldCompanionAccess.Available:
      return CompanionAccess.Available;
    case OldCompanionAccess.Communal:
      return CompanionAccess.Communal;
    case OldCompanionAccess.Partial:
      return CompanionAccess.Imports;
  }
}

function convertSupplement(oS: OldChainSupplement): ChainSupplement {
  return {
    id: createId(oS.id),
    name: oS.name,
    singleJump: false,
    initialJump: 1,
    investmentRatio: oS.investmentRatio,
    maxInvestment: oS.maxInvestment,
    initialStipend: oS.initialStipend,
    perJumpStipend: oS.perJumpStipend,
    companionAccess: convertCompanionAccess(oS.companionAccess),
    currency: oS.currency,
    source: oS.url ? { type: JumpSourceType.URL, URL: oS.url } : { type: JumpSourceType.Unknown },
    purchaseCategories: createRegistry(oS.purchaseCategories),
    type: oS.itemLike ? SupplementType.Item : SupplementType.Perk,
    enableScenarios: false,
  };
}

function convertJump(oJ: OldJump, oC: OldChain): Jump {
  return {
    name: oJ.name,
    obsoletions: [],
    source: {
      type: oJ.url ? JumpSourceType.URL : JumpSourceType.Unknown,
      URL: oJ.url,
    } as JumpSource,
    id: createId(oJ.id),
    duration: oJ.duration,
    originCategories: createRegistry(
      Object.fromEntries(
        oJ.originCategoryList.map((id) => [id, { ...oJ.originCategory(id), multiple: false }]),
      ),
    ),
    currencies: createRegistry(
      Object.fromEntries(oJ.listCurrencies().map((id) => [id, oJ.currency(id)])),
    ),
    originStipend: {
      amount: 0,
      currency: DEFAULT_CURRENCY_ID,
    },
    companionStipend: {
      amount: oJ.purchaseSubtype(DefaultSubtype[PurchaseType.Companion]!).stipend,
      currency: createId(oJ.purchaseSubtype(DefaultSubtype[PurchaseType.Companion]!).currency),
    },
    purchaseSubtypes: createRegistry(
      Object.fromEntries(
        oJ
          .listPurchaseSubtypes()
          .filter((id) =>
            [OldPurchaseType.Item, OldPurchaseType.Perk].includes(oJ.purchaseSubtype(id).type),
          )
          .map((id) => [
            id,
            {
              essential: !!oJ.purchaseSubtype(id).essential,
              placement: oJ.purchaseSubtype(id).subsystem ? "route" : "normal",
              allowSubpurchases: !!oJ.purchaseSubtype(id).subsystem,
              name: oJ.purchaseSubtype(id).name,
              type:
                oJ.purchaseSubtype(id).type == OldPurchaseType.Item
                  ? PurchaseType.Item
                  : PurchaseType.Perk,
              stipend: [
                {
                  amount: oJ.purchaseSubtype(id).stipend,
                  currency: createId(oJ.purchaseSubtype(id).currency),
                },
              ],
            },
          ]),
      ),
    ),
    characters: Array.from(oJ.characters) as Id<GID.Character>[],
    purchases: objMap(oJ.purchases, (b: number[]) =>
      b
        .filter((x) => oC.purchases[x].type != OldPurchaseType.Subsystem)
        .map(createId<GID.Purchase>),
    ),
    drawbacks: objMap(oJ.drawbacks, (b: number[]) =>
      b.filter((x) => oC.purchases[x].type == OldPurchaseType.Drawback).map(createId<GID.Purchase>),
    ),
    scenarios: objMap(oJ.drawbacks, (b: number[]) =>
      b.filter((x) => oC.purchases[x].type == OldPurchaseType.Scenario).map(createId<GID.Purchase>),
    ),
    bankDeposits: oJ.bankDeposits,
    currencyExchanges: objMap(oJ.currencyExchanges, (b) =>
      b.map((cEx) => ({
        oamount: +cEx.oAmmount,
        tamount: +cEx.tAmmount,
        oCurrency: createId(cEx.oCurrency),
        tCurrency: createId(cEx.tCurrency),
      })),
    ),
    supplementPurchases: objMap(oJ.supplementPurchases, (list) =>
      objMap(list, (idList) => idList.map(createId<GID.Purchase>)),
    ),
    supplementInvestments: oJ.supplementInvestments,
    notes: oJ.notes,
    narratives: oJ.narratives,
    origins: objMap(oJ.origins, (list) =>
      objMap(list, (oO: OldOrigin) => [
        {
          value: { amount: oO.cost, currency: createId(0) },
          summary: oO.summary ?? "",
          description: oO.description ?? "",
        },
      ]),
    ),
    altForms: objMap(oJ.altForms, (b: number[]) => b.map(createId<GID.AltForm>)),
    useSupplements: oJ.useSupplements,
    useNarrative: oJ.useNarratives,
    useAltForms: oJ.useAltForms,
    parentJump: oJ.parentJump !== undefined ? createId(oJ.parentJump) : undefined,
  };
}

function convertJumpPurchase(oP: OldPurchase, oJ: OldJump, oC?: OldChain): Purchase | undefined {
  let p: Omit<JumpPurchase, "type" | "value"> = {
    id: createId(oP._id),
    charId: createId(oP.characterId),
    name: oP.name,
    description: oP.description,
    jumpId: createId(oP.jumpId),
    cost: convertCostModifier(oP.costModifier, oP.purchaseValue, oP.currency || 0),
    duration: !oP.duration || oP.duration >= 0 ? oP.duration : undefined,
  };
  switch (oP.type) {
    case OldPurchaseType.Perk:
    case OldPurchaseType.Item:
      let subsystem: { id: Id<LID.PurchaseSubtype>; summary: SubsystemSummary } | undefined;
      Object.entries(oJ.subsystemSummaries[oP.characterId]).filter(([id, v]) =>
        v.forEach((s) => {
          if (s.id == oP._id) subsystem = { id: createId(+id), summary: s };
        }),
      );
      if (!subsystem) {
        let basic: BasicPurchase = {
          ...p,
          template: undefined,
          value: [{ amount: oP.value, currency: createId(oP.currency) }],
          type: oP.type == OldPurchaseType.Item ? PurchaseType.Item : PurchaseType.Perk,
          tags: oP.tags,
          categories: oP.category.map(createId<GID.PurchaseCategory>),
          subtype: createId(oP.subtype!),
          purchaseGroup: oP._purchaseGroup !== undefined ? createId(oP._purchaseGroup) : undefined,
        };
        return basic;
      } else {
        let summary = subsystem!.summary;
        let subsystemParent: BasicPurchase = {
          ...p,
          type: oP.type == OldPurchaseType.Item ? PurchaseType.Item : PurchaseType.Perk,
          tags: oP.tags,
          template: undefined,
          categories: oP.category.map(createId<GID.PurchaseCategory>),
          subtype: createId(subsystem!.id),
          purchaseGroup: oP._purchaseGroup ? createId(oP._purchaseGroup) : undefined,
          subpurchases: {
            stipend: [
              {
                currency: createId(oJ.purchaseSubtype(oP.subtype!).currency),
                amount: summary.stipend,
              },
            ],
            list: summary.subpurchases.map(createId<GID.Purchase>),
          },
          value: [{ amount: oP.value, currency: createId(oP.currency) }],
        };
        return subsystemParent;
      }
    case OldPurchaseType.Drawback:
      let drawback: Drawback = {
        ...p,
        template: undefined,
        value: [{ amount: oP.value, currency: createId(oP.currency) }],
        type: PurchaseType.Drawback,
        itemStipend: oP.itemStipend,
        companionStipend: oP.companionStipend,
        overrides: {}, // populated by post-processing in convertChain
      };
      return drawback;
    case OldPurchaseType.Companion:
      let companionImport: CompanionImport = {
        ...p,
        template: undefined,
        value: [{ amount: oP.value, currency: createId(oP.currency) }],
        type: PurchaseType.Companion,
        importData: {
          allowances: oP.importData!.allowances,
          characters: Array.from(oP.importData!.characters) as Id<GID.Character>[],
          stipend: oP.importData!.stipend,
        },
      };

      return companionImport;
    case OldPurchaseType.Subsystem:
      let parent = oJ.subsystemSummaries[oP.characterId][oP.subtype!].find((s) =>
        (s.subpurchases ?? []).includes(oP.id),
      )?.id;
      if (!parent) return undefined;
      let subsystemChild: Subpurchase = {
        ...p,
        value: [{ amount: oP.value, currency: createId(oP.currency) }],
        type: PurchaseType.Subpurchase,
        parent: createId(parent),
      };
      return subsystemChild;
    case OldPurchaseType.SupplementImport:
      let supplementImport: SupplementImport = {
        ...p,
        supplement: createId(oP.supplement!),
        value: oP.value,
        type: PurchaseType.SupplementImport,
        importData: {
          characters: Array.from(oP.supplementImportData!.characters) as Id<GID.Character>[],
          allowance: oP.supplementImportData!.allowance,
          percentage: oP.supplementImportData!.percentage,
        },
      };
      return supplementImport;

    case OldPurchaseType.Scenario:
      let rewards: ScenarioReward[] = [];
      if (oP.cost != 0)
        rewards.push({ type: RewardType.Currency, value: oP.cost, currency: createId(0) });
      if (oP.reward) rewards.push({ type: RewardType.Note, note: oP.reward });
      return {
        id: createId(oP._id),
        value: 0,
        name: oP.name,
        type: PurchaseType.Scenario,
        description: oP.description,
        jumpId: createId(oP.jumpId),
        cost: convertCostModifier(oP.costModifier, oP.purchaseValue, oP.currency || 0),
        rewards: rewards,
      } as Scenario;

    case OldPurchaseType.ChainDrawback:
      let chainDrawback: Drawback = {
        ...p,
        value: oP.value,
        type: PurchaseType.ChainDrawback,
        itemStipend: oP.itemStipend,
        companionStipend: oP.companionStipend,
        overrides: {}, // populated by post-processing in convertChain
      };
      return chainDrawback;

    case OldPurchaseType.Supplement:
      let suppPurchase: SupplementPurchase = {
        ...p,
        value: oP.value,
        type: oC!.supplements[oP.supplement!].itemLike
          ? PurchaseType.SupplementItem
          : PurchaseType.SupplementPerk,
        tags: oP.tags,
        purchaseGroup: oP._purchaseGroup ? createId(oP._purchaseGroup) : undefined,
        supplement: createId(oP.supplement!),
        categories: oP.category.map(createId<GID.PurchaseCategory>),
      };
      return suppPurchase;
  }
}

export function convertChain(rawChain: object): Chain {
  let oChain: OldChain = importChain({ ...rawChain });

  // Build purchases first so we can post-process overrides below.
  const purchases: ReturnType<typeof createRegistry<GID.Purchase, Purchase>> = createRegistry(
    objFilter(
      objMap(oChain.purchases, (oP: OldPurchase) =>
        convertJumpPurchase(oP, oChain.jumps[oP.jumpId] as OldJump, oChain),
      ),
      (b) => !!b,
    ) as Registry<GID.Purchase, Purchase>,
  );

  // In the old system, drawback overrides are stored on each Jump as
  // drawbackOverrides[charId][purchaseId]. In the new system they live on
  // the Drawback purchase itself as overrides[jumpId][charId].
  for (const jumpId in oChain.jumps) {
    const oJ = oChain.jumps[jumpId] as OldJump;
    const newJumpId = createId<GID.Jump>(+jumpId);
    for (const charId in oJ.drawbackOverrides) {
      const charOverrides = oJ.drawbackOverrides[charId];
      for (const purchaseId in charOverrides) {
        const oOv = charOverrides[purchaseId];
        const purchase = purchases.O[createId<GID.Purchase>(+purchaseId)] as Drawback | undefined;
        // Only Drawback and ChainDrawback purchases have an overrides field.
        if (!purchase || !("overrides" in purchase)) continue;
        const overrides = purchase.overrides;
        if (!overrides[newJumpId]) overrides[newJumpId] = {};
        overrides[newJumpId][createId<GID.Character>(+charId)] = {
          type: convertOverrideType(oOv.override)!,
          modifier: convertCostModifier(oOv.modifier, oOv.purchaseValue, 0),
        };
      }
    }
  }

  return {
    purchases,
    characters: createRegistry(
      objMap(oChain.characters as Record<number, OldCharacter>, (c: OldCharacter) => ({
        name: c.name,
        notes: c.notes,
        originalAge: c.originalAge,
        gender: c.gender,
        background: c.background,
        perkCount: undefined,
        itemCount: undefined,
        primary: c.primary,
        id: createId(c.id),
        originalForm: createId(c.originalForm),
        personality: convertPersonality(c.personality),
      })),
    ),
    jumps: createRegistry(
      objMap(oChain.jumps as Record<GID.Jump, OldJump>, (oJ) => convertJump(oJ, oChain)),
    ),
    jumpList: oChain.jumpList.map(createId<GID.Jump>),
    altforms: createRegistry(
      objMap(oChain.altforms, (alt: OldAltForm) => ({
        name: alt.name,
        capabilities: alt.capabilities,
        physicalDescription: alt.physicalDescription,
        species: alt.species,
        sex: alt.sex,
        height: alt.height,
        weight: alt.weight,
        image: alt.imageURL ? { URL: alt.imageURL, type: "external" } : undefined,
        id: createId(alt.id),
      })),
    ),
    chainDrawbackList: oChain.chainDrawbacks.map(createId<GID.Purchase>),
    purchaseCategories: {
      [PurchaseType.Perk]: createRegistry(oChain.purchaseCategories[OldPurchaseType.Perk]),
      [PurchaseType.Item]: createRegistry(oChain.purchaseCategories[OldPurchaseType.Item]),
    },

    purchaseGroups: objMap(oChain.purchaseGroups, (list) =>
      createRegistry(
        objMap<number, OldPurchaseGroup, PurchaseGroup>(list, (oPG) => ({
          name: oPG.name,
          description: oPG.description,
          components: oPG.components.map(createId<GID.Purchase>),
          type: oPG.type == OldPurchaseType.Perk ? PurchaseType.Perk : PurchaseType.Item,
        })),
      ),
    ),
    supplements: createRegistry(
      objMap(oChain.supplements, (o: OldChainSupplement) => convertSupplement(o)),
    ),

    notesList: oChain.notesList,
    notes: oChain.notes,

    characterList: oChain.characterList.map(createId<GID.Character>),
    name: oChain.name,
    versionNumber: "3.0",
    chainSettings: {
      chainDrawbacksForCompanions: oChain.chainSettings.chainDrawbacksForCompanions,
      chainDrawbacksSupplements: oChain.chainSettings.chainDrawbacksSupplements,
      narratives: oChain.chainSettings.narratives,
      altForms: oChain.chainSettings.altForms,
      startWithJumpZero: false,
      supplementBlockDrawbackSharing: false,
      defaultCP: 1000,
      allowItemGroups: true,
      allowPerkGroups: false,
      ignoreDrawbackLimit: false,
    },
    bankSettings: oChain.bankSettings,
    budgetFlag: 0,
  };
}
