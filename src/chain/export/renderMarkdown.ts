import type { ExportIR, ExportOptions, IRCost, IRDrawback, IRJump, IRPurchase } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isGenericSubtype(heading: string): boolean {
  const h = heading.toLowerCase();
  return h === "perk" || h === "item";
}

function escapeMd(s: string): string {
  return s.replace(/([\\`*_{}[\]()#+\-.!|])/g, "\\$1");
}

function sectionCostLabel(items: { cost: IRCost | null }[], kind: "cost" | "gain"): string {
  const totals = new Map<string, number>();
  for (const p of items) {
    if (!p.cost || p.cost.raw === 0) continue;
    totals.set(p.cost.currencyAbbrev, (totals.get(p.cost.currencyAbbrev) ?? 0) + p.cost.raw);
  }
  if (totals.size === 0) return "";
  const parts = Array.from(totals.entries()).map(([abbrev, total]) => `${total} ${abbrev}`);
  return ` [${kind}: ${parts.join(", ")}]`;
}

function renderPurchase(p: IRPurchase, indent = ""): string {
  const costStr = p.cost ? ` [${p.cost.display}]` : "";
  let out = `${indent}- **${escapeMd(p.name)}**${costStr}\n`;
  if (p.description) {
    for (const line of p.description.split("\n")) {
      out += `${indent}  ${line}\n`;
    }
  }
  for (const sub of p.subpurchases) {
    out += renderPurchase(sub, indent + "  ");
  }
  return out;
}

function renderPurchaseInline(p: IRPurchase): string {
  const costStr = p.cost ? ` [${p.cost.display}]` : "";
  const subs = p.subpurchases.length ? ` (${p.subpurchases.map((s) => s.name).join(", ")})` : "";
  return `${p.name}${costStr}${subs}`;
}

function renderDrawback(d: IRDrawback): string {
  const costStr = d.cost ? ` [${d.cost.display}]` : "";
  const tags: string[] = [];
  if (d.isChainDrawback) tags.push("Chain");
  if (d.isRetained) tags.push("Retained from previous jump");
  const tagStr = tags.length ? ` [${tags.join(", ")}]` : "";
  let out = `- **${escapeMd(d.name)}**${costStr}${tagStr}\n`;
  if (d.description) {
    for (const line of d.description.split("\n")) {
      out += `  ${line}\n`;
    }
  }
  return out;
}

function renderDrawbackInline(d: IRDrawback): string {
  return `${d.name}${d.cost ? ` [${d.cost.display}]` : ""}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Jump renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderJump(
  jump: IRJump,
  sections: ExportOptions["sections"],
  isSingleJump: boolean,
): string {
  const ultracompact = !sections.descriptions;
  const title = isSingleJump
    ? escapeMd(jump.jumpName)
    : `Jump ${jump.jumpNumber} — ${escapeMd(jump.jumpName)}`;
  const linkedTitle = jump.sourceUrl ? `[${title}](${jump.sourceUrl})` : title;
  let out = `\n## ${linkedTitle}\n`;

  // Starting Points
  if (jump.startingPoints && jump.startingPoints.length > 0) {
    const spStr = jump.startingPoints.map((e) => `${e.amount} ${e.currencyAbbrev}`).join(", ");
    out += `\n**Starting Points:** ${spStr}\n`;
  }

  // Bank Deposit
  if (jump.bankDeposit) {
    const bd = jump.bankDeposit;
    const label = bd.amount > 0 ? "Bank Deposit" : "Bank Withdrawal";
    out += `**${label}:** ${Math.abs(bd.amount)} ${bd.currencyAbbrev}\n`;
  }

  // Origins
  if (sections.origins && jump.origins.length > 0) {
    if (ultracompact) {
      const parts = jump.origins.map((o) => {
        const costStr = o.cost ? ` [${o.cost.display}]` : "";
        return `**${escapeMd(o.categoryName)}:** ${escapeMd(o.summary)}${costStr}`;
      });
      out += `\n${parts.join(", ")}\n`;
    } else {
      out += `\n### Origins\n\n`;
      for (const o of jump.origins) {
        const costStr = o.cost ? ` [${o.cost.display}]` : "";
        out += `**${escapeMd(o.categoryName)}:** ${escapeMd(o.summary)}${costStr}\n\n`;
        if (o.description) out += `${o.description}\n\n`;
      }
    }
  }

  // Perks
  if (jump.perkSections.length > 0) {
    if (ultracompact) {
      out += "\n";
      for (const s of jump.perkSections) {
        if (s.purchases.length === 0) continue;
        const label = sectionCostLabel(s.purchases, "cost");
        out += `**${escapeMd(s.heading)}${label}:** ${s.purchases.map(renderPurchaseInline).join(", ")}\n\n`;
      }
    } else {
      const allPerks = jump.perkSections.flatMap((s) => s.purchases);
      out += `\n### Perks${sectionCostLabel(allPerks, "cost")}\n\n`;
      for (const s of jump.perkSections) {
        const showHeading = s.heading && !isGenericSubtype(s.heading);
        if (showHeading) {
          out += `\n#### ${escapeMd(s.heading)}${sectionCostLabel(s.purchases, "cost")}\n\n`;
        }
        const indent = s.heading ? "  " : "";
        for (const p of s.purchases) out += renderPurchase(p, indent);
      }
    }
  }

  // Items
  if (jump.itemSections.length > 0) {
    if (ultracompact) {
      out += "\n";
      for (const s of jump.itemSections) {
        if (s.purchases.length === 0) continue;
        const label = sectionCostLabel(s.purchases, "cost");
        out += `**${escapeMd(s.heading)}${label}:** ${s.purchases.map(renderPurchaseInline).join(", ")}\n\n`;
      }
    } else {
      const allItems = jump.itemSections.flatMap((s) => s.purchases);
      out += `\n### Items${sectionCostLabel(allItems, "cost")}\n\n`;
      for (const s of jump.itemSections) {
        const showHeading = s.heading && !isGenericSubtype(s.heading);
        if (showHeading) {
          out += `\n#### ${escapeMd(s.heading)}${sectionCostLabel(s.purchases, "cost")}\n\n`;
        }
        const indent = s.heading ? "  " : "";
        for (const p of s.purchases) out += renderPurchase(p, indent);
      }
    }
  }

  // Companion Imports
  if (sections.companions && jump.companions.length > 0) {
    const companionTotal = jump.companions.reduce((sum, ci) => sum + (ci.cost?.raw ?? 0), 0);
    const companionAbbrev = jump.companions.find((ci) => ci.cost)?.cost?.currencyAbbrev ?? "";
    const companionLabel =
      companionTotal > 0 ? ` [cost: ${companionTotal} ${companionAbbrev}]` : "";
    if (ultracompact) {
      const items = jump.companions
        .map((ci) => {
          const costStr = ci.cost ? ` [${ci.cost.display}]` : "";
          const chars = ci.characterNames.length
            ? ` (${ci.characterNames.map(escapeMd).join(", ")})`
            : "";
          return `${escapeMd(ci.name)}${costStr}${chars}`;
        })
        .join(", ");
      out += `\n**Companion Imports${companionLabel}:** ${items}\n`;
    } else {
      out += `\n### Companion Imports${companionLabel}\n\n`;
      for (const ci of jump.companions) {
        const costStr = ci.cost ? ` [${ci.cost.display}]` : "";
        const chars = ci.characterNames.length
          ? ` (${ci.characterNames.map(escapeMd).join(", ")})`
          : "";
        out += `- **${escapeMd(ci.name)}**${costStr}${chars}\n`;
      }
    }
  }

  // Drawbacks
  if (sections.drawbacks && jump.drawbacks.length > 0) {
    const chain = jump.drawbacks.filter((d) => d.isChainDrawback);
    const regular = jump.drawbacks.filter((d) => !d.isChainDrawback);
    if (ultracompact) {
      out += "\n";
      if (chain.length > 0) {
        const label = sectionCostLabel(chain, "gain");
        out += `**Chain Drawbacks${label}:** ${chain.map(renderDrawbackInline).join(", ")}\n\n`;
      }
      if (regular.length > 0) {
        const label = sectionCostLabel(regular, "gain");
        out += `**Drawbacks${label}:** ${regular.map(renderDrawbackInline).join(", ")}\n\n`;
      }
    } else {
      const regularLabel = sectionCostLabel(regular, "gain");
      out += `\n### Jump Drawbacks${regularLabel}\n\n`;
      for (const d of regular) out += renderDrawback(d);
      if (chain.length > 0) {
        const chainLabel = sectionCostLabel(chain, "gain");
        out += `\n### Chain Drawbacks${chainLabel}**\n\n`;
        for (const d of chain) out += renderDrawback(d);
      }
    }
  }

  // Scenarios
  if (sections.scenarios && jump.scenarios.length > 0) {
    if (ultracompact) {
      out += `\n**Scenarios:** ${jump.scenarios.map((sc) => escapeMd(sc.name)).join(", ")}\n`;
    } else {
      out += `\n### Scenarios\n\n`;
      for (const sc of jump.scenarios) {
        out += `- **${escapeMd(sc.name)}**\n`;
        if (sc.description) out += `  ${sc.description}\n`;
        if (sc.rewards.length > 0) {
          out += `  *Rewards: ${sc.rewards.join(", ")}*\n`;
        }
      }
    }
  }

  // Supplements
  for (const supp of jump.supplements) {
    if (ultracompact) {
      const budgetStr =
        supp.prePurchaseBudget !== null
          ? ` [Budget: ${supp.prePurchaseBudget} ${supp.currencyName}]`
          : "";
      const allPurchases = [...supp.perks, ...supp.items];
      const items = allPurchases.map(renderPurchaseInline).join(", ");
      out += `\n**${escapeMd(supp.name)}${budgetStr}:** ${items}\n`;
    } else {
      out += `\n### ${escapeMd(supp.name)}\n\n`;
      if (supp.prePurchaseBudget !== null)
        out += `**Budget:** ${supp.prePurchaseBudget} ${supp.currencyName}\n`;
      if (supp.investment !== null && supp.investmentCurrencyAbbrev)
        out += `**Investment:** ${supp.investment} ${supp.investmentCurrencyAbbrev}\n`;
      for (const p of supp.perks) out += renderPurchase(p);
      for (const p of supp.items) out += renderPurchase(p);
    }
  }

  // Alt Forms
  if (sections.altForms && jump.altForms.length > 0) {
    out += `\n### Alt Forms\n\n`;
    for (const af of jump.altForms) {
      out += `**${escapeMd(af.name)}** (${escapeMd(af.species)})\n\n`;
      if (af.imageUrl) out += `[Image](${af.imageUrl})\n\n`;
      if (af.physicalDescription) out += `${af.physicalDescription}\n\n`;
      if (af.capabilities) out += `*Capabilities:* ${af.capabilities}\n\n`;
    }
  }

  // Narrative
  if (sections.narrative && jump.narrative) {
    const { goals, challenges, accomplishments } = jump.narrative;
    if (goals || challenges || accomplishments) {
      out += `\n### Narrative\n\n`;
      if (goals) out += `> **Goals:** ${goals}\n\n`;
      if (challenges) out += `> **Challenges:** ${challenges}\n\n`;
      if (accomplishments) out += `> **Accomplishments:** ${accomplishments}\n\n`;
    }
  }

  // Notes
  if (sections.notes && jump.notes) {
    out += `\n### Notes\n\n${jump.notes}\n`;
  }

  // Budget
  if (sections.budget && jump.budget) {
    out += `\n### Budget\n\n`;
    for (const section of jump.budget.sections) {
      const entriesStr = section.entries
        .map((e) => `${e.amount > 0 ? "+" : ""}${e.amount} ${e.currencyAbbrev}`)
        .join(", ");
      out += ` - **${section.label}:** ${entriesStr}\n`;
    }
    out += "\n";
    if (jump.budget.totals.length > 0) {
      const totalsStr = jump.budget.totals
        .map((e) => `${e.amount > 0 ? "+" : ""}${e.amount} ${e.currencyAbbrev}`)
        .join(", ");
      out += `**Total: ${totalsStr}**\n`;
    }
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function renderMarkdown(ir: ExportIR, sections: ExportOptions["sections"]): string {
  let out = "";

  if (ir.jumps.length !== 1) {
    out += `# ${escapeMd(ir.chainName)}\n`;
    out += `**Character:** ${escapeMd(ir.characterName)}\n`;
  }

  for (const jump of ir.jumps) {
    out += renderJump(jump, sections, ir.isSingleJump);
  }

  return out;
}
