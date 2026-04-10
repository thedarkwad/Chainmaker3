import type { IRPurchaseListEntry, IRPurchaseListExport } from "./types";

function escapeMd(s: string): string {
  return s.replace(/([\\\`*_{}[\]()#+\-.!|])/g, "\\$1");
}

function renderEntry(entry: IRPurchaseListEntry, indent = ""): string {
  let out = `${indent}- **${escapeMd(entry.name)}**\n`;
  if (entry.jumpName) out += `${indent}  *${escapeMd(entry.jumpName)}*\n`;
  if (entry.description) {
    for (const line of entry.description.split("\n")) {
      out += `${indent}  ${line}\n`;
    }
  }
  for (const sub of entry.subpurchases) {
    out += renderEntry(sub, indent + "  ");
  }
  return out;
}

export function renderPurchaseListMarkdown(ir: IRPurchaseListExport): string {
  let out = `# ${escapeMd(ir.chainName)} — ${escapeMd(ir.characterName)}: ${escapeMd(ir.contentLabel)}\n`;

  const isGrouped = ir.groups.length > 0 && ir.groups.some((g) => g.heading !== "");

  for (const group of ir.groups) {
    if (isGrouped && group.heading) {
      out += `\n## ${escapeMd(group.heading)}\n`;
    }
    out += "\n";
    for (const entry of group.entries) {
      out += renderEntry(entry);
    }
  }

  return out;
}
