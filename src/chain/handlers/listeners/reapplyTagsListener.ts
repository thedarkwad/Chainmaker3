import { toast } from "react-toastify";
import { createListener } from "./listenerHelper";
import { createId, Id, TID, GID } from "../../data/types";
import { BuildListener } from "../../state/ViewerActionStore";
import { JumpPurchase, PurchaseType, CostModifier, purchaseValue } from "../../data/Purchase";
import { objMap } from "@/utilities/miscUtilities";
import { applyTags, applyTagsWithCost } from "../../../utilities/tags";
import { JumpDoc } from "../../data/JumpDoc";

const fmtNames = (names: string[]) => names.map(n => `"${n}"`).join(", ");

export function createReapplyTagsListener(
  internalTags: Record<string, (build: any) => string>,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): BuildListener {
  type TemplateEntry = { name: string; description?: string };

  function resolveTemplate(
    p: JumpPurchase,
    doc: JumpDoc,
  ): TemplateEntry | undefined {
    const id = p.template!.id;
    if (p.type === PurchaseType.Drawback)
      return doc.availableDrawbacks.O[id as any] as TemplateEntry | undefined;
    if (p.type === PurchaseType.Scenario)
      return doc.availableScenarios.O[id as any] as TemplateEntry | undefined;
    if (p.type === PurchaseType.Companion || ("follower" in p && p.follower))
      return doc.availableCompanions.O[id as any] as TemplateEntry | undefined;
    return (doc.availablePurchases.O[id as any] ??
      doc.availableCompanions.O[id as any]) as TemplateEntry | undefined;
  }

  return createListener(
    (build, chain, doc, mutators) => {
      const allGids: Id<GID.Purchase>[] = [
        ...Object.values(build.purchases).flatMap(arr => arr ?? []),
        ...Object.values(build.drawbacks).flatMap(arr => arr ?? []),
        ...Object.values(build.scenarios).flatMap(arr => arr ?? []),
        ...Object.values(build.companionImports).flatMap(arr => arr ?? []),
      ];

      const updated: string[] = [];

      for (const gid of allGids) {
        const p = chain.purchases.O[gid] as JumpPurchase | undefined;
        if (!p?.template?.tags) continue;

        const tmpl = resolveTemplate(p, doc);
        if (!tmpl) continue;

        const userTags = p.template.tags;
        const internalTagsResolved = objMap(internalTags, f => f(build));
        const tags = { ...userTags, ...internalTagsResolved };

        const originalCost = p.template.originalCost;
        const value = originalCost?.cost ?? [];
        const cost = purchaseValue(
          originalCost?.cost ?? [],
          originalCost ?? { modifier: CostModifier.Full },
        );

        let newName: string;
        let newDesc: string;
        if (p.type === PurchaseType.Scenario) {
          newName = applyTags(tmpl.name, tags);
          newDesc = applyTags(tmpl.description ?? "", tags);
        } else {
          newName = applyTagsWithCost(
            tmpl.name,
            tags,
            value,
            cost,
            doc.currencies,
          );
          newDesc = applyTagsWithCost(
            tmpl.description ?? "",
            tags,
            value,
            cost,
            doc.currencies,
          );
        }

        const origName = p.template.originalName ?? "";
        const origDesc = p.template.originalDescription ?? "";
        if (!origName.startsWith(newName) || !origDesc.startsWith(newDesc)) {
          updated.push(p.name);
          mutators.setNameDescription(gid, newName, newDesc);
        }
      }

      if (updated.length) toast.info(`Text updated on ${fmtNames(updated)}`);
    },
    (build, chain) => [
      build.origins
        .map(o => o.template?.id ?? "")
        .sort()
        .join(","),
      chain.jumps.O[jumpId].purchases[charId]?.length,
      chain.jumps.O[jumpId].drawbacks[charId]?.length,
      chain.jumps.O[jumpId].scenarios[charId]?.length,
    ],
  );
}
