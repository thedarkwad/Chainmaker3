import { useCallback } from "react";
import {
  createId,
  GID,
  Id,
  LID,
  Registry,
  registryAdd,
  TID,
} from "../../data/types";
import {
  setTracked,
  useCreateCompanion,
  useRemoveCharacter,
} from "../../state/hooks";
import { useChainStore } from "../../state/Store";
import { ChainMutators } from "../types";
import {
  BasicPurchaseTemplate,
  CompanionTemplate,
  DrawbackTemplate,
  OriginTemplate,
  ScenarioTemplate,
  VariableCost,
} from "@/jumpdoc/data/JumpDoc";
import {
  BasicPurchase,
  CompanionImport,
  CostModifier,
  Drawback,
  JumpPurchase,
  ModifiedCost,
  PurchaseType,
  RewardType,
  Scenario,
  ScenarioReward,
  Value,
} from "../../data/Purchase";
import { Currency, DEFAULT_CURRENCY_ID, Origin } from "../../data/Jump";
import { applyTags, applyTagsWithCost } from "../../../utilities/tags";
import {
  convertCurrencyId,
  convertModifiedCost,
  convertSubtypeId,
  convertValue,
} from "../utils";

export function useChainMutators(): Omit<ChainMutators, "navigate"> {
  const createCompanion = useCreateCompanion();
  const removeCharacterFn = useRemoveCharacter();

  return {
    addPurchaseFromTemplate: useCallback(
      (
        { template, type, tags, cost, reward, freebie, customDuration },
        jumpId,
        charId,
        doc,
      ) => {
        let newId: Id<GID.Purchase> | undefined;
        setTracked("Add purchase", c => {
          const jump = c.jumps.O[jumpId];
          if (!jump) return;
          c.budgetFlag += 1;
          if (type == "purchase") {
            let subtype = +Object.keys(jump.purchaseSubtypes.O).filter(
              id =>
                jump.purchaseSubtypes.O[+id as any].templateId ==
                (template as BasicPurchaseTemplate).subtype,
            )[0] as Id<LID.PurchaseSubtype>;
            if (subtype === undefined) return;
            const resolvedName = applyTagsWithCost(
              template.name,
              tags,
              template.cost,
              cost.cost,
              doc.currencies,
            );
            const resolvedDescription = applyTagsWithCost(
              template.description ?? "",
              tags,
              template.cost,
              cost.cost,
              doc.currencies,
            );
            newId = registryAdd(c.purchases, {
              charId,
              jumpId,
              name: resolvedName,
              description: resolvedDescription,
              type: jump.purchaseSubtypes.O[subtype].type,
              cost: convertModifiedCost(
                template.cost,
                cost,
                doc,
                jump.currencies,
                cost.floatingDiscountOption ?? false,
              ),
              reward,
              ...(freebie !== undefined ? { freebie } : {}),
              value: convertValue(template.cost, doc, jump.currencies),
              categories: [],
              tags: [],
              subtype,
              duration: (template as BasicPurchaseTemplate).temporary
                ? 1
                : undefined,
              template: {
                id: template.id as any,
                jumpdoc: "",
                originalCost: cost,
                tags,
                originalName: resolvedName,
                originalDescription: resolvedDescription,
              },
              usesFloatingDiscount: cost.floatingDiscountOption ?? false,
            });
            if (!jump.purchases[charId]) jump.purchases[charId] = [];
            jump.purchases[charId]!.push(newId);
          } else {
            const resolvedName = applyTagsWithCost(
              template.name,
              tags,
              template.cost,
              cost.cost,
              doc.currencies,
            );
            const resolvedDescription = applyTagsWithCost(
              template.description ?? "",
              tags,
              template.cost,
              cost.cost,
              doc.currencies,
            );
            newId = registryAdd(c.purchases, {
              charId,
              jumpId,
              duration: 1,
              overrides: {},
              name: resolvedName,
              description: resolvedDescription,
              type: PurchaseType.Drawback,
              cost: convertModifiedCost(
                template.cost,
                cost,
                doc,
                jump.currencies,
                cost.floatingDiscountOption ?? false,
              ),
              value: convertValue(template.cost, doc, jump.currencies),
              template: {
                id: template.id as any,
                jumpdoc: "",
                originalCost: cost,
                tags,
                originalName: resolvedName,
                originalDescription: resolvedDescription,
              },
              ...(freebie !== undefined ? { freebie } : {}),
              ...(customDuration !== undefined ? { customDuration } : {}),
            });
            if (!jump.drawbacks[charId]) jump.drawbacks[charId] = [];
            jump.drawbacks[charId]!.push(newId);
          }
          c.budgetFlag += 1;
        });
        return newId;
      },
      [],
    ),
    addOriginFromTemplate: useCallback(
      ({ template, tags, cost, freebie }, jumpId, charId, doc) => {
        setTracked("Add origin", c => {
          const jump = c.jumps.O[jumpId];
          if (!jump) return;

          // Find the LID.OriginCategory that links to this template's TID category.
          let categoryLid: Id<LID.OriginCategory> | undefined;
          for (const lidStr in jump.originCategories.O) {
            const cat =
              jump.originCategories.O[+lidStr as Id<LID.OriginCategory>];
            if (cat?.template?.id === template.type) {
              categoryLid = +lidStr as Id<LID.OriginCategory>;
              break;
            }
          }
          if (categoryLid === undefined) return;

          const chainCat = jump.originCategories.O[categoryLid];
          const docCat = doc.originCategories.O[template.type];
          const effectiveMax = chainCat?.multiple ? (docCat?.max ?? 9999) : 1;

          const origins = jump.origins[charId] as
            | Record<Id<LID.OriginCategory>, Origin[]>
            | undefined;
          const list = origins?.[categoryLid] ?? [];

          // Evict the first entry if already at capacity.
          if (list.length >= effectiveMax && list.length > 0) {
            list.splice(0, 1);
          }

          const convertedCost = convertValue(cost, doc, jump.currencies);
          const templateCostAsValue = Array.isArray(template.cost) ? template.cost : [template.cost];

          const newOrigin: Origin = {
            summary: applyTagsWithCost(
              template.name,
              tags,
              templateCostAsValue,
              cost,
              doc.currencies,
            ),
            ...(template.description
              ? {
                description: applyTagsWithCost(
                  template.description,
                  tags,
                  templateCostAsValue,
                  cost,
                  doc.currencies,
                ),
              }
              : {}),
            value: convertedCost,
            template: {
              jumpdoc: "",
              id: template.id,
              originalCost: { cost: cost, modifier: CostModifier.Full },
            },
            ...(freebie !== undefined ? { freebie } : {}),
          };

          if (!jump.origins[charId]) jump.origins[charId] = {};
          const categoryOrigins = jump.origins[charId];
          if (!categoryOrigins[categoryLid]) categoryOrigins[categoryLid] = [];
          categoryOrigins[categoryLid].push(newOrigin);

          c.budgetFlag += 1;
        });
        return template.id;
      },
      [],
    ),
    addScenarioFromTemplate: useCallback(
      ({ template, tags, rewardGroupIndex }, jumpId, charId, doc) => {
        let newId: Id<GID.Purchase> | undefined;
        setTracked("Add scenario", c => {
          const jump = c.jumps.O[jumpId];
          if (!jump) return;
          const initValue: Value = Object.keys(jump.currencies.O).map(cid => ({
            currency: createId<LID.Currency>(+cid),
            amount: 0,
          }));
          const rewardTemplates =
            rewardGroupIndex != null
              ? (template.rewardGroups?.[rewardGroupIndex]?.rewards ?? [])
              : [];
          const rewards: ScenarioReward[] = [];
          for (const r of rewardTemplates) {
            if (r.type === RewardType.Currency) {
              rewards.push({
                type: r.type,
                value: r.value,
                currency: convertCurrencyId(r.currency, doc, jump.currencies),
              });
            } else if (r.type === RewardType.Stipend) {
              const subtype = convertSubtypeId(
                r.subtype,
                doc,
                jump.purchaseSubtypes,
              );
              if (subtype == null) continue;
              rewards.push({
                type: r.type,
                value: r.value,
                currency: convertCurrencyId(r.currency, doc, jump.currencies),
                subtype,
              });
            } else if (
              r.type === RewardType.Item ||
              r.type === RewardType.Perk
            ) {
              rewards.push({ type: r.type, id: r.id });
            } else if (r.type === RewardType.Companion) {
              rewards.push({
                type: r.type,
                id: r.id,
                name: doc.availableCompanions.O[r.id]?.name ?? "",
              });
            }
          }
          newId = c.purchases.fId;
          const resolvedName = applyTags(template.name, tags);
          const resolvedDescription = applyTags(template.description, tags);
          const scenario: Scenario = {
            id: newId,
            charId,
            jumpId,
            name: resolvedName,
            description: resolvedDescription,
            type: PurchaseType.Scenario,
            cost: { modifier: CostModifier.Full },
            value: initValue,
            rewards,
            template: {
              id: template.id as any,
              jumpdoc: "",
              tags,
              originalName: resolvedName,
              originalDescription: resolvedDescription,
            },
          };
          c.purchases.O[newId] = scenario;
          c.purchases.fId = createId<GID.Purchase>(newId + 1);
          if (!jump.scenarios[charId]) jump.scenarios[charId] = [];
          jump.scenarios[charId]!.push(newId);
          c.budgetFlag += 1;
        });
        return newId;
      },
      [],
    ),
    setNameDescription: useCallback((id, name, description) => {
      setTracked("Rename purchase", c => {
        const p = c.purchases.O[id] as JumpPurchase | undefined;
        if (!p?.template) return;
        p.name = name;
        p.description = description;
        p.template.originalName = name;
        p.template.originalDescription = description;
        c.budgetFlag += 1;
      });
    }, []),
    repricePurchase: useCallback((id, cost, doc) => {
      setTracked("Reprice purchase", c => {
        const p = c.purchases.O[id] as JumpPurchase | undefined;
        if (!p || !p.template) return;
        const jump = c.jumps.O[p.jumpId];
        if (!jump) return;
        let templateValue: Value<TID.Currency> | VariableCost;
        if (p.type == PurchaseType.Drawback)
          templateValue = doc.availableDrawbacks.O[p.template.id as any].cost;
        else if (p.type == PurchaseType.Companion)
          templateValue = doc.availableCompanions.O[p.template.id as any].cost;
        else
          templateValue = doc.availablePurchases.O[p.template.id as any].cost;
        p.value = convertValue(
          Array.isArray(templateValue) ? templateValue : cost.cost,
          doc,
          jump.currencies,
        );
        p.cost = convertModifiedCost(
          Array.isArray(templateValue) ? templateValue : cost.cost,
          cost,
          doc,
          jump.currencies,
          false,
        );
        p.template.originalCost = cost;
        if ("usesFloatingDiscount" in p) p.usesFloatingDiscount = false;
        c.budgetFlag += 1;
      });
    }, []),
    repriceOrigin: useCallback((templateId, jumpId, charId, build, doc) => {
      const template = doc.origins.O[templateId];
      if (!template) return;
      const hasSynergy = template.synergies?.some(sid =>
        build.origins.some(o => o.template?.id === sid),
      );
      let newTidCost = Array.isArray(template.cost)
        ? template.cost
        : [template.cost];
      if (
        hasSynergy &&
        (template.synergyBenefit == "discounted" ||
          template.synergyBenefit == "free")
      ) {
        newTidCost = purchaseValueWithThreshold(
          newTidCost,
          {
            modifier:
              template.synergyBenefit == "discounted"
                ? CostModifier.Reduced
                : CostModifier.Free,
          },
          true,
          doc.currencies,
        );
      }

      setTracked("Reprice origin", c => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        const charOrigins = jump.origins[charId];
        if (!charOrigins) return;
        for (const lidStr in charOrigins) {
          const origin = charOrigins[lidStr as any]?.find(
            o => o.template?.id === templateId,
          );
          if (!origin) continue;
          console.log(JSON.stringify(origin));
          origin.value = convertValue(newTidCost, doc, jump.currencies);
          origin.template!.originalCost = {
            cost: newTidCost,
            modifier: CostModifier.Full,
          };
          c.budgetFlag += 1;
        }
      });
    }, []),
    removePurchase: useCallback(
      (id: Id<GID.Purchase>, build) => {
        const isDrawback = Object.values(build.drawbacks).some(arr =>
          arr?.includes(id),
        );
        const isScenario = Object.values(build.scenarios).some(arr =>
          arr?.includes(id),
        );
        setTracked(
          isDrawback
            ? "Remove drawback"
            : isScenario
              ? "Remove scenario"
              : "Remove purchase",
          c => {
            const p = c.purchases.O[id] as JumpPurchase | undefined;
            if (!p) return;
            const pJumpId = p.jumpId;
            const pCharId = p.charId;
            const jump = c.jumps.O[pJumpId];
            if (!jump) return;
            delete c.purchases.O[id];
            if (isScenario) {
              const list = jump.scenarios[pCharId];
              if (list) {
                const idx = list.indexOf(id);
                if (idx !== -1) list.splice(idx, 1);
              }
            } else if (isDrawback) {
              const list = jump.drawbacks[pCharId];
              if (list) {
                const idx = list.indexOf(id);
                if (idx !== -1) list.splice(idx, 1);
              }
            } else {
              const bp = p as BasicPurchase;
              if (bp.subpurchases?.list)
                for (const sub of bp.subpurchases.list)
                  delete c.purchases.O[sub];
              if (bp.purchaseGroup != null) {
                const g = c.purchaseGroups[pCharId]?.O[bp.purchaseGroup];
                if (g) {
                  const gi = g.components.indexOf(id);
                  if (gi !== -1) g.components.splice(gi, 1);
                }
              }
              const list = jump.purchases[pCharId] as
                | Id<GID.Purchase>[]
                | undefined;
              if (list) {
                const idx = list.indexOf(id);
                if (idx !== -1) list.splice(idx, 1);
              }
            }
            c.budgetFlag += 1;
          },
        );
      },
      [],
    ),
    addCompanionImport: useCallback(
      ({ template, companionIds, tags, cost }, jumpId, charId, doc) => {
        let newId: Id<GID.Purchase> | undefined;
        setTracked("Add companion import", c => {
          const jump = c.jumps.O[jumpId];
          if (!jump) return;
          const allowances: Record<Id<LID.Currency>, number> = {};
          for (const tidStr in template.allowances) {
            const tid = createId<TID.Currency>(+tidStr);
            const lid = convertCurrencyId(tid, doc, jump.currencies);
            allowances[lid] = template.allowances[tid];
          }
          const stipend: Record<
            Id<LID.Currency>,
            Record<Id<LID.PurchaseSubtype>, number>
          > = {};
          for (const tidCurrStr in template.stipend) {
            const tidCurr = createId<TID.Currency>(+tidCurrStr);
            const lidCurr = convertCurrencyId(tidCurr, doc, jump.currencies);
            const inner = template.stipend[tidCurr];
            const convertedInner: Record<Id<LID.PurchaseSubtype>, number> = {};
            for (const tidSubStr in inner) {
              const tidSub = createId<TID.PurchaseSubtype>(+tidSubStr);
              const lidSub = convertSubtypeId(
                tidSub,
                doc,
                jump.purchaseSubtypes,
              );
              if (lidSub == null) continue;
              convertedInner[lidSub] = inner[tidSub];
            }
            stipend[lidCurr] = convertedInner;
          }
          newId = c.purchases.fId;

          let resolvedName = applyTagsWithCost(
            template.name,
            tags,
            template.cost,
            cost.cost,
            doc.currencies,
          );

          let resolvedDescription = applyTagsWithCost(
            template.description,
            tags,
            template.cost,
            cost.cost,
            doc.currencies,
          );

          const purchase: CompanionImport = {
            id: newId,
            charId,
            jumpId,
            name: resolvedName,
            description: resolvedDescription,
            type: PurchaseType.Companion,
            cost: convertModifiedCost(
              template.cost,
              cost,
              doc,
              jump.currencies,
              cost.floatingDiscountOption ?? false,
            ),
            value: convertValue(template.cost, doc, jump.currencies),
            template: {
              id: template.id,
              jumpdoc: "",
              originalCost: cost,
              tags,
              originalName: resolvedName,
              originalDescription: resolvedDescription,
            },
            importData: {
              characters: companionIds,
              allowances: allowances as any,
              stipend: stipend as any,
            },
          };
          c.purchases.O[newId] = purchase as never;
          c.purchases.fId = createId<GID.Purchase>((newId as number) + 1);
          if (!jump.purchases[charId]) jump.purchases[charId] = [];
          jump.purchases[charId]!.push(newId);
          c.budgetFlag += 1;
        });
        return newId;
      },
      [],
    ),
    createCompanion: useCallback(
      ({ template, name, gender, species }) => {
        return createCompanion({
          name: name,
          gender: gender,
          age: 0,
          backgroundSummary: template.name,
          backgroundDescription: template.description,
          personality: "",
          species: species,
        });
      },
      [createCompanion],
    ),
    addFollower: useCallback(
      ({ template, cost, tags }, jumpId, charId, doc) => {
        let newId: Id<GID.Purchase> | undefined;
        setTracked("Add follower", c => {
          const jump = c.jumps.O[jumpId];
          if (!jump) return;
          const subtypeEntry = Object.entries(jump.purchaseSubtypes.O).find(
            ([, st]) => st?.type === PurchaseType.Item,
          );
          if (!subtypeEntry) return;
          const subtype = createId<LID.PurchaseSubtype>(+subtypeEntry[0]);
          newId = c.purchases.fId;
          const resolvedName = applyTagsWithCost(
            template.name,
            tags,
            template.cost,
            cost.cost,
            doc.currencies,
          );
          const resolvedDescription = applyTagsWithCost(
            template.description ?? "",
            tags,
            template.cost,
            cost.cost,
            doc.currencies,
          );
          const purchase: BasicPurchase = {
            id: newId,
            charId,
            jumpId,
            name: resolvedName,
            description: resolvedDescription,
            type: PurchaseType.Item,
            cost: convertModifiedCost(
              cost.cost,
              cost,
              doc,
              jump.currencies,
              cost.floatingDiscountOption ?? false,
            ),
            value: convertValue(cost.cost, doc, jump.currencies),
            template: {
              id: template.id,
              jumpdoc: "",
              tags,
              originalName: resolvedName,
              originalDescription: resolvedDescription,
            },
            subtype,
            categories: [],
            tags: [],
            follower: true,
          };
          c.purchases.O[newId] = purchase;
          c.purchases.fId = createId<GID.Purchase>(newId + 1);
          if (!jump.purchases[charId]) jump.purchases[charId] = [];
          jump.purchases[charId]!.push(newId);
          c.budgetFlag += 1;
        });
        return newId;
      },
      [],
    ),
    removeCharacters: useCallback(
      ids => {
        for (const id of ids) removeCharacterFn(id);
      },
      [removeCharacterFn],
    ),
    removeOrigin: useCallback((templateId, jumpId, charId) => {
      setTracked("Remove origin", c => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        const charOrigins = jump.origins[charId] as
          | Record<Id<LID.OriginCategory>, Origin[]>
          | undefined;
        if (!charOrigins) return;
        for (const lidStr in charOrigins) {
          const lid = createId<LID.OriginCategory>(+lidStr);
          const list = charOrigins[lid];
          if (!list) continue;
          const idx = list.findIndex(o => o.template?.id === templateId);
          if (idx !== -1) {
            list.splice(idx, 1);
            c.budgetFlag += 1;
            break;
          }
        }
      });
    }, []),
    addCurrencyExchangeFromDoc: useCallback(
      (
        { templateIndex, oCurrency, tCurrency, oamount, tamount },
        jumpId,
        charId,
        doc,
      ) => {
        setTracked("Add currency exchange", c => {
          const jump = c.jumps.O[jumpId];
          if (!jump) return;
          const oLid = convertCurrencyId(oCurrency, doc, jump.currencies);
          const tLid = convertCurrencyId(tCurrency, doc, jump.currencies);
          const existing = jump.currencyExchanges[charId]?.find(
            ex => ex.templateIndex === templateIndex,
          );
          if (existing) {
            existing.oamount += oamount;
            existing.tamount += tamount;
          } else {
            if (!jump.currencyExchanges[charId])
              jump.currencyExchanges[charId] = [];
            jump.currencyExchanges[charId]!.push({
              oCurrency: oLid,
              tCurrency: tLid,
              oamount,
              tamount,
              templateIndex,
            });
          }
          c.budgetFlag += 1;
        });
      },
      [],
    ),
    removeCurrencyExchangeFromDoc: useCallback(
      ({ templateIndex, oamount, tamount }, jumpId, charId) => {
        setTracked("Remove currency exchange", c => {
          const list = c.jumps.O[jumpId]?.currencyExchanges[charId];
          if (!list) return;
          const idx = list.findIndex(e => e.templateIndex === templateIndex);
          if (idx !== -1) {
            list[idx].oamount -= oamount;
            list[idx].tamount -= tamount;
            if (list[idx].oamount <= 0) list.splice(idx, 1);
          }
          c.budgetFlag += 1;
        });
      },
      [],
    ),
    setFreeFormOrigin: useCallback(
      ({ categoryId, value, cost }, jumpId, charId, doc) => {
        setTracked("Set origin", c => {
          const jump = c.jumps.O[jumpId];
          if (!jump) return;
          let categoryLid: Id<LID.OriginCategory> | undefined;
          for (const lidStr in jump.originCategories.O) {
            const cat =
              jump.originCategories.O[+lidStr as Id<LID.OriginCategory>];
            if (cat?.template?.id === categoryId) {
              categoryLid = +lidStr as Id<LID.OriginCategory>;
              break;
            }
          }
          if (categoryLid === undefined) return;
          const convertedCost = {
            amount: cost.amount,
            currency: convertCurrencyId(cost.currency, doc, jump.currencies),
          };
          if (!jump.origins[charId]) jump.origins[charId] = {};
          const charOrigins = jump.origins[charId];
          if (!charOrigins[categoryLid]) charOrigins[categoryLid] = [];
          const list = charOrigins[categoryLid]!;
          const existing = list.find(o => !o.template);
          if (existing) {
            existing.summary = value;
            existing.value = convertedCost;
          } else {
            list.push({ summary: value, value: convertedCost });
          }
          c.budgetFlag += 1;
        });
      },
      [],
    ),
  };
}

// Re-export this for convenience if needed inside this folder
export const purchaseValueWithThreshold = <
  T extends TID.Currency | LID.Currency = LID.Currency,
>(
  value: Value<T>,
  mod: ModifiedCost<T>,
  freebieAllowed: boolean,
  currencies: Registry<T, Currency>,
): Value<T> => {
  switch (mod.modifier) {
    case CostModifier.Full:
      return value;
    case CostModifier.Free:
      if (freebieAllowed)
        return value.map(val => ({
          amount: Math.min(val.amount, 0),
          currency: val.currency,
        }));
      // falls through
      else;
    case CostModifier.Reduced:
      return value.map(val => ({
        amount:
          freebieAllowed &&
            val.amount <= (currencies.O[val.currency]?.discountFreeThreshold ?? 0)
            ? Math.min(0, val.amount)
            : Math.min(val.amount, Math.floor(val.amount / 2)),
        currency: val.currency,
      }));
    case CostModifier.Custom:
      return mod.modifiedTo as Value<T>;
  }
};
