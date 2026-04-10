import {
  CostModifier,
  purchaseValue,
  type ModifiedCost,
  type Value,
} from "@/chain/data/Purchase";
import type { Currency } from "@/chain/data/Jump";
import type { LID, Registry } from "@/chain/data/types";
import type { IRCost } from "./types";

/**
 * Resolves a purchase value + modifier into a display string and raw number.
 * `reducedPurchasesBecomeFree` mirrors the chain setting of the same name.
 */
export function formatCostForExport(
  rawValue: Value | number,
  cost: ModifiedCost,
  currencies: Registry<LID.Currency, Currency> | undefined,
): IRCost {
  const effective = purchaseValue(rawValue, cost);

  // For supplement purchases the value is a plain number (SP).
  if (typeof effective === "number") {
    const raw = effective;
    let display: string;
    if (cost.modifier === CostModifier.Free) {
      display = "Free";
    } else if (cost.modifier === CostModifier.Reduced) {
      display = raw === 0 ? "Free (reduced)" : `${raw} SP (reduced)`;
    } else {
      display = `${raw} SP`;
    }
    return { display, raw, currencyAbbrev: "SP" };
  }

  // For jump purchases the value is a Value array.
  // Sum across all currencies for the "raw" total; build display from the first non-zero entry.
  let totalRaw = 0;
  const parts: string[] = [];

  for (const sv of effective) {
    if (sv.amount === 0) continue;
    totalRaw += sv.amount;
    const currency = currencies?.O[sv.currency];
    const abbrev = currency?.abbrev ?? "CP";
    parts.push(`${sv.amount} ${abbrev}`);
  }

  if (totalRaw === 0 || effective.length === 0) {
    // Free or zero cost
    const isFree =
      cost.modifier === CostModifier.Free;
    return { display: isFree ? "Free" : "0", raw: 0, currencyAbbrev: "CP" };
  }

  const abbrev = (() => {
    for (const sv of effective) {
      if (sv.amount !== 0) {
        const currency = currencies?.O[sv.currency];
        return currency?.abbrev ?? "CP";
      }
    }
    return "CP";
  })();

  let display = parts.join(" + ");
  if (cost.modifier === CostModifier.Reduced) display += " (reduced)";

  return { display, raw: totalRaw, currencyAbbrev: abbrev };
}
