import type { IRPurchaseListEntry, IRPurchaseListExport } from "./types";

function b(s: string) {
  return `[B]${s}[/B]`;
}

function spoiler(title: string, content: string): string {
  return `[SPOILER=${title}]\n${content}\n[/SPOILER]\n`;
}

function renderEntry(entry: IRPurchaseListEntry, depth = 0): string {
  const indent = "  ".repeat(depth);
  let out = `${indent}[*]${b(entry.name)}\n`;
  if (entry.jumpName) out += `${indent}${entry.jumpName}\n`;
  if (entry.description) out += `${indent}${entry.description}\n`;
  if (entry.subpurchases.length > 0) {
    out += `${indent}[LIST]\n`;
    for (const sub of entry.subpurchases) {
      out += renderEntry(sub, depth + 1);
    }
    out += `${indent}[/LIST]\n`;
  }
  return out;
}

export function renderPurchaseListBBCode(ir: IRPurchaseListExport): string {
  let out = `${b(`${ir.chainName} — ${ir.characterName}: ${ir.contentLabel}`)}\n\n`;

  const isGrouped = ir.groups.length > 0 && ir.groups.some((g) => g.heading !== "");
  const isSingleGroup = ir.groups.length <= 1;

  for (const group of ir.groups) {
    let inner = "[LIST]\n";
    for (const entry of group.entries) {
      inner += renderEntry(entry);
    }
    inner += "[/LIST]";

    if (isGrouped && group.heading && !isSingleGroup) {
      out += spoiler(group.heading, inner);
    } else if (isGrouped && group.heading && isSingleGroup) {
      out += `${b(group.heading)}\n${inner}\n`;
    } else {
      out += `${inner}\n`;
    }
  }

  return out;
}
