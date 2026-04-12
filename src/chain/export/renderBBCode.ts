import type { ExportIR, ExportOptions, IRDrawback, IRJump, IRPurchase } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isGenericSubtype(heading: string): boolean {
  const h = heading.toLowerCase();
  return h === "perk" || h === "item";
}

function b(s: string) {
  return `[B]${s}[/B]`;
}

function u(s: string) {
  return `[U]${s}[/U]`;
}

function spoiler(title: string, content: string): string {
  return `[SPOILER=${title}]\n${content}\n[/SPOILER]\n`;
}

function sectionCostLabel(
  items: { cost: { raw: number; currencyAbbrev: string } | null }[],
  kind: "cost" | "gain",
): string {
  const totals = new Map<string, number>();
  for (const p of items) {
    if (!p.cost || p.cost.raw === 0) continue;
    totals.set(p.cost.currencyAbbrev, (totals.get(p.cost.currencyAbbrev) ?? 0) + p.cost.raw);
  }
  if (totals.size === 0) return "";
  const parts = Array.from(totals.entries()).map(([abbrev, total]) => `${total} ${abbrev}`);
  return ` (${kind}: ${parts.join(", ")})`;
}

function renderPurchase(p: IRPurchase, depth = 0): string {
  const indent = depth > 0 ? "  ".repeat(depth) : "";
  const costStr = p.cost ? ` [${p.cost.display}]` : "";
  let out = `${indent}[*]${b(p.name)}${costStr}`;
  if (p.description) {
    out += `\n${indent}${p.description}`;
  }
  out += "\n";
  if (p.subpurchases.length > 0) {
    out += `${indent}[LIST]\n`;
    for (const sub of p.subpurchases) {
      out += renderPurchase(sub, depth + 1);
    }
    out += `${indent}[/LIST]\n`;
  }
  return out;
}

function renderPurchaseInline(p: IRPurchase): string {
  const costStr = p.cost ? ` [${p.cost.display}]` : "";
  const subs = p.subpurchases.length
    ? ` (${p.subpurchases.map((s) => s.name).join(", ")})`
    : "";
  return `${p.name}${costStr}${subs}`;
}

function renderDrawback(d: IRDrawback): string {
  const costStr = d.cost ? ` [${d.cost.display}]` : "";
  const tags: string[] = [];
  if (d.isChainDrawback) tags.push("Chain");
  if (d.isRetained) tags.push("Retained from previous jump");
  const tagStr = tags.length ? ` [${tags.join(", ")}]` : "";
  let out = `[*]${b(d.name)}${costStr}${tagStr}`;
  if (d.description) out += `\n${d.description}`;
  out += "\n";
  return out;
}

function renderDrawbackInline(d: IRDrawback): string {
  return `${d.name}${d.cost ? ` [${d.cost.display}]` : ""}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Jump renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderJump(jump: IRJump, sections: ExportOptions["sections"], isSingleJump: boolean): string {
  const ultracompact = !sections.descriptions;
  const title = isSingleJump
    ? jump.jumpName
    : `Jump ${jump.jumpNumber} — ${jump.jumpName}`;
  const linkedTitle = jump.sourceUrl
    ? `[URL=${jump.sourceUrl}]${u(b(title))}[/URL]`
    : u(b(title));

  let body = "";

  // Starting Points
  if (jump.startingPoints && jump.startingPoints.length > 0) {
    const spStr = jump.startingPoints.map((e) => `${e.amount} ${e.currencyAbbrev}`).join(", ");
    body += `${b("Starting Points:")} ${spStr}\n`;
  }

  // Bank Deposit
  if (jump.bankDeposit) {
    const bd = jump.bankDeposit;
    const label = bd.amount > 0 ? "Bank Deposit" : "Bank Withdrawal";
    body += `${b(`${label}:`)} ${Math.abs(bd.amount)} ${bd.currencyAbbrev}\n`;
  }

  // Origins
  if (sections.origins && jump.origins.length > 0) {
    if (ultracompact) {
      const parts = jump.origins.map((o) => {
        const costStr = o.cost ? ` [${o.cost.display}]` : "";
        return `${b(o.categoryName + ":")} ${o.summary}${costStr}`;
      });
      body += parts.join(", ") + "\n";
    } else {
      let originsInner = "";
      for (const o of jump.origins) {
        const costStr = o.cost ? ` [${o.cost.display}]` : "";
        originsInner += `${b(o.categoryName + ":")} ${o.summary}${costStr}\n`;
        if (o.description) originsInner += `${o.description}\n`;
      }
      body += spoiler("Origins", originsInner);
    }
  }

  // Perks
  if (jump.perkSections.length > 0) {
    if (ultracompact) {
      for (const s of jump.perkSections) {
        if (s.purchases.length === 0) continue;
        const label = sectionCostLabel(s.purchases, "cost");
        body += `${b(s.heading + label + ":")} ${s.purchases.map(renderPurchaseInline).join(", ")}\n`;
      }
    } else {
      const allPerks = jump.perkSections.flatMap((s) => s.purchases);
      let perksInner = "";
      for (const s of jump.perkSections) {
        if (s.heading && !isGenericSubtype(s.heading)) {
          perksInner += `${b(s.heading)}${sectionCostLabel(s.purchases, "cost")}\n`;
        }
        perksInner += "[LIST]\n";
        for (const p of s.purchases) perksInner += renderPurchase(p);
        perksInner += "[/LIST]\n";
      }
      body += spoiler(`Perks${sectionCostLabel(allPerks, "cost")}`, perksInner);
    }
  }

  // Items
  if (jump.itemSections.length > 0) {
    if (ultracompact) {
      for (const s of jump.itemSections) {
        if (s.purchases.length === 0) continue;
        const label = sectionCostLabel(s.purchases, "cost");
        body += `${b(s.heading + label + ":")} ${s.purchases.map(renderPurchaseInline).join(", ")}\n`;
      }
    } else {
      const allItems = jump.itemSections.flatMap((s) => s.purchases);
      let itemsInner = "";
      for (const s of jump.itemSections) {
        if (s.heading && !isGenericSubtype(s.heading)) {
          itemsInner += `${b(s.heading)}${sectionCostLabel(s.purchases, "cost")}\n`;
        }
        itemsInner += "[LIST]\n";
        for (const p of s.purchases) itemsInner += renderPurchase(p);
        itemsInner += "[/LIST]\n";
      }
      body += spoiler(`Items${sectionCostLabel(allItems, "cost")}`, itemsInner);
    }
  }

  // Companion Imports
  if (sections.companions && jump.companions.length > 0) {
    const companionTotal = jump.companions.reduce((sum, ci) => sum + (ci.cost?.raw ?? 0), 0);
    const companionAbbrev = jump.companions.find((ci) => ci.cost)?.cost?.currencyAbbrev ?? "";
    const companionLabel = companionTotal > 0 ? ` (cost: ${companionTotal} ${companionAbbrev})` : "";
    if (ultracompact) {
      const items = jump.companions
        .map((ci) => {
          const costStr = ci.cost ? ` [${ci.cost.display}]` : "";
          const chars = ci.characterNames.length ? ` (${ci.characterNames.join(", ")})` : "";
          return `${ci.name}${costStr}${chars}`;
        })
        .join(", ");
      body += `${b("Companion Imports" + companionLabel + ":")} ${items}\n`;
    } else {
      let inner = "[LIST]\n";
      for (const ci of jump.companions) {
        const costStr = ci.cost ? ` [${ci.cost.display}]` : "";
        const chars = ci.characterNames.length ? ` (${ci.characterNames.join(", ")})` : "";
        inner += `[*]${b(ci.name)}${costStr}${chars}\n`;
      }
      inner += "[/LIST]";
      body += spoiler(`Companion Imports${companionLabel}`, inner);
    }
  }

  // Drawbacks
  if (sections.drawbacks && jump.drawbacks.length > 0) {
    const chain = jump.drawbacks.filter((d) => d.isChainDrawback);
    const regular = jump.drawbacks.filter((d) => !d.isChainDrawback);
    if (ultracompact) {
      if (chain.length > 0) {
        const label = sectionCostLabel(chain, "gain");
        body += `${b("Chain Drawbacks" + label + ":")} ${chain.map(renderDrawbackInline).join(", ")}\n`;
      }
      if (regular.length > 0) {
        const label = sectionCostLabel(regular, "gain");
        body += `${b("Drawbacks" + label + ":")} ${regular.map(renderDrawbackInline).join(", ")}\n`;
      }
    } else {
      let inner = "";
      if (chain.length > 0) {
        let chainInner = "[LIST]\n";
        for (const d of chain) chainInner += renderDrawback(d);
        chainInner += "[/LIST]";
        inner += spoiler(`Chain Drawbacks${sectionCostLabel(chain, "gain")}`, chainInner);
      }
      if (regular.length > 0) {
        inner += "[LIST]\n";
        for (const d of regular) inner += renderDrawback(d);
        inner += "[/LIST]\n";
      }
      body += spoiler(`Drawbacks${sectionCostLabel(regular, "gain")}`, inner);
    }
  }

  // Scenarios
  if (sections.scenarios && jump.scenarios.length > 0) {
    if (ultracompact) {
      body += `${b("Scenarios:")} ${jump.scenarios.map((sc) => sc.name).join(", ")}\n`;
    } else {
      let inner = "[LIST]\n";
      for (const sc of jump.scenarios) {
        inner += `[*]${b(sc.name)}\n`;
        if (sc.description) inner += `${sc.description}\n`;
        if (sc.rewards.length > 0) inner += `[I]Rewards: ${sc.rewards.join(", ")}[/I]\n`;
      }
      inner += "[/LIST]";
      body += spoiler("Scenarios", inner);
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
      body += `${b(supp.name + budgetStr + ":")} ${items}\n`;
    } else {
      let suppInner = "";
      if (supp.prePurchaseBudget !== null)
        suppInner += `${b("Budget:")} ${supp.prePurchaseBudget} ${supp.currencyName}\n`;
      if (supp.investment !== null && supp.investmentCurrencyAbbrev)
        suppInner += `${b("Investment:")} ${supp.investment} ${supp.investmentCurrencyAbbrev}\n`;
      if (supp.perks.length + supp.items.length > 0) {
        suppInner += "[LIST]\n";
        for (const p of supp.perks) suppInner += renderPurchase(p);
        for (const p of supp.items) suppInner += renderPurchase(p);
        suppInner += "[/LIST]\n";
      }
      body += spoiler(supp.name, suppInner);
    }
  }

  // Alt Forms
  if (sections.altForms && jump.altForms.length > 0) {
    let inner = "";
    for (const af of jump.altForms) {
      inner += `${b(af.name)} (${af.species})\n`;
      if (af.imageUrl) inner += `[img]${af.imageUrl}[/img]\n`;
      if (af.physicalDescription) inner += `${af.physicalDescription}\n`;
      if (af.capabilities) inner += `${b("Capabilities:")} ${af.capabilities}\n`;
      inner += "\n";
    }
    body += spoiler("Alt Forms", inner);
  }

  // Narrative
  if (sections.narrative && jump.narrative) {
    const { goals, challenges, accomplishments } = jump.narrative;
    if (goals || challenges || accomplishments) {
      let inner = "";
      if (goals) inner += `${b("Goals:")}\n${goals}\n\n`;
      if (challenges) inner += `${b("Challenges:")}\n${challenges}\n\n`;
      if (accomplishments) inner += `${b("Accomplishments:")}\n${accomplishments}\n`;
      body += spoiler("Narrative", inner);
    }
  }

  // Notes
  if (sections.notes && jump.notes) {
    body += spoiler("Notes", jump.notes);
  }

  // Budget
  if (sections.budget && jump.budget) {
    let inner = "";
    for (const section of jump.budget.sections) {
      const entriesStr = section.entries.map(e => `${e.amount > 0 ? "+" : ""}${e.amount} ${e.currencyAbbrev}`).join(", ");
      inner += `${b(section.label + ":")} ${entriesStr}\n`;
    }
    if (jump.budget.totals.length > 0) {
      const totalsStr = jump.budget.totals.map(e => `${e.amount > 0 ? "+" : ""}${e.amount} ${e.currencyAbbrev}`).join(", ");
      inner += b(`Total: ${totalsStr}`);
    }
    body += spoiler("Budget", inner);
  }

  return `${linkedTitle}\n${body}\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function renderBBCode(ir: ExportIR, sections: ExportOptions["sections"]): string {
  let out = "";

  if (ir.jumps.length !== 1) {
    out += `${b(ir.chainName)}\n`;
    out += `${b("Character:")} ${ir.characterName}\n\n`;
  }

  for (const jump of ir.jumps) {
    const content = renderJump(jump, sections, ir.isSingleJump);
    if (ir.isSingleJump) {
      out += content;
    } else {
      out += spoiler(`Jump ${jump.jumpNumber} — ${jump.jumpName}`, content);
    }
  }

  return out;
}
