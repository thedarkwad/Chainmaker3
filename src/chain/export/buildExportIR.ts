import type { Chain } from "@/chain/data/Chain";
import type { CalculatedData } from "@/chain/data/CalculatedData";
import { DEFAULT_CURRENCY_ID, type Jump } from "@/chain/data/Jump";
import type { Duration } from "@/utilities/units";
import {
  CostModifier,
  OverrideType,
  PurchaseType,
  RewardType,
  purchaseValue,
  type BasicPurchase,
  type CompanionImport,
  type Drawback,
  type ModifiedCost,
  type Scenario,
  type SupplementPurchase,
  type Value,
} from "@/chain/data/Purchase";
import { createId, type GID, type Id, type LID } from "@/chain/data/types";
import { useImageUrlCache } from "@/chain/state/ImageUrlCache";
import { formatCostForExport } from "./formatCost";
import type {
  ExportIR,
  ExportOptions,
  IRAltForm,
  IRBudgetEntry,
  IRBudgetSection,
  IRBudgetSummary,
  IRCompanionImport,
  IRCost,
  IRDrawback,
  IRJump,
  IRNarrative,
  IROrigin,
  IRPurchase,
  IRPurchaseSection,
  IRScenario,
  IRSupplementSection,
} from "./types";

// A fully-typed fallback cost so that `?? FULL_COST` is always `ModifiedCost`.
const FULL_COST: ModifiedCost = { modifier: CostModifier.Full };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDuration({ years, months, days }: Duration): string {
  if (years >= 100_000) {
    const n = Math.round(years / 1000);
    return n === 1 ? "1 millennium" : `${n} millennia`;
  }
  if (years >= 1_000) {
    const n = Math.round(years / 100);
    return n === 1 ? "1 century" : `${n} centuries`;
  }
  if (years > 0) {
    const n = months >= 6 ? years + 1 : years;
    return n === 1 ? "1 year" : `${n} years`;
  }
  if (months > 0) {
    const n = days >= 15 ? months + 1 : months;
    return n === 1 ? "1 month" : `${n} months`;
  }
  return days === 1 ? "1 day" : `${days} days`;
}

function buildPurchaseIR(
  id: Id<GID.Purchase>,
  chain: Chain,
  jump: Jump,
  showCost: boolean,
  showDesc: boolean,
): IRPurchase | null {
  const p = chain.purchases.O[id];
  if (!p) return null;

  const costIR = showCost
    ? formatCostForExport(p.value, p.cost, jump.currencies)
    : null;

  // Subpurchases (BasicPurchase only)
  const subpurchases: IRPurchase[] = [];
  if ("subpurchases" in p && p.subpurchases) {
    for (const subId of p.subpurchases.list) {
      const sub = buildPurchaseIR(subId, chain, jump, showCost, showDesc);
      if (sub) subpurchases.push(sub);
    }
  }

  return {
    name: p.name,
    description: showDesc ? p.description : "",
    cost: costIR,
    subpurchases,
  };
}

function buildDrawbackIR(
  id: Id<GID.Purchase>,
  chain: Chain,
  jump: Jump,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  showCost: boolean,
  showDesc: boolean,
  isRetained: boolean,
  isChainDrawback: boolean,
): IRDrawback | null {
  const p = chain.purchases.O[id] as Drawback | undefined;
  if (!p) return null;

  // Check if this drawback is excluded/bought off in this jump for this character
  const override = p.overrides?.[jumpId]?.[charId];
  if (
    override &&
    (override.type === OverrideType.Excluded ||
      override.type === OverrideType.BoughtOffTemp ||
      override.type === OverrideType.BoughtOffPermanent)
  ) {
    return null;
  }

  const costIR = showCost
    ? formatCostForExport(p.value as Value | number, p.cost, jump.currencies)
    : null;

  return {
    name: p.name,
    description: showDesc ? p.description : "",
    cost: costIR,
    isRetained,
    isChainDrawback,
  };
}

function buildScenarioIR(
  id: Id<GID.Purchase>,
  chain: Chain,
  jump: Jump,
  _showCost: boolean,
  showDesc: boolean,
): IRScenario | null {
  const p = chain.purchases.O[id] as Scenario | undefined;
  if (!p) return null;

  const rewardStrings: string[] = [];
  for (const r of p.rewards) {
    switch (r.type) {
      case RewardType.Currency: {
        const cur = jump.currencies.O[r.currency];
        rewardStrings.push(`${r.value} ${cur?.abbrev ?? "CP"}`);
        break;
      }
      case RewardType.Item:
      case RewardType.Perk: {
        const reward = Object.values(chain.purchases.O).find((p) => (p as BasicPurchase).template?.id === r.id);
        if (reward) rewardStrings.push(reward.name);
        break;
      }
      case RewardType.Stipend: {
        const cur = jump.currencies.O[r.currency];
        const sub = jump.purchaseSubtypes.O[r.subtype];
        rewardStrings.push(`${r.value} ${cur?.abbrev ?? "CP"} stipend (${sub?.name ?? ""})`);
        break;
      }
      case RewardType.Note:
        rewardStrings.push(r.note);
        break;
    }
  }

  return {
    name: p.name,
    description: showDesc ? p.description : "",
    rewards: rewardStrings,
  };
}

function buildSupplementSectionIR(
  suppId: Id<GID.Supplement>,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  chain: Chain,
  jump: Jump,
  calculatedData: Partial<CalculatedData>,
  showCost: boolean,
  showDesc: boolean,
): IRSupplementSection | null {
  const supp = chain.supplements.O[suppId];
  if (!supp) return null;

  const purchaseIds = jump.supplementPurchases?.[charId]?.[suppId] ?? [];

  if (purchaseIds.length === 0) return null;

  const currencyName = supp.currency || "SP";

  const perks: IRPurchase[] = [];
  const items: IRPurchase[] = [];

  for (const id of purchaseIds) {
    const p = chain.purchases.O[id] as SupplementPurchase | undefined;
    if (!p) continue;

    const costIR = showCost
      ? formatCostForExport(p.value, p.cost, undefined)
      : null;

    const ir: IRPurchase = {
      name: p.name,
      description: showDesc ? p.description : "",
      cost: costIR,
      subpurchases: [],
    };

    if (p.type === PurchaseType.SupplementPerk) perks.push(ir);
    else if (p.type === PurchaseType.SupplementItem) items.push(ir);
  }

  let prePurchaseBudget: number | null = null;
  let investment: number | null = null;
  let investmentCurrencyAbbrev: string | null = null;

  if (showCost) {
    const remainingBudget =
      calculatedData.supplementBudgets?.[charId]?.[jumpId]?.[suppId] ?? null;

    if (remainingBudget !== null) {
      const totalSpent = [...perks, ...items].reduce((sum, p) => sum + (p.cost?.raw ?? 0), 0);
      prePurchaseBudget = remainingBudget + totalSpent;
    }

    const investmentAmount = jump.supplementInvestments?.[charId]?.[suppId];
    if (investmentAmount && investmentAmount !== 0) {
      investment = investmentAmount;
      investmentCurrencyAbbrev = jump.currencies.O[DEFAULT_CURRENCY_ID]?.abbrev ?? "CP";
    }
  }

  return {
    name: supp.name,
    currencyName,
    prePurchaseBudget,
    investment,
    investmentCurrencyAbbrev,
    perks,
    items,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Starting points builder
// ─────────────────────────────────────────────────────────────────────────────

function buildStartingPoints(
  chain: Chain,
  jump: Jump,
  characterId: Id<GID.Character>,
): IRBudgetEntry[] {
  const char = chain.characters.O[characterId];
  if (!char) return [];

  function abbrevFor(curId: Id<LID.Currency>): string {
    return jump.currencies.O[curId]?.abbrev ?? "CP";
  }

  if (char.primary) {
    return Object.values(jump.currencies.O)
      .filter((c): c is NonNullable<typeof c> => !!c && c.budget !== 0)
      .map((c) => ({ currencyAbbrev: c.abbrev, amount: c.budget }));
  }

  // Companion: find the import that includes this character
  for (const cId of chain.characterList) {
    for (const pId of jump.purchases?.[cId] ?? []) {
      const p = chain.purchases.O[pId as Id<GID.Purchase>];
      if (!p || p.type !== PurchaseType.Companion) continue;
      const ci = p as CompanionImport;
      if (!ci.importData.characters.includes(characterId)) continue;
      return Object.entries(ci.importData.allowances).map(([curIdStr, amount]) => ({
        currencyAbbrev: abbrevFor(createId<LID.Currency>(Number(curIdStr))),
        amount: amount as number,
      }));
    }
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget summary builder
// ─────────────────────────────────────────────────────────────────────────────

function buildBudgetSummary(
  chain: Chain,
  jump: Jump,
  jumpId: Id<GID.Jump>,
  characterId: Id<GID.Character>,
  calculatedData: Partial<CalculatedData>,
): IRBudgetSummary | null {
  const char = chain.characters.O[characterId];
  if (!char) return null;
  const isPrimary = char.primary;

  // Resolve currency abbrev from a local ID
  function abbrevFor(curId: Id<LID.Currency>): string {
    return jump.currencies.O[curId]?.abbrev ?? "CP";
  }

  const sections: IRBudgetSection[] = [];
  // Track net change per currency for the Total line
  const net = new Map<string, number>();

  function push(label: string, delta: Map<string, number>) {
    const entries: IRBudgetEntry[] = [];
    for (const [abbrev, amount] of delta) {
      if (amount === 0) continue;
      entries.push({ currencyAbbrev: abbrev, amount });
      net.set(abbrev, (net.get(abbrev) ?? 0) + amount);
    }
    if (entries.length > 0) sections.push({ label, entries });
  }

  // ── Starting Points ──
  // Primary: base currency budgets. Companion: allowances from import.
  {
    const startDelta = new Map<string, number>();
    if (isPrimary) {
      for (const [, currency] of Object.entries(jump.currencies.O)) {
        if (currency && currency.budget !== 0) {
          startDelta.set(currency.abbrev, (startDelta.get(currency.abbrev) ?? 0) + currency.budget);
        }
      }
    } else {
      // Find the CompanionImport that includes this character
      for (const cId of chain.characterList) {
        for (const pId of jump.purchases?.[cId] ?? []) {
          const p = chain.purchases.O[pId as Id<GID.Purchase>];
          if (!p || p.type !== PurchaseType.Companion) continue;
          const ci = p as CompanionImport;
          if (!ci.importData.characters.includes(characterId)) continue;
          for (const [curIdStr, amount] of Object.entries(ci.importData.allowances)) {
            const abbrev = abbrevFor(createId<LID.Currency>(Number(curIdStr)));
            startDelta.set(abbrev, (startDelta.get(abbrev) ?? 0) + (amount as number));
          }
          break;
        }
      }
    }
    push("Starting Points", startDelta);
  }

  // Maintain a local stipend tracker (subtype → currency → available amount)
  // so purchase costs can be net of stipend absorption.
  const stipends: Record<number, Record<number, number>> = {};
  for (const [stIdStr, st] of Object.entries(jump.purchaseSubtypes.O) as [string, NonNullable<typeof jump.purchaseSubtypes.O[Id<LID.PurchaseSubtype>]>][]) {
    const stId = Number(stIdStr);
    stipends[stId] = {};
    for (const sv of st.stipend) {
      stipends[stId][sv.currency as number] = (stipends[stId][sv.currency as number] ?? 0) + sv.amount;
    }
  }

  // ── Bank Deposit ──
  const bankDeposit = jump.bankDeposits?.[characterId] ?? 0;
  if (bankDeposit !== 0) {
    push("Bank Deposit", new Map([[abbrevFor(DEFAULT_CURRENCY_ID), -bankDeposit]]));
  }

  // ── Origin Costs ──
  {
    const originDelta = new Map<string, number>();
    const charOrigins = jump.origins?.[characterId];
    if (charOrigins) {
      for (const [, originList] of Object.entries(charOrigins) as [string, import("@/chain/data/Jump").Origin[] | undefined][]) {
        for (const origin of originList ?? []) {
          if (origin.value?.amount) {
            const abbrev = abbrevFor(origin.value.currency);
            originDelta.set(abbrev, (originDelta.get(abbrev) ?? 0) - origin.value.amount);
          }
        }
      }
    }
    push("Origins", originDelta);
  }

  // ── Supplement Investments ──
  {
    const investDelta = new Map<string, number>();
    const charInv = jump.supplementInvestments?.[characterId];
    if (charInv) {
      let total = 0;
      for (const suppIdStr in charInv) total += (charInv as Record<string, number>)[suppIdStr] ?? 0;
      if (total !== 0) investDelta.set(abbrevFor(DEFAULT_CURRENCY_ID), -total);
    }
    push("Supplement Investments", investDelta);
  }

  // ── Currency Exchanges ──
  {
    const exchangeDelta = new Map<string, number>();
    for (const ex of jump.currencyExchanges?.[characterId] ?? []) {
      const oAbbrev = abbrevFor(ex.oCurrency);
      const tAbbrev = abbrevFor(ex.tCurrency);
      exchangeDelta.set(oAbbrev, (exchangeDelta.get(oAbbrev) ?? 0) - ex.oamount);
      exchangeDelta.set(tAbbrev, (exchangeDelta.get(tAbbrev) ?? 0) + ex.tamount);
    }
    push("Currency Exchanges", exchangeDelta);
  }

  // ── Companion Allowances (for primary char: add stipends from imports they made) ──
  // For the imported companion character, allowances are already in Starting Points.
  // Here we add companion import stipend additions to our local stipend tracker.
  if (isPrimary) {
    for (const pId of jump.purchases?.[characterId] ?? []) {
      const p = chain.purchases.O[pId as Id<GID.Purchase>];
      if (!p || p.type !== PurchaseType.Companion) continue;
      const ci = p as CompanionImport;
      for (const [stIdStr, stAmounts] of Object.entries(ci.importData.stipend ?? {})) {
        const stId = Number(stIdStr);
        if (!stipends[stId]) stipends[stId] = {};
        for (const [curIdStr, amount] of Object.entries(stAmounts as Record<string, number>)) {
          stipends[stId][Number(curIdStr)] = (stipends[stId][Number(curIdStr)] ?? 0) + (amount as number);
        }
      }
    }
  }

  // ── Scenario Rewards ──
  {
    const rewardDelta = new Map<string, number>();
    for (const pId of jump.scenarios?.[characterId] ?? []) {
      const sc = chain.purchases.O[pId as Id<GID.Purchase>] as Scenario | undefined;
      if (!sc) continue;
      for (const r of sc.rewards) {
        if (r.type === RewardType.Currency) {
          rewardDelta.set(abbrevFor(r.currency), (rewardDelta.get(abbrevFor(r.currency)) ?? 0) + r.value);
        } else if (r.type === RewardType.Stipend) {
          const stId = r.subtype as number;
          if (!stipends[stId]) stipends[stId] = {};
          stipends[stId][r.currency as number] = (stipends[stId][r.currency as number] ?? 0) + r.value;
        }
      }
    }
    push("Scenario Rewards", rewardDelta);
  }

  // Helper: deduct a cost (Value) from stipend bucket then main currency, return main-currency delta
  function deductCost(value: Value | number, cost: ModifiedCost, subtypeId: number | undefined): Map<string, number> {
    const delta = new Map<string, number>();
    let resolved = purchaseValue(value, cost);
    if (typeof resolved === "number") resolved = [{ currency: DEFAULT_CURRENCY_ID, amount: resolved }];
    for (const sv of resolved) {
      let remaining = sv.amount;
      if (subtypeId != null && stipends[subtypeId]) {
        const avail = stipends[subtypeId][sv.currency as number] ?? 0;
        if (avail > 0) {
          const used = Math.min(remaining, avail);
          stipends[subtypeId][sv.currency as number] -= used;
          remaining -= used;
        }
      }
      if (remaining !== 0) {
        const abbrev = abbrevFor(sv.currency);
        delta.set(abbrev, (delta.get(abbrev) ?? 0) - remaining);
      }
    }
    return delta;
  }

  // Helper: add a drawback value to a delta map (positive gain)
  function addDrawbackValue(value: Value | number, cost: ModifiedCost, delta: Map<string, number>) {
    let resolved = purchaseValue(value, cost);
    if (typeof resolved === "number") {
      delta.set(abbrevFor(DEFAULT_CURRENCY_ID), (delta.get(abbrevFor(DEFAULT_CURRENCY_ID)) ?? 0) + resolved);
    } else {
      for (const sv of resolved) {
        const abbrev = abbrevFor(sv.currency);
        delta.set(abbrev, (delta.get(abbrev) ?? 0) + sv.amount);
      }
    }
  }

  // ── Chain Drawbacks ──
  {
    const delta = new Map<string, number>();
    const chainDrawbackIds = calculatedData.chainDrawbacks?.[characterId]?.[jumpId] ?? [];
    for (const pId of chainDrawbackIds) {
      const p = chain.purchases.O[pId] as Drawback | undefined;
      if (!p) continue;
      const override = p.overrides?.[jumpId]?.[characterId];
      if (override?.type === OverrideType.Excluded) continue;
      if (override?.type === OverrideType.BoughtOffTemp || override?.type === OverrideType.BoughtOffPermanent) {
        // Deduct buyoff cost
        const buyoffCost = deductCost(p.value as Value | number, override.modifier ?? FULL_COST, undefined);
        for (const [abbrev, amount] of buyoffCost) delta.set(abbrev, (delta.get(abbrev) ?? 0) + amount);
        continue;
      }
      addDrawbackValue(p.value as Value | number, override?.modifier ?? FULL_COST, delta);
    }
    push("Chain Drawbacks", delta);
  }

  // ── Retained Drawbacks ──
  {
    const delta = new Map<string, number>();
    const retained = calculatedData.retainedDrawbacks?.[characterId]?.[jumpId] ?? [];
    for (const pId of retained) {
      const p = chain.purchases.O[pId] as Drawback | undefined;
      if (!p) continue;
      const override = p.overrides?.[jumpId]?.[characterId];
      if (override?.type === OverrideType.Excluded) continue;
      if (override?.type === OverrideType.BoughtOffTemp || override?.type === OverrideType.BoughtOffPermanent) {
        const buyoffCost = deductCost(p.value as Value | number, override.modifier ?? FULL_COST, undefined);
        for (const [abbrev, amount] of buyoffCost) delta.set(abbrev, (delta.get(abbrev) ?? 0) + amount);
        continue;
      }
      addDrawbackValue(p.value as Value | number, override?.modifier ?? FULL_COST, delta);
    }
    push("Retained Drawbacks", delta);
  }

  // ── Drawbacks (this jump) ──
  {
    const delta = new Map<string, number>();
    for (const pId of jump.drawbacks?.[characterId] ?? []) {
      const p = chain.purchases.O[pId as Id<GID.Purchase>] as Drawback | undefined;
      if (!p) continue;
      addDrawbackValue(p.value as Value | number, p.cost ?? FULL_COST, delta);
    }
    push("Drawbacks", delta);
  }

  // ── Perks ──
  {
    const delta = new Map<string, number>();
    for (const pId of jump.purchases?.[characterId] ?? []) {
      const p = chain.purchases.O[pId as Id<GID.Purchase>];
      if (!p || p.type !== PurchaseType.Perk) continue;
      const subtypeId = (p as BasicPurchase).subtype as number | undefined;
      const d = deductCost(p.value as Value, p.cost ?? FULL_COST, subtypeId);
      for (const [abbrev, amount] of d) delta.set(abbrev, (delta.get(abbrev) ?? 0) + amount);
      // Subpurchases
      const bp = p as BasicPurchase;
      if (bp.subpurchases) {
        if (subtypeId != null) {
          if (!stipends[subtypeId]) stipends[subtypeId] = {};
          for (const sv of bp.subpurchases.stipend ?? []) {
            stipends[subtypeId][sv.currency as number] = (stipends[subtypeId][sv.currency as number] ?? 0) + sv.amount;
          }
        }
        for (const subId of bp.subpurchases.list) {
          const sub = chain.purchases.O[subId];
          if (!sub) continue;
          const sd = deductCost(sub.value as Value, sub.cost ?? FULL_COST, subtypeId);
          for (const [abbrev, amount] of sd) delta.set(abbrev, (delta.get(abbrev) ?? 0) + amount);
        }
      }
    }
    push("Perks", delta);
  }

  // ── Items ──
  {
    const delta = new Map<string, number>();
    for (const pId of jump.purchases?.[characterId] ?? []) {
      const p = chain.purchases.O[pId as Id<GID.Purchase>];
      if (!p || p.type !== PurchaseType.Item) continue;
      const subtypeId = (p as BasicPurchase).subtype as number | undefined;
      const d = deductCost(p.value as Value, p.cost ?? FULL_COST, subtypeId);
      for (const [abbrev, amount] of d) delta.set(abbrev, (delta.get(abbrev) ?? 0) + amount);
      const bp = p as BasicPurchase;
      if (bp.subpurchases) {
        if (subtypeId != null) {
          if (!stipends[subtypeId]) stipends[subtypeId] = {};
          for (const sv of bp.subpurchases.stipend ?? []) {
            stipends[subtypeId][sv.currency as number] = (stipends[subtypeId][sv.currency as number] ?? 0) + sv.amount;
          }
        }
        for (const subId of bp.subpurchases.list) {
          const sub = chain.purchases.O[subId];
          if (!sub) continue;
          const sd = deductCost(sub.value as Value, sub.cost ?? FULL_COST, subtypeId);
          for (const [abbrev, amount] of sd) delta.set(abbrev, (delta.get(abbrev) ?? 0) + amount);
        }
      }
    }
    push("Items", delta);
  }

  // ── Companion Imports ──
  {
    const delta = new Map<string, number>();
    for (const pId of jump.purchases?.[characterId] ?? []) {
      const p = chain.purchases.O[pId as Id<GID.Purchase>];
      if (!p || p.type !== PurchaseType.Companion) continue;
      const ci = p as CompanionImport;
      const d = deductCost(ci.value as Value, ci.cost ?? FULL_COST, undefined);
      for (const [abbrev, amount] of d) delta.set(abbrev, (delta.get(abbrev) ?? 0) + amount);
    }
    push("Companion Imports", delta);
  }

  if (sections.length === 0) return null;

  // Always show the primary currency total (even if 0); other currencies only when non-zero.
  const primaryAbbrev = abbrevFor(DEFAULT_CURRENCY_ID);
  const totals: IRBudgetEntry[] = Array.from(net.entries())
    .filter(([abbrev, amount]) => amount !== 0 || abbrev === primaryAbbrev)
    .map(([currencyAbbrev, amount]) => ({ currencyAbbrev, amount }));
  // Ensure primary currency appears even if it was never touched
  if (!totals.some((e) => e.currencyAbbrev === primaryAbbrev)) {
    totals.push({ currencyAbbrev: primaryAbbrev, amount: 0 });
  }

  return { sections, totals };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildExportIR(
  chain: Chain,
  calculatedData: Partial<CalculatedData>,
  options: ExportOptions,
): ExportIR {
  const { scope, characterId, sections } = options;

  // Resolve character name
  const character = chain.characters.O[characterId];
  const characterName = character?.name ?? "Unknown";

  // Filter jumps by scope
  const jumpIds =
    scope.kind === "chain"
      ? chain.jumpList
      : scope.kind === "jump"
        ? chain.jumpList.filter((jId) => jId === scope.jumpId)
        : chain.jumpList;

  const jumps: IRJump[] = [];

  for (const jumpId of jumpIds) {
    const jump = chain.jumps.O[jumpId];
    if (!jump) continue;

    // Primary characters always participate in every jump.
    // Companions only participate in jumps they were explicitly added to.
    const isPrimaryCharacter = chain.characters.O[characterId]?.primary ?? false;
    if (!isPrimaryCharacter && !jump.characters.includes(characterId)) continue;

    const rawJumpNumber = calculatedData.jumpNumber?.[jumpId] ?? 0;
    const jumpNumber = rawJumpNumber + (chain.chainSettings.startWithJumpZero ? 0 : 1);

    // ── Starting Points ──
    const startingPoints = sections.costs
      ? buildStartingPoints(chain, jump, characterId)
      : null;

    // ── Origins ──
    const abbrevFor = (curId: Id<LID.Currency>) => jump.currencies.O[curId]?.abbrev ?? "CP";

    // ── Bank Deposit ──
    const bankDepositRaw = sections.costs
      ? (jump.bankDeposits?.[characterId] ?? 0)
      : 0;
    const bankDeposit: IRBudgetEntry | null =
      bankDepositRaw !== 0
        ? { amount: bankDepositRaw, currencyAbbrev: abbrevFor(DEFAULT_CURRENCY_ID) }
        : null;
    const origins: IROrigin[] = [];
    if (sections.origins) {
      const charOrigins = jump.origins?.[characterId];
      if (charOrigins) {
        for (const [catIdStr, originList] of Object.entries(charOrigins) as [string, import("@/chain/data/Jump").Origin[] | undefined][]) {
          if (!originList) continue;
          const catId = createId<LID.OriginCategory>(Number(catIdStr));
          const cat = jump.originCategories.O[catId];
          const catName = cat?.name ?? "Origin";
          for (const origin of originList) {
            const summary = origin.summary ?? "";
            if (!summary) continue;
            const rawDesc = origin.description;
            const originValue = origin.value;
            const cost: IRCost | null =
              sections.costs && originValue?.amount
                ? {
                    display: `${originValue.amount} ${abbrevFor(originValue.currency)}`,
                    raw: originValue.amount,
                    currencyAbbrev: abbrevFor(originValue.currency),
                  }
                : null;
            origins.push({
              categoryName: catName,
              summary,
              description:
                sections.descriptions && rawDesc && rawDesc !== "undefined" ? rawDesc : "",
              cost,
            });
          }
        }
      }
    }

    // ── Perks / Items (grouped by subtype) ──
    const purchaseIds = jump.purchases?.[characterId] ?? [];
    const perksBySubtype = new Map<number | null, IRPurchase[]>();
    const itemsBySubtype = new Map<number | null, IRPurchase[]>();

    for (const id of purchaseIds) {
      const p = chain.purchases.O[id as Id<GID.Purchase>];
      if (!p) continue;
      const subtypeId: number | null = (p as BasicPurchase).subtype as number ?? null;
      if (p.type === PurchaseType.Perk) {
        const ir = buildPurchaseIR(id, chain, jump, sections.costs, sections.descriptions);
        if (ir) {
          if (!perksBySubtype.has(subtypeId)) perksBySubtype.set(subtypeId, []);
          perksBySubtype.get(subtypeId)!.push(ir);
        }
      } else if (p.type === PurchaseType.Item) {
        const ir = buildPurchaseIR(id, chain, jump, sections.costs, sections.descriptions);
        if (ir) {
          if (!itemsBySubtype.has(subtypeId)) itemsBySubtype.set(subtypeId, []);
          itemsBySubtype.get(subtypeId)!.push(ir);
        }
      }
    }

    // Build ordered sections — follow subtype registry order, then null (no subtype) last
    const perkSections: IRPurchaseSection[] = [];
    const itemSections: IRPurchaseSection[] = [];

    for (const [stIdStr, st] of Object.entries(jump.purchaseSubtypes.O) as [string, import("@/chain/data/Jump").PurchaseSubtype | undefined][]) {
      if (!st) continue;
      const stId = Number(stIdStr);
      const stPerks = perksBySubtype.get(stId);
      if (stPerks && stPerks.length > 0)
        perkSections.push({ heading: st.name, purchases: stPerks });
      const stItems = itemsBySubtype.get(stId);
      if (stItems && stItems.length > 0)
        itemSections.push({ heading: st.name, purchases: stItems });
    }
    // Purchases with no subtype — empty heading means "render directly under parent"
    const noStPerks = perksBySubtype.get(null);
    if (noStPerks && noStPerks.length > 0)
      perkSections.push({ heading: "", purchases: noStPerks });
    const noStItems = itemsBySubtype.get(null);
    if (noStItems && noStItems.length > 0)
      itemSections.push({ heading: "", purchases: noStItems });

    // ── Drawbacks ──
    const drawbacks: IRDrawback[] = [];
    if (sections.drawbacks) {
      // Chain drawbacks first
      const chainDrawbacks = calculatedData.chainDrawbacks?.[characterId]?.[jumpId] ?? [];
      for (const id of chainDrawbacks) {
        const ir = buildDrawbackIR(id, chain, jump, jumpId, characterId, sections.costs, sections.descriptions, false, true);
        if (ir) drawbacks.push(ir);
      }

      // Drawbacks taken this jump
      const drawbackIds = jump.drawbacks?.[characterId] ?? [];
      for (const id of drawbackIds) {
        const ir = buildDrawbackIR(id, chain, jump, jumpId, characterId, sections.costs, sections.descriptions, false, false);
        if (ir) drawbacks.push(ir);
      }

      // Retained drawbacks from previous jumps
      const retained = calculatedData.retainedDrawbacks?.[characterId]?.[jumpId] ?? [];
      for (const id of retained) {
        if (drawbackIds.includes(id)) continue;
        const ir = buildDrawbackIR(id, chain, jump, jumpId, characterId, sections.costs, sections.descriptions, true, false);
        if (ir) drawbacks.push(ir);
      }
    }

    // ── Scenarios ──
    const scenarios: IRScenario[] = [];
    if (sections.scenarios) {
      const scenarioIds = jump.scenarios?.[characterId] ?? [];
      for (const id of scenarioIds) {
        const ir = buildScenarioIR(id, chain, jump, sections.costs, sections.descriptions);
        if (ir) scenarios.push(ir);
      }
    }

    // ── Companion Imports ──
    const companions: IRCompanionImport[] = [];
    if (sections.companions) {
      for (const pId of jump.purchases?.[characterId] ?? []) {
        const p = chain.purchases.O[pId as Id<GID.Purchase>];
        if (!p || p.type !== PurchaseType.Companion) continue;
        const ci = p as CompanionImport;
        const characterNames = ci.importData.characters
          .map((cId) => chain.characters.O[cId]?.name)
          .filter((n): n is string => !!n);
        const cost = sections.costs
          ? formatCostForExport(ci.value, ci.cost, jump.currencies)
          : null;
        companions.push({ name: ci.name, characterNames, cost });
      }
    }

    // ── Supplements ──
    const supplementSections: IRSupplementSection[] = [];
    const suppFilter = sections.supplements;
    if (jump.useSupplements && (suppFilter === "all" || suppFilter.length > 0)) {
      for (const [suppIdStr] of Object.entries(
        jump.supplementPurchases?.[characterId] ?? {},
      )) {
        const suppId = createId<GID.Supplement>(Number(suppIdStr));
        if (suppFilter !== "all") {
          const supp = chain.supplements.O[suppId];
          if (!supp || !suppFilter.includes(supp.name)) continue;
        }
        const sec = buildSupplementSectionIR(
          suppId,
          jumpId,
          characterId,
          chain,
          jump,
          calculatedData,
          sections.costs,
          sections.descriptions,
        );
        if (sec) supplementSections.push(sec);
      }
    }

    // ── Narrative ──
    let narrative: IRNarrative | null = null;
    if (sections.narrative && jump.useNarrative) {
      const nb = jump.narratives?.[characterId];
      if (nb) {
        narrative = {
          goals: nb.goals,
          challenges: nb.challenges,
          accomplishments: nb.accomplishments,
        };
      }
    }

    // ── Notes ──
    const notes = sections.notes ? (jump.notes?.[characterId] ?? "") : "";

    // ── Alt Forms ──
    const altForms: IRAltForm[] = [];
    if (sections.altForms && jump.useAltForms) {
      const imageUrls = useImageUrlCache.getState().urls;
      const altFormIds = jump.altForms?.[characterId] ?? [];
      for (const id of altFormIds) {
        const af = chain.altforms.O[id];
        if (!af) continue;
        let imageUrl: string | null = null;
        if (af.image?.type === "external") imageUrl = af.image.URL;
        else if (af.image?.type === "internal") imageUrl = imageUrls[af.image.imgId] ?? null;
        altForms.push({
          name: af.name,
          species: af.species,
          physicalDescription: af.physicalDescription,
          capabilities: af.capabilities,
          imageUrl,
        });
      }
    }

    // ── Budget ──
    const budgetSummary = sections.budget
      ? buildBudgetSummary(chain, jump, jumpId, characterId, calculatedData)
      : null;

    // Only expose actual HTTP URLs as sourceUrl; jumpdoc IDs are internal references.
    const sourceUrl: string | null =
      jump.source.type === 1 /* URL */ ? jump.source.URL : null;

    jumps.push({
      jumpName: jump.name,
      jumpNumber,
      duration: formatDuration(jump.duration),
      sourceUrl,
      startingPoints,
      bankDeposit,
      origins,
      perkSections,
      itemSections,
      companions,
      drawbacks,
      scenarios,
      supplements: supplementSections,
      narrative,
      notes,
      altForms,
      budget: budgetSummary,
    });
  }

  return {
    chainName: chain.name,
    characterName,
    exportedAt: new Date().toISOString(),
    isSingleJump: scope.kind === "jump",
    jumps,
  };
}
