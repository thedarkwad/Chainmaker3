import { CompanionAccess } from "@/chain/data/ChainSupplement";
import { Chain } from "@/chain/data/Chain";
import { DEFAULT_CURRENCY_ID } from "@/chain/data/Jump";
import {
  BasicPurchase,
  CostModifier,
  CompanionImport,
  DefaultSubtype,
  Drawback,
  OverrideType,
  PurchaseType,
  RewardType,
  Scenario,
  SupplementImport,
  SupplementScenario,
  Value,
  purchaseValue,
} from "@/chain/data/Purchase";
import { createId, GID, Id, LID, Lookup } from "@/chain/data/types";
import { CalculatedData, Budget, CharacterPassportStats } from "@/chain/data/CalculatedData";
import { useChainStore } from "./Store";
import { shallow } from "zustand/shallow";
import { produce } from "immer";
import { objFilter, objMap } from "@/utilities/miscUtilities";

// ─────────────────────────────────────────────────────────────────────────────
// Pure adjust functions — no store access; accept data, return computed results
// ─────────────────────────────────────────────────────────────────────────────

export function adjustBank(
  chain: Chain,
  charId: Id<GID.Character>,
  jumpId: Id<GID.Jump>,
  jumpChunks: CalculatedData["jumpChunks"],
  jumpNumber: CalculatedData["jumpNumber"],
  bankBalance: CalculatedData["bankBalance"] | undefined,
  interestRate: number,
  depositRatio: number,
): { balance: number; totalDeposit: number } {
  const n = jumpNumber[jumpId];
  const jumpChunk = jumpChunks[n];
  let balance = n > 0 ? (bankBalance?.[charId]?.[jumpChunks[n - 1][0]] ?? 0) : 0;

  balance = Math.floor(balance * (1 + interestRate / 100));
  let positiveDeposit = 0;
  let negativeDeposit = 0;
  jumpChunk.forEach((jId) => {
    const deposit = chain.jumps.O[jId]?.bankDeposits?.[charId] ?? 0;
    if (deposit > 0) positiveDeposit += deposit;
    else negativeDeposit += deposit;
  });

  balance += Math.floor((positiveDeposit * depositRatio) / 100) + negativeDeposit;
  return { balance, totalDeposit: positiveDeposit };
}

export function adjustJumpAccess(
  chain: Chain,
  charId: Id<GID.Character>,
): { jumpAccess: Set<number>; supplementAccess: Lookup<GID.Supplement, Set<number>> } {
  const jumpAccess = new Set<number>();
  const supplementAccess: Lookup<GID.Supplement, Set<number>> = {};
  const primary = chain.characters?.O?.[charId]?.primary;

  for (const jId of chain.jumpList) {
    if (primary) {
      jumpAccess.add(jId);
      continue;
    }
    for (const charId2 of chain.characterList) {
      if (!chain.jumps.O[jId]?.purchases?.[charId2]) continue;
      for (const pId of chain.jumps.O[jId].purchases[charId2]) {
        if (!chain.purchases.O[pId]) continue;
        if (
          chain.purchases.O[pId].type == PurchaseType.Companion &&
          (chain.purchases.O[pId] as CompanionImport).importData.characters.includes(charId)
        ) {
          jumpAccess.add(jId);
          continue;
        }
      }
    }
  }

  // Compute jump chunks and numbers inline (same algorithm as adjustJumpOrganization).
  const numbers: Lookup<GID.Jump, number> = {};
  const chunks: Id<GID.Jump>[][] = [];
  {
    let currentChunk: Id<GID.Jump>[] = [];
    let currentNumber = 0;
    for (let i = 0; i < chain.jumpList.length; i++) {
      const jId = chain.jumpList[i];
      numbers[jId] = currentNumber;
      currentChunk.push(jId);
      if (
        i + 1 === chain.jumpList.length ||
        chain.jumps.O[chain.jumpList[i + 1]]?.parentJump === undefined
      ) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentNumber++;
      }
    }
  }

  // offset converts internal 0-based chunk numbers to user-visible jump numbers.
  const offset = chain.chainSettings.startWithJumpZero ? 0 : 1;

  const primaryCharIds = chain.characterList.filter((cId) => chain.characters.O[cId]?.primary);

  for (const suppIdStr of Object.keys(chain.supplements.O)) {
    const suppGid = createId<GID.Supplement>(+suppIdStr);
    const supp = chain.supplements.O[suppGid];
    if (!supp) continue;

    const suppJumpIds = new Set<number>();
    const hasBaseAccess = primary || supp.companionAccess === CompanionAccess.Available;

    if (hasBaseAccess) {
      // Include all accessible jumps in chunks at or after initialJump.
      // If singleJump, stop after the first qualifying chunk.
      for (const chunk of chunks) {
        const displayNumber = numbers[chunk[0]] + offset;
        if (displayNumber < supp.initialJump) continue;
        const accessible = chunk.filter((jId) => jumpAccess.has(jId));
        if (accessible.length === 0) continue;
        for (const jId of accessible) suppJumpIds.add(jId);
        if (supp.singleJump) break;
      }
    } else if (supp.companionAccess === CompanionAccess.Imports) {
      // Companions with Imports access get supplement access:
      //   - From the first chunk where any primary has a percentage import that includes charId, onwards.
      //   - Plus any individual chunk where any primary has a direct (non-percentage) import for charId.
      let firstPercentageChunkIdx = Infinity;
      const directImportChunkIndices = new Set<number>();

      for (let ci = 0; ci < chunks.length; ci++) {
        for (const jId of chunks[ci]) {
          const jump = chain.jumps.O[jId];
          if (!jump) continue;
          for (const primId of primaryCharIds) {
            for (const pId of jump.supplementPurchases?.[primId]?.[suppGid] ?? []) {
              const p = chain.purchases.O[pId];
              if (!p || p.type !== PurchaseType.SupplementImport) continue;
              const si = p as SupplementImport;
              if (!si.importData.characters.includes(charId)) continue;
              if (si.importData.percentage > 0) {
                firstPercentageChunkIdx = Math.min(firstPercentageChunkIdx, ci);
              } else {
                directImportChunkIndices.add(ci);
              }
            }
          }
        }
      }

      // Supplement import grants access directly — no jump-access check needed.
      for (let ci = 0; ci < chunks.length; ci++) {
        if (ci >= firstPercentageChunkIdx || directImportChunkIndices.has(ci)) {
          for (const jId of chunks[ci]) suppJumpIds.add(jId);
        }
      }
    }

    supplementAccess[suppGid] = suppJumpIds;
  }

  return { jumpAccess, supplementAccess };
}

export function adjustRetainedDrawbacks(
  chain: Chain,
  jumpChunks: CalculatedData["jumpChunks"],
  jumpNumber: CalculatedData["jumpNumber"],
  charId: Id<GID.Character>,
  jumpId: Id<GID.Jump>,
): Id<GID.Purchase>[] {
  const J = jumpNumber[jumpId];

  const currentChunkIdx = jumpChunks.findIndex((chunk) => chunk.includes(jumpId));
  if (currentChunkIdx === -1) return [];

  const currentChunk = jumpChunks[currentChunkIdx];
  const priorJumps: Id<GID.Jump>[] = jumpChunks.slice(0, currentChunkIdx).flat();
  const currentChunkOthers = currentChunk.filter((j) => j !== jumpId);

  const retained: Id<GID.Purchase>[] = [];

  const isBoughtOff = (
    drawback: Drawback,
    permJumps: Id<GID.Jump>[],
    tempOrPermJumps: Id<GID.Jump>[],
  ) => {
    for (const qId of permJumps) {
      if (drawback.overrides?.[qId]?.[charId]?.type === OverrideType.BoughtOffPermanent)
        return true;
    }
    for (const qId of tempOrPermJumps) {
      const t = drawback.overrides?.[qId]?.[charId]?.type;
      if (t === OverrideType.BoughtOffPermanent || t === OverrideType.BoughtOffTemp) return true;
    }
    return false;
  };

  for (const pJumpId of priorJumps) {
    const priorJump = chain.jumps.O[pJumpId];
    if (!priorJump) continue;

    const PN = jumpNumber[pJumpId];

    for (const pId of priorJump.drawbacks[charId] ?? []) {
      const drawback = chain.purchases.O[pId] as Drawback;
      if (!drawback || drawback.type !== PurchaseType.Drawback) continue;

      const duration = drawback.duration;
      if (duration !== undefined && J >= PN + duration) continue;

      if (!isBoughtOff(drawback, priorJumps, currentChunkOthers)) retained.push(pId);
    }
  }

  if (chain.chainSettings.supplementBlockDrawbackSharing) {
    for (const pJumpId of currentChunkOthers) {
      const blockJump = chain.jumps.O[pJumpId];
      if (!blockJump) continue;

      for (const pId of blockJump.drawbacks[charId] ?? []) {
        const drawback = chain.purchases.O[pId] as Drawback;
        if (!drawback || drawback.type !== PurchaseType.Drawback) continue;

        const duration = drawback.duration;
        if (duration !== undefined && duration <= 1) continue;

        if (!isBoughtOff(drawback, priorJumps, currentChunkOthers)) retained.push(pId);
      }
    }
  }

  return retained;
}

export function adjustSupplementInvestments(
  chain: Chain,
  jumpChunks: CalculatedData["jumpChunks"],
  charId: Id<GID.Character>,
  jumpId: Id<GID.Jump>,
  suppId: Id<GID.Supplement>,
): number {
  const currentChunkIdx = jumpChunks.findIndex((chunk) => chunk.includes(jumpId));
  if (currentChunkIdx === -1) return 0;

  let total = 0;
  for (const jId of jumpChunks[currentChunkIdx]) {
    const localInvestment = chain.jumps.O[jId]?.supplementInvestments?.[charId]?.[suppId] ?? 0;
    total += Math.round(
      localInvestment *
        (localInvestment > 0 ? chain.supplements.O[suppId].investmentRatio / 100 : 0),
    );
  }
  return total;
}

export function adjustGrossSupplementStipend(
  chain: Chain,
  jumpChunks: CalculatedData["jumpChunks"],
  jumpNumber: CalculatedData["jumpNumber"],
  investment: number | undefined,
  grossSupplementStipend: CalculatedData["grossSupplementStipend"] | undefined,
  companionSupplementPercentage: CalculatedData["companionSupplementPercentage"] | undefined,
  charId: Id<GID.Character>,
  jumpId: Id<GID.Jump>,
  suppId: Id<GID.Supplement>,
): number {
  const supp = chain.supplements.O[suppId]!;
  const char = chain.characters.O[charId]!;
  const isPrimary = char.primary;
  const hasBaseAccess = isPrimary || supp.companionAccess === CompanionAccess.Available;

  const currentChunkIdx = jumpChunks.findIndex((chunk) => chunk.includes(jumpId));
  if (currentChunkIdx === -1) return 0;

  const priorChunks = jumpChunks.slice(0, currentChunkIdx);
  const currentChunk = jumpChunks[currentChunkIdx];

  let gross = 0;

  // 1. Initial stipend — only in the block where the display jump number matches supp.initialJump.
  // jumpNumber is always 0-based internally; add offset to convert to the user-visible number.
  const jumpOffset = chain.chainSettings.startWithJumpZero ? 0 : 1;
  if (hasBaseAccess && jumpNumber[jumpId] + jumpOffset === supp.initialJump) {
    gross += supp.initialStipend;
  }

  // 2. Positive investments (ratio already applied in supplementInvestments).
  gross += investment ?? 0;

  // 3. Per-block stipend.
  if (hasBaseAccess) gross += supp.perJumpStipend;

  // 4. Negative supplement purchases (drawback-style) in this block.
  for (const jId of currentChunk) {
    const jump = chain.jumps.O[jId];
    if (!jump) continue;
    for (const pId of jump.supplementPurchases?.[charId]?.[suppId] ?? []) {
      const p = chain.purchases.O[pId];
      if (!p) continue;
      if (
        (p.type === PurchaseType.SupplementPerk || p.type === PurchaseType.SupplementItem) &&
        typeof p.value === "number" &&
        p.value < 0
      ) {
        const effective = purchaseValue(p.value, p.cost);
        if (typeof effective === "number") gross -= effective;
      }
    }
  }

  // 5. Scenario rewards (if enableScenarios).
  if (supp.enableScenarios) {
    for (const jId of currentChunk) {
      const jump = chain.jumps.O[jId];
      if (!jump) continue;
      for (const pId of jump.supplementPurchases?.[charId]?.[suppId] ?? []) {
        const p = chain.purchases.O[pId];
        if (!p || p.type !== PurchaseType.SupplementScenario) continue;
        for (const reward of (p as SupplementScenario).rewards) {
          if (reward.type === RewardType.Currency) gross += reward.value;
        }
      }
    }
  }

  // 6. Companion import income (Imports access only).
  if (!isPrimary && supp.companionAccess === CompanionAccess.Imports) {
    const primaryCharIds = chain.characterList.filter((cId) => chain.characters.O[cId]?.primary);

    for (const primId of primaryCharIds) {
      // Allowances: scan this block's imports from primId that include charId.
      for (const jId of currentChunk) {
        const jump = chain.jumps.O[jId];
        if (!jump) continue;
        for (const pId of jump.supplementPurchases?.[primId]?.[suppId] ?? []) {
          const p = chain.purchases.O[pId];
          if (!p || p.type !== PurchaseType.SupplementImport) continue;
          const si = p as SupplementImport;
          if (!si.importData.characters.includes(charId)) continue;
          gross += si.importData.allowance;
        }
      }

      // Percentage income.
      let oldCumPct = 0;
      let primaryPriorAccumulated = 0;
      const newPct = companionSupplementPercentage?.[charId]?.[primId]?.[jumpId]?.[suppId] ?? 0;
      if (newPct > 0)
        for (const priorChunk of priorChunks) {
          const priorJump = priorChunk[0];
          oldCumPct +=
            companionSupplementPercentage?.[charId]?.[primId]?.[priorJump]?.[suppId] ?? 0;
          primaryPriorAccumulated += grossSupplementStipend?.[primId]?.[priorJump]?.[suppId] ?? 0;
        }

      const primaryGrossK = grossSupplementStipend?.[primId]?.[jumpId]?.[suppId] ?? 0;

      gross += Math.round(((oldCumPct + newPct) * primaryGrossK) / 100);
      gross += Math.round((newPct * primaryPriorAccumulated) / 100);
    }
  }

  return gross;
}

export function adjustChainDrawbacks(
  chain: Chain,
  jumpChunks: CalculatedData["jumpChunks"],
  charId: Id<GID.Character>,
  jumpId: Id<GID.Jump>,
): Id<GID.Purchase>[] {
  const currentChunkIdx = jumpChunks.findIndex((chunk) => chunk.includes(jumpId));
  if (currentChunkIdx === -1) return [];

  const currentChunk = jumpChunks[currentChunkIdx];
  const priorJumps: Id<GID.Jump>[] = jumpChunks.slice(0, currentChunkIdx).flat();
  const currentChunkOthers = currentChunk.filter((j) => j !== jumpId);

  const active: Id<GID.Purchase>[] = [];

  for (const pId of chain.chainDrawbackList) {
    const p = chain.purchases.O[pId] as Drawback;
    if (!p || p.type !== PurchaseType.ChainDrawback) continue;
    if (p.duration && currentChunkIdx >= p.duration) continue;

    let boughtOff = false;

    for (const qId of priorJumps) {
      const override = p.overrides?.[qId]?.[charId];
      if (override?.type === OverrideType.BoughtOffPermanent) {
        boughtOff = true;
        break;
      }
    }

    if (!boughtOff) {
      for (const qId of currentChunkOthers) {
        const override = p.overrides?.[qId]?.[charId];
        if (
          override?.type === OverrideType.BoughtOffPermanent ||
          override?.type === OverrideType.BoughtOffTemp
        ) {
          boughtOff = true;
          break;
        }
      }
    }

    if (!boughtOff) active.push(pId);
  }

  return active;
}

export function adjustBudget(
  chain: Chain,
  retainedDrawbacks: Id<GID.Purchase>[] | undefined,
  chainDrawbacks: Id<GID.Purchase>[] | undefined,
  jumpChunks: CalculatedData["jumpChunks"] | undefined,
  grossSupplementStipend: CalculatedData["grossSupplementStipend"] | undefined,
  charId: Id<GID.Character>,
  jumpId: Id<GID.Jump>,
  suppId?: Id<GID.Supplement>,
): { budget: Budget | undefined; suppBudgets: Lookup<GID.Supplement, number> } {
  const jump = chain.jumps.O[jumpId];
  const char = chain.characters.O[charId];
  const isPrimary = char.primary;

  if (!jump)
    return {
      budget: undefined,
      suppBudgets: {},
    };

  // ── Main character budget (skip when only recomputing a single supplement) ──
  let budget: Budget | undefined;
  if (suppId == null) {
    const currencies = jump.currencies.O;
    const subtypes = jump.purchaseSubtypes.O;
    budget = {
      currency: objMap(currencies, (o) => (isPrimary ? +o.budget : 0)),
      stipends: objMap(subtypes, (st) =>
        Object.fromEntries(
          st.stipend.map(({ currency, amount }) => [currency, isPrimary ? +amount : 0]),
        ),
      ),
      originStipend: { ...(jump.originStipend ?? { amount: 0, currency: DEFAULT_CURRENCY_ID }) },
      companionStipend: {
        ...(jump.companionStipend ?? { amount: 0, currency: DEFAULT_CURRENCY_ID }),
      },
      drawbackCP: 0,
      remainingDiscounts: Object.fromEntries(
        Object.entries(subtypes)
          .filter(([, st]) => st.floatingDiscountThresholds?.length)
          .map(([id, st]) => [
            id,
            st
              .floatingDiscountThresholds!.slice()
              .sort((a, b) => a.amount - b.amount)
              .map((sv) => ({ value: { ...sv }, n: 1 })),
          ]),
      ) as Budget["remainingDiscounts"],
    } as Budget;

    budget.currency[DEFAULT_CURRENCY_ID] -= jump.bankDeposits[charId] ?? 0;

    // Deduct origin costs.
    const charOrigins = jump.origins?.[charId];
    if (charOrigins) {
      for (const catIdStr in charOrigins) {
        for (const origin of charOrigins[+catIdStr as Id<LID.OriginCategory>] ?? []) {
          let stipendDeduction =
            origin.value.currency == budget.originStipend.currency
              ? Math.max(Math.min(budget.originStipend.amount, origin.value.amount), 0)
              : 0;
          budget.originStipend.amount -= stipendDeduction;
          budget.currency[origin.value.currency] =
            (budget.currency[origin.value.currency] ?? 0) - origin.value.amount + stipendDeduction;
        }
      }
    }

    // Deduct supplement investments from the main currency (currency 0).
    const charInvestments = jump.supplementInvestments?.[charId];
    if (charInvestments) {
      for (const suppIdStr in charInvestments) {
        budget.currency[DEFAULT_CURRENCY_ID] -= charInvestments[suppIdStr as any] ?? 0;
      }
    }

    // Apply currency exchanges.
    for (const ex of jump.currencyExchanges?.[charId] ?? []) {
      budget.currency[ex.oCurrency] = (budget.currency[ex.oCurrency] ?? 0) - ex.oamount;
      budget.currency[ex.tCurrency] = (budget.currency[ex.tCurrency] ?? 0) + ex.tamount;
    }

    // Add allowances and stipends granted by companion imports that include this character.
    for (const charId2 of chain.characterList) {
      for (const pId of jump.purchases[charId2] ?? []) {
        const p = chain.purchases.O[pId];
        if (!p) continue;
        if (p.type !== PurchaseType.Companion) continue;
        const ci = p as CompanionImport;
        if (!ci.importData.characters.includes(charId)) continue;
        for (const currIdStr in ci.importData.allowances) {
          const currGid = createId<LID.Currency>(+currIdStr);
          budget.currency[currGid] =
            (budget.currency[currGid] ?? 0) + ci.importData.allowances[currGid];
        }
        for (const currIdStr in ci.importData.stipend) {
          const currGid = createId<LID.Currency>(+currIdStr);
          const subtypeAmounts = ci.importData.stipend[currGid];
          if (!subtypeAmounts) continue;
          for (const subtypeIdStr in subtypeAmounts) {
            const subtypeGid = createId<LID.PurchaseSubtype>(+subtypeIdStr);
            const amount = subtypeAmounts[subtypeGid];
            if (!amount) continue;
            if (!budget.stipends[subtypeGid]) budget.stipends[subtypeGid] = {};
            budget.stipends[subtypeGid][currGid] =
              (budget.stipends[subtypeGid][currGid] ?? 0) + amount;
          }
        }
      }
    }

    // Add scenario rewards (currency and stipend types only).
    for (const pId of jump.scenarios[charId] ?? []) {
      const p = chain.purchases.O[pId] as Scenario;
      for (const reward of p.rewards) {
        if (reward.type === RewardType.Currency) {
          budget.currency[reward.currency] = (budget.currency[reward.currency] ?? 0) + reward.value;
        } else if (reward.type === RewardType.Stipend) {
          if (!budget.stipends[reward.subtype]) budget.stipends[reward.subtype] = {};
          budget.stipends[reward.subtype][reward.currency] =
            (budget.stipends[reward.subtype][reward.currency] ?? 0) + reward.value;
        }
      }
    }

    // Add chain drawback value (or deduct buyoff cost) for each applicable chain drawback.
    // Supplement jumps (those with a parentJump) only receive chain drawback budget when
    // chainDrawbacksSupplements is enabled.
    const companionsShare = chain.chainSettings.chainDrawbacksForCompanions;
    const isSupplementJump = jump.parentJump !== undefined;

    if (!isSupplementJump || chain.chainSettings.chainDrawbacksSupplements)
      for (const pId of chainDrawbacks ?? []) {
        const p = chain.purchases.O[pId] as Drawback;
        if (!p) continue;
        const override = p.overrides?.[jumpId]?.[charId];
        if (override?.type === OverrideType.Excluded) continue;
        if (
          override?.type === OverrideType.BoughtOffTemp ||
          override?.type === OverrideType.BoughtOffPermanent
        ) {
          if (isPrimary || companionsShare) {
            budget.currency[DEFAULT_CURRENCY_ID] -= purchaseValue(
              p.value,
              override.modifier ?? { modifier: CostModifier.Full },
            ) as number;
          }
          continue;
        }
        if (isPrimary || companionsShare) {
          budget.currency[DEFAULT_CURRENCY_ID] += purchaseValue(
            p.value,
            override?.modifier ?? { modifier: CostModifier.Full },
          ) as number;
          if (isPrimary && p.itemStipend) {
            const itemSubtype = DefaultSubtype[PurchaseType.Item];
            if (!budget.stipends[itemSubtype]) budget.stipends[itemSubtype] = {};
            budget.stipends[itemSubtype][DEFAULT_CURRENCY_ID] =
              (budget.stipends[itemSubtype][DEFAULT_CURRENCY_ID] ?? 0) + p.itemStipend;
          }
        } else if (p.companionStipend) {
          budget.currency[DEFAULT_CURRENCY_ID] =
            (budget.currency[DEFAULT_CURRENCY_ID] ?? 0) + p.companionStipend;
        }
      } // end chain drawbacks loop

    // Add value for each retained drawback (or deduct buyoff cost).
    for (const pId of retainedDrawbacks ?? []) {
      const p = chain.purchases.O[pId] as Drawback;
      if (!p) continue;
      const override = p.overrides?.[jumpId]?.[charId];
      if (override?.type === OverrideType.Excluded) continue;
      if (
        override?.type === OverrideType.BoughtOffTemp ||
        override?.type === OverrideType.BoughtOffPermanent
      ) {
        const cost = purchaseValue(
          p.value as Value,
          override.modifier ?? { modifier: CostModifier.Full },
        );
        if (typeof cost == "number")
          budget.currency[DEFAULT_CURRENCY_ID] = (budget.currency[DEFAULT_CURRENCY_ID] ?? 0) - cost;
        else
          for (const sv of cost)
            budget.currency[sv.currency] = (budget.currency[sv.currency] ?? 0) - sv.amount;
        continue;
      }
      const val = purchaseValue(
        p.value as Value,
        override?.modifier ?? { modifier: CostModifier.Full },
      ) as Value;
      for (const sv of val)
        budget.currency[sv.currency] = (budget.currency[sv.currency] ?? 0) + sv.amount;
    }

    // Add drawback value for each current-jump drawback (or deduct buyoff cost).
    for (const pId of jump.drawbacks[charId] ?? []) {
      const p = chain.purchases.O[pId] as Drawback;
      if (!p) {
        continue;
      }
      const val = purchaseValue(p.value, p.cost) as Value;
      for (const sv of val) {
        let amount = sv.amount;
        if (sv.currency == DEFAULT_CURRENCY_ID && jump.drawbackLimit) {
          [budget.drawbackCP, amount] = [
            budget.drawbackCP + amount,
            Math.min(amount, Math.max(0, jump.drawbackLimit - budget.drawbackCP)),
          ];
        }
        if ((p.subtype ?? null) === null)
          budget.currency[sv.currency] = (budget.currency[sv.currency] ?? 0) + amount;
        else
          budget.stipends[p.subtype!][sv.currency] =
            (budget.stipends[p.subtype!][sv.currency] ?? 0) + amount;
      }
    }

    // Deduct purchase costs, exhausting the subtype stipend first before the main currency.
    // Also collect eligible floating-discount purchases for the greedy pass below.
    const floatingEligible = new Map<string, { amount: number; currency: Id<LID.Currency> }[]>();
    for (const pId of jump.purchases[charId] ?? []) {
      const p = chain.purchases.O[pId];
      if (!p || !Array.isArray(p.value)) continue;

      let cost = purchaseValue(p.value, p.cost ?? { modifier: CostModifier.Full });

      let subtypeId: Id<LID.PurchaseSubtype> | undefined;
      if (p.type === PurchaseType.Perk || p.type === PurchaseType.Item) {
        subtypeId = (p as BasicPurchase).subtype;
      }

      // Collect for floating-discount greedy (single-currency purchases that opt in).
      if (subtypeId != null && (p as BasicPurchase).usesFloatingDiscount && p.value.length <= 1) {
        const sv = p.value[0];
        if (sv) {
          const key = String(subtypeId);
          if (!floatingEligible.has(key)) floatingEligible.set(key, []);
          floatingEligible.get(key)!.push({ amount: sv.amount, currency: sv.currency });
        }
      }

      if (typeof cost == "number") cost = [{ currency: DEFAULT_CURRENCY_ID, amount: cost }];
      for (const sv of cost) {
        let remaining = sv.amount;

        if (subtypeId != null && subtypeId >= 0) {
          const stipendRow = budget.stipends[subtypeId];
          const stipendAvail = stipendRow?.[sv.currency] ?? 0;
          if (stipendAvail > 0) {
            const fromStipend = Math.min(remaining, stipendAvail);
            stipendRow[sv.currency] -= fromStipend;
            remaining -= fromStipend;
          }
        } else if (p.type === PurchaseType.Companion) {
          let stipendDeduction =
            sv.currency == budget.companionStipend.currency
              ? Math.min(budget.companionStipend.amount, sv.amount)
              : 0;
          budget.companionStipend.amount -= stipendDeduction;
          remaining -= stipendDeduction;
        }

        if (remaining !== 0)
          budget.currency[sv.currency] = (budget.currency[sv.currency] ?? 0) - remaining;
      }

      // If this purchase has subpurchases, pour their stipend into the bucket,
      // then deduct each subpurchase cost the same way.
      const bp = p as BasicPurchase;
      if (bp.subpurchases) {
        if (subtypeId != null) {
          if (!budget.stipends[subtypeId]) budget.stipends[subtypeId] = {};
          for (const sv of bp.subpurchases.stipend ?? []) {
            budget.stipends[subtypeId][sv.currency] =
              (budget.stipends[subtypeId][sv.currency] ?? 0) + sv.amount;
          }
        }

        for (const subId of bp.subpurchases.list) {
          const sub = chain.purchases.O[subId];
          if (!sub || !Array.isArray(sub.value)) continue;

          let subCost = purchaseValue(
            sub.value as Value,
            sub.cost ?? { modifier: CostModifier.Full },
          );

          if (typeof subCost == "number")
            subCost = [{ currency: DEFAULT_CURRENCY_ID, amount: subCost }];
          for (const sv of subCost) {
            let remaining = sv.amount;

            if (subtypeId != null) {
              const stipendRow = budget.stipends[subtypeId];
              const stipendAvail: number = stipendRow?.[sv.currency] ?? 0;
              if (stipendAvail > 0) {
                const fromStipend = Math.min(remaining, stipendAvail);
                stipendRow[sv.currency] -= fromStipend;
                remaining -= fromStipend;
              }
            }

            if (remaining !== 0)
              budget.currency[sv.currency] = (budget.currency[sv.currency] ?? 0) - remaining;
          }
        }
      }
    }

    // Greedy floating-discount assignment.
    // For each subtype, sort eligible purchases descending by unmodified value,
    // then greedily decrement the smallest permissible threshold slot.
    for (const [key, purchases] of floatingEligible) {
      const subtypeId = createId<LID.PurchaseSubtype>(+key);
      const slots = budget.remainingDiscounts[subtypeId];
      if (!slots?.length) continue;

      purchases.sort((a, b) => b.amount - a.amount);

      for (const { amount, currency } of purchases) {
        // Permissible: same currency and threshold >= purchase's unmodified amount.
        // slots is sorted ascending by value, so first match is smallest permissible.
        const permissible = slots.filter(
          (s) => s.value.currency === currency && s.value.amount >= amount,
        );
        if (!permissible.length) continue;

        const withPositiveN = permissible.filter((s) => s.n > 0);
        const target = withPositiveN.length > 0 ? withPositiveN[0] : permissible[0];
        target.n--;
      }
    }

    Object.keys(jump.purchaseSubtypes.O).forEach((id) => {
      budget!.stipends[id as any] = objFilter(
        budget!.stipends[id as any],
        (v) => v != 0,
      ) as Budget["stipends"];
    });
  } // end suppId == null

  // ── Supplement budgets — accumulated per supplement across chunks ──
  // Computed by traversing all previous chunks from scratch so the result is
  // never dependent on potentially-stale stored supplementBudgets values.
  const suppBudgets: Lookup<GID.Supplement, number> = {};
  if (jumpChunks) {
    const currentChunkIdx = jumpChunks.findIndex((chunk) => chunk.includes(jumpId));
    if (currentChunkIdx !== -1) {
      const currentChunk = jumpChunks[currentChunkIdx];

      const suppIds =
        suppId != null
          ? [suppId]
          : Object.keys(chain.supplements.O).map((s) => +s as Id<GID.Supplement>);

      for (const sid of suppIds) {
        let sb = 0;

        // Accumulate all chunks before the current one.
        for (let ci = 0; ci < currentChunkIdx; ci++) {
          const chunk = jumpChunks[ci];
          const lastJumpInChunk = chunk.at(-1)!;
          sb += grossSupplementStipend?.[charId]?.[lastJumpInChunk]?.[sid] ?? 0;
          for (const jId of chunk) {
            const j = chain.jumps.O[jId];
            if (!j) continue;
            for (const pId of j.supplementPurchases?.[charId]?.[sid] ?? []) {
              const p = chain.purchases.O[pId];
              if (!p || typeof p.value !== "number" || p.value <= 0) continue;
              const effective = purchaseValue(p.value, p.cost);
              if (typeof effective === "number") sb -= effective;
            }
          }
        }

        // Current chunk.
        sb += grossSupplementStipend?.[charId]?.[jumpId]?.[sid] ?? 0;
        for (const jId of currentChunk) {
          const j = chain.jumps.O[jId];
          if (!j) continue;
          for (const pId of j.supplementPurchases?.[charId]?.[sid] ?? []) {
            const p = chain.purchases.O[pId];
            if (!p || typeof p.value !== "number" || p.value <= 0) continue;
            const effective = purchaseValue(p.value, p.cost);
            if (typeof effective === "number") sb -= effective;
          }
        }

        suppBudgets[sid] = sb;
      }
    }
  }

  return { budget, suppBudgets };
}

// ─────────────────────────────────────────────────────────────────────────────
// Synchronize functions — subscribe to store, call adjust, write results back
// ─────────────────────────────────────────────────────────────────────────────

export const synchronizeBank = (charId: Id<GID.Character>, jumpId: Id<GID.Jump>) =>
  useChainStore.subscribe(
    (state) => ({
      jumpChunks: state.calculatedData.jumpChunks!,
      jumpNumber: state.calculatedData.jumpNumber!,
      chain: state.chain,
      bankBalance: state.calculatedData.bankBalance,
      ...state.chain!.bankSettings,
    }),
    (data) => {
      if (
        !data.chain ||
        !Object.keys(data.chain.characters.O).includes(String(charId)) ||
        !Object.keys(data.chain.jumps.O).includes(String(jumpId))
      )
        return;

      const { balance, totalDeposit } = adjustBank(
        data.chain,
        charId,
        jumpId,
        data.jumpChunks,
        data.jumpNumber,
        data.bankBalance,
        data.interestRate,
        data.depositRatio,
      );

      useChainStore.setState((s) =>
        produce(s, (st) => {
          if (!st.calculatedData.bankBalance) st.calculatedData.bankBalance = {};
          if (!st.calculatedData.bankBalance[charId]) st.calculatedData.bankBalance[charId] = {};
          st.calculatedData.bankBalance[charId][jumpId] = balance;
          if (!st.calculatedData.totalBankDeposit) st.calculatedData.totalBankDeposit = {};
          if (!st.calculatedData.totalBankDeposit[charId])
            st.calculatedData.totalBankDeposit[charId] = {};
          st.calculatedData.totalBankDeposit[charId][jumpId] = totalDeposit;
        }),
      );
    },
    {
      equalityFn: (a, b) => {
        return (
          a.chain?.jumps.O[jumpId] !== undefined &&
          b.chain?.jumps.O[jumpId] !== undefined &&
          a.chain?.jumps.O[jumpId].bankDeposits[charId] ==
            b.chain?.jumps.O[jumpId].bankDeposits[charId]
        );
      },
      fireImmediately: true,
    },
  );

export function adjustPassportStats(
  chain: Chain,
  charId: Id<GID.Character>,
  jumpAccess: Set<number>,
): CharacterPassportStats {
  const char = chain.characters.O[charId];

  let totalDays = 0;
  let totalMonths = 0;
  let totalYears = +(char?.originalAge ?? 0) || 0;
  let jumpsTaken = 0;
  let perkCount = 0;
  let itemCount = 0;
  let altFormCount = 0;
  let cpTotal = 0;
  let initialJumpId: Id<GID.Jump> | undefined;

  for (const jumpId of chain.jumpList) {
    if (!jumpAccess.has(jumpId as number)) continue;
    const jump = chain.jumps.O[jumpId];
    if (!jump) continue;

    if (initialJumpId === undefined) initialJumpId = jumpId;

    jumpsTaken++;
    totalDays += +jump.duration.days || 0;
    totalMonths += +jump.duration.months || 0;
    totalYears += +jump.duration.years || 0;

    for (const pId of jump.purchases[charId] ?? []) {
      const p = chain.purchases.O[pId];
      if (!p) continue;
      if (p.type === PurchaseType.Perk) perkCount++;
      if (p.type === PurchaseType.Item) itemCount++;
      if (Array.isArray(p.value)) {
        for (const sv of p.value as Value) {
          if (sv.currency === DEFAULT_CURRENCY_ID) cpTotal += sv.amount;
        }
      }
    }

    altFormCount += jump.altForms[charId]?.length ?? 0;
  }

  // Roll days and months up into years.
  totalMonths += Math.floor(totalDays / 30);
  totalYears += Math.floor(totalMonths / 12);

  return {
    trueAgeYears: totalYears,
    jumpsTaken,
    perkCount,
    itemCount,
    altFormCount,
    cpTotal,
    initialJumpId,
    initialJumpName:
      initialJumpId !== undefined ? chain.jumps.O[initialJumpId]?.name || undefined : undefined,
  };
}

export const synchronizeJumpAccess = (charId: Id<GID.Character>) =>
  useChainStore.subscribe(
    (state) => ({
      chain: state.chain,
      jumpNumber: state.calculatedData.jumpNumber!,
      primary: state.chain?.characters?.O?.[charId]?.primary,
    }),
    (data) => {
      if (!data.chain || !Object.keys(data.chain.characters.O).map(Number).includes(charId)) return;

      const { jumpAccess, supplementAccess } = adjustJumpAccess(data.chain, charId);
      const passportStats = adjustPassportStats(data.chain, charId, jumpAccess);

      useChainStore.setState((s) =>
        produce(s, (st) => {
          if (!st.calculatedData.jumpAccess) st.calculatedData.jumpAccess = [];
          if (!st.calculatedData.supplementAccess) st.calculatedData.supplementAccess = [];
          if (!st.calculatedData.passportStats) st.calculatedData.passportStats = [];
          st.calculatedData.jumpAccess[charId] = jumpAccess;
          st.calculatedData.supplementAccess[charId] = supplementAccess;
          st.calculatedData.passportStats[charId] = passportStats;
        }),
      );
    },
    {
      equalityFn: (a, b) =>
        a.chain !== undefined &&
        b.chain !== undefined &&
        a.primary == b.primary &&
        a.chain.jumpList.length == b.chain.jumpList.length,
      fireImmediately: true,
    },
  );

export const synchronizeBudget = (
  charId: Id<GID.Character>,
  jumpId: Id<GID.Jump>,
  suppId?: Id<GID.Supplement>,
) =>
  useChainStore.subscribe(
    (state) => ({
      chain: state.chain,
      retainedDrawbacks: state.calculatedData.retainedDrawbacks?.[charId]?.[jumpId],
      chainDrawbacks: state.calculatedData.chainDrawbacks?.[charId]?.[jumpId],
      jumpChunks: state.calculatedData.jumpChunks,
      grossSupplementStipend: state.calculatedData.grossSupplementStipend,
    }),
    ({ chain, retainedDrawbacks, chainDrawbacks, jumpChunks, grossSupplementStipend }) => {
      if (
        !chain ||
        !Object.keys(chain.characters.O).includes(String(charId)) ||
        !Object.keys(chain.jumps.O).includes(String(jumpId))
      )
        return;

      const { budget, suppBudgets } = adjustBudget(
        chain,
        retainedDrawbacks,
        chainDrawbacks,
        jumpChunks,
        grossSupplementStipend,
        charId,
        jumpId,
        suppId,
      );

      useChainStore.setState((s) =>
        produce(s, (st) => {
          const cd = st.calculatedData;

          if (budget != null) {
            if (!cd.budget) cd.budget = {};
            if (!cd.budget[charId]) cd.budget[charId] = {};
            cd.budget[charId][jumpId] = budget;
          }

          if (!cd.supplementBudgets) cd.supplementBudgets = {};
          const sb = cd.supplementBudgets!;
          if (!sb[charId]) sb[charId] = {};
          if (suppId != null) {
            if (!sb[charId][jumpId]) sb[charId][jumpId] = {};
            sb[charId][jumpId][suppId] = suppBudgets[suppId];
          } else {
            sb[charId][jumpId] = suppBudgets;
          }
        }),
      );
    },
    {
      equalityFn: (a, b) => {
        if (!a.chain || !b.chain) return false;
        return a.chain.budgetFlag == b.chain.budgetFlag;
      },
      fireImmediately: true,
    },
  );

export const synchronizeRetainedDrawbacks = (charId: Id<GID.Character>, jumpId: Id<GID.Jump>) =>
  useChainStore.subscribe(
    (state) => ({
      chain: state.chain,
      jumpChunks: state.calculatedData.jumpChunks,
      jumpNumber: state.calculatedData.jumpNumber,
    }),
    ({ chain, jumpChunks, jumpNumber }) => {
      if (!chain || !jumpChunks || !jumpNumber) return;
      if (
        !Object.keys(chain.characters.O).includes(String(charId)) ||
        !Object.keys(chain.jumps.O).includes(String(jumpId))
      )
        return;

      const retained = adjustRetainedDrawbacks(chain, jumpChunks, jumpNumber, charId, jumpId);

      useChainStore.setState((s) =>
        produce(s, (st) => {
          if (!st.calculatedData.retainedDrawbacks) st.calculatedData.retainedDrawbacks = {} as any;
          if (!st.calculatedData.retainedDrawbacks![charId])
            st.calculatedData.retainedDrawbacks![charId] = {} as any;
          st.calculatedData.retainedDrawbacks![charId][jumpId] = retained;
        }),
      );
    },
    {
      equalityFn: () => true,
      fireImmediately: true,
    },
  );

export const synchronizeSupplementInvestments = (
  charId: Id<GID.Character>,
  jumpId: Id<GID.Jump>,
  suppId: Id<GID.Supplement>,
) =>
  useChainStore.subscribe(
    (state) => ({
      chain: state.chain,
      jumpChunks: state.calculatedData.jumpChunks,
    }),
    ({ chain, jumpChunks }) => {
      if (!chain || !jumpChunks) return;
      if (
        !Object.keys(chain.characters.O).includes(String(charId)) ||
        !Object.keys(chain.jumps.O).includes(String(jumpId))
      )
        return;

      const total = adjustSupplementInvestments(chain, jumpChunks, charId, jumpId, suppId);

      useChainStore.setState((s) =>
        produce(s, (st) => {
          const cd = st.calculatedData;
          if (!cd.supplementInvestments) cd.supplementInvestments = {};
          const byChar = cd.supplementInvestments!;
          if (!byChar[charId]) byChar[charId] = {};
          if (!byChar[charId][jumpId]) byChar[charId][jumpId] = {};
          byChar[charId][jumpId][suppId] = total;
        }),
      );
    },
    {
      equalityFn: (a, b) =>
        a.chain?.jumps?.O?.[jumpId]?.supplementInvestments?.[charId]?.[suppId] ===
        b.chain?.jumps?.O?.[jumpId]?.supplementInvestments?.[charId]?.[suppId],
      fireImmediately: true,
    },
  );

export const synchronizeGrossSupplementStipend = (
  charId: Id<GID.Character>,
  jumpId: Id<GID.Jump>,
  suppId: Id<GID.Supplement>,
) =>
  useChainStore.subscribe(
    (state) => ({
      chain: state.chain,
      jumpChunks: state.calculatedData.jumpChunks,
      jumpNumber: state.calculatedData.jumpNumber,
      investment: state.calculatedData.supplementInvestments?.[charId]?.[jumpId]?.[suppId],
      grossSupplementStipend: state.calculatedData.grossSupplementStipend,
      companionSupplementPercentage: state.calculatedData.companionSupplementPercentage,
    }),
    ({
      chain,
      jumpChunks,
      jumpNumber,
      investment,
      grossSupplementStipend,
      companionSupplementPercentage,
    }) => {
      if (!chain || !jumpChunks || !jumpNumber) return;
      if (
        !Object.keys(chain.characters.O).includes(String(charId)) ||
        !Object.keys(chain.jumps.O).includes(String(jumpId)) ||
        !Object.keys(chain.supplements.O).includes(String(suppId))
      )
        return;

      const gross = adjustGrossSupplementStipend(
        chain,
        jumpChunks,
        jumpNumber,
        investment,
        grossSupplementStipend,
        companionSupplementPercentage,
        charId,
        jumpId,
        suppId,
      );

      useChainStore.setState((s) =>
        produce(s, (st) => {
          const cd = st.calculatedData;
          if (!cd.grossSupplementStipend) cd.grossSupplementStipend = {};
          const byChar = cd.grossSupplementStipend!;
          if (!byChar[charId]) byChar[charId] = {};
          if (!byChar[charId][jumpId]) byChar[charId][jumpId] = {};
          byChar[charId][jumpId][suppId] = gross;
        }),
      );
    },
    {
      equalityFn: (a, b) => {
        if (!a.chain || !b.chain) return false;
        return a.chain.budgetFlag == b.chain.budgetFlag;
      },
      fireImmediately: true,
    },
  );

export const synchronizeChainDrawbacks = (charId: Id<GID.Character>, jumpId: Id<GID.Jump>) =>
  useChainStore.subscribe(
    (state) => ({
      chain: state.chain,
      jumpChunks: state.calculatedData.jumpChunks,
    }),
    ({ chain, jumpChunks }) => {
      if (!chain || !jumpChunks) return;
      if (
        !Object.keys(chain.characters.O).includes(String(charId)) ||
        !Object.keys(chain.jumps.O).includes(String(jumpId))
      )
        return;

      const active = adjustChainDrawbacks(chain, jumpChunks, charId, jumpId);

      useChainStore.setState((s) =>
        produce(s, (st) => {
          if (!st.calculatedData.chainDrawbacks) st.calculatedData.chainDrawbacks = {} as any;
          if (!st.calculatedData.chainDrawbacks![charId])
            st.calculatedData.chainDrawbacks![charId] = {} as any;
          st.calculatedData.chainDrawbacks![charId][jumpId] = active;
        }),
      );
    },
    {
      equalityFn: (a, b) =>
        (a.jumpChunks == undefined && b.jumpChunks == undefined) ||
        !!a.jumpChunks?.every((l, i) => shallow(l, b.jumpChunks?.[i])),
      fireImmediately: true,
    },
  );

// ─────────────────────────────────────────────────────────────────────────────
// adjustJumpOrganization — direct mutation; call after any jump add/remove/reorder/reparent
// ─────────────────────────────────────────────────────────────────────────────

/** Recomputes jumpNumber/jumpChunks from the current jumpList and all per-character/per-jump
 *  calculations. Call after any mutation that adds, removes, reorders, or re-parents a jump. */
export function adjustJumpOrganization(): void {
  const { chain, calculatedData } = useChainStore.getState();
  if (!chain) return;

  // 1. Compute jump structure.
  const data = (chain.jumpList || []).map((j) => ({
    id: j,
    parentJump: chain.jumps.O[j]?.parentJump,
  }));
  const numbers: Lookup<GID.Jump, number> = [];
  const chunks: Id<GID.Jump>[][] = [];

  let currentChunk: Id<GID.Jump>[] = [];
  let currentNumber = 0;
  for (let i = 0; i < data.length; i++) {
    numbers[data[i].id] = currentNumber;
    currentChunk.push(data[i].id);
    if (i + 1 == data.length || data[i + 1].parentJump === undefined) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentNumber++;
    }
  }

  // 2. Compute all per-char/per-jump values using adjust functions.
  //    Process primary characters before companions so companion gross-stipend
  //    calculations can reference primary values from the same jump.
  const newBankBalance = {} as CalculatedData["bankBalance"];
  const newTotalBankDeposit = {} as CalculatedData["totalBankDeposit"];
  const newRetainedDrawbacks = {} as CalculatedData["retainedDrawbacks"];
  const newChainDrawbacks = {} as CalculatedData["chainDrawbacks"];
  const newSuppInvestments = {} as CalculatedData["supplementInvestments"];
  const newGrossStipend = {} as CalculatedData["grossSupplementStipend"];
  const newSuppBudgets = {} as CalculatedData["supplementBudgets"];
  const newBudget = {} as CalculatedData["budget"];

  const suppIds = Object.keys(chain.supplements.O).map((s) => createId<GID.Supplement>(+s));

  // Primaries first so companion gross-stipend calculations can reference their values.
  const orderedChars = [
    ...chain.characterList.filter((cId) => chain.characters.O[cId]?.primary),
    ...chain.characterList.filter((cId) => !chain.characters.O[cId]?.primary),
  ];

  for (const charId of orderedChars) {
    newBankBalance[charId] = {} as CalculatedData["bankBalance"][typeof charId];
    newTotalBankDeposit[charId] = {} as CalculatedData["totalBankDeposit"][typeof charId];
    newRetainedDrawbacks[charId] = {} as CalculatedData["retainedDrawbacks"][typeof charId];
    newChainDrawbacks[charId] = {} as CalculatedData["chainDrawbacks"][typeof charId];
    newSuppInvestments[charId] = {} as CalculatedData["supplementInvestments"][typeof charId];
    newGrossStipend[charId] = {} as CalculatedData["grossSupplementStipend"][typeof charId];
    newSuppBudgets[charId] = {} as CalculatedData["supplementBudgets"][typeof charId];
    newBudget[charId] = {} as CalculatedData["budget"][typeof charId];

    for (const jumpId of chain.jumpList) {
      // Bank — passes newBankBalance so previous-chunk values are available.
      const bank = adjustBank(
        chain,
        charId,
        jumpId,
        chunks,
        numbers,
        newBankBalance,
        chain.bankSettings.interestRate,
        chain.bankSettings.depositRatio,
      );
      newBankBalance[charId][jumpId] = bank.balance;
      newTotalBankDeposit[charId][jumpId] = bank.totalDeposit;

      newRetainedDrawbacks[charId][jumpId] = adjustRetainedDrawbacks(
        chain,
        chunks,
        numbers,
        charId,
        jumpId,
      );
      newChainDrawbacks[charId][jumpId] = adjustChainDrawbacks(chain, chunks, charId, jumpId);

      newSuppInvestments[charId][jumpId] =
        {} as CalculatedData["supplementInvestments"][typeof charId][typeof jumpId];
      newGrossStipend[charId][jumpId] =
        {} as CalculatedData["grossSupplementStipend"][typeof charId][typeof jumpId];

      for (const suppId of suppIds) {
        newSuppInvestments[charId][jumpId][suppId] = adjustSupplementInvestments(
          chain,
          chunks,
          charId,
          jumpId,
          suppId,
        );
        // Passes newGrossStipend so primary values at the same jump are available for companions.
        newGrossStipend[charId][jumpId][suppId] = adjustGrossSupplementStipend(
          chain,
          chunks,
          numbers,
          newSuppInvestments[charId][jumpId][suppId],
          newGrossStipend,
          calculatedData.companionSupplementPercentage,
          charId,
          jumpId,
          suppId,
        );
      }

      // Budget — passes newly computed retained/chain drawbacks and gross stipend.
      const { budget, suppBudgets } = adjustBudget(
        chain,
        newRetainedDrawbacks[charId][jumpId],
        newChainDrawbacks[charId][jumpId],
        chunks,
        newGrossStipend,
        charId,
        jumpId,
      );
      if (budget != null) newBudget[charId][jumpId] = budget;
      newSuppBudgets[charId][jumpId] = suppBudgets;
    }
  }

  // 3. Write all computed data in a single setState.
  useChainStore.setState((s) =>
    produce(s, (st) => {
      st.calculatedData.jumpNumber = numbers;
      st.calculatedData.jumpChunks = chunks;
      st.calculatedData.bankBalance = newBankBalance;
      st.calculatedData.totalBankDeposit = newTotalBankDeposit;
      st.calculatedData.retainedDrawbacks = newRetainedDrawbacks;
      st.calculatedData.chainDrawbacks = newChainDrawbacks;
      st.calculatedData.supplementInvestments = newSuppInvestments;
      st.calculatedData.grossSupplementStipend = newGrossStipend;
      st.calculatedData.supplementBudgets = newSuppBudgets;
      st.calculatedData.budget = newBudget;
    }),
  );
}
