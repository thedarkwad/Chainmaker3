import { toast } from "react-toastify";
import { createListener } from "./listenerHelper";
import {
  createId,
  GID,
  Id,
  LID,
  PartialIndex,
  Registry,
  registryAdd,
  TID,
} from "../../data/types";
import { BuildListener } from "../../state/ViewerActionStore";
import { setTracked } from "../../state/hooks";
import { convertSubtypeId, convertCurrencyId } from "../utils";
import { Drawback, PurchaseType, CostModifier } from "../../data/Purchase";
import { JumpDoc, StipendEntry } from "@/jumpdoc/data/JumpDoc";

const fmtNames = (names: string[]) => names.map(n => `"${n}"`).join(", ");

export function createStipendListener(
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  doc: JumpDoc,
): BuildListener {
  let relevantPurchaseTemplates = Object.values(
    doc.availablePurchases.O,
  ).filter(pt => pt.stipend?.length);
  let relevantOriginTemplates = Object.values(doc.origins.O).filter(
    ot => ot.originStipend?.length,
  );
  return createListener(
    (build, _chain, doc, _mutators) => {
      const created: string[] = [];
      const removed: string[] = [];
      setTracked("Reconcile stipends", c => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;

        const activeOriginTids = new Set(
          build.origins.map(o => o.template?.id),
        );
        const activePurchaseTids = new Set(
          relevantPurchaseTemplates
            .map(o => o.id)
            .filter(id => build.purchases[id]?.length),
        );

        let removeStipends = <A extends TID>(
          tid: Id<A>,
          index?: PartialIndex<A, GID.Purchase>,
        ) => {
          for (const gid of index?.[tid] ?? []) {
            removed.push(c.purchases.O[gid]?.name ?? "?");
            delete c.purchases.O[gid];
            const list = jump.drawbacks[charId] as
              | Id<GID.Purchase>[]
              | undefined;
            if (list) {
              const idx = list.indexOf(gid);
              if (idx !== -1) list.splice(idx, 1);
            }
          }
        };

        let addStipend = <A extends TID>(
          type: A extends TID.Origin ? "origin" : "purchase",
          template: { name: string; id: Id<A> },
          categoryName: string,
          entry: StipendEntry,
          stipendIndex?: PartialIndex<A, GID.Purchase>,
        ) => {
          if (entry.amount < 0) return;
          const subtypeName =
            doc.purchaseSubtypes.O[entry.purchaseSubtype]?.name ?? "";
          const lidSubtype = convertSubtypeId(
            entry.purchaseSubtype,
            doc,
            jump.purchaseSubtypes,
          );
          if (lidSubtype == null) return;
          const alreadyExists = (stipendIndex?.[template.id] ?? []).some(
            gid => {
              const p = c.purchases.O[gid] as Drawback;
              return p?.stipend === template.id && p.subtype === lidSubtype;
            },
          );
          if (alreadyExists) return;

          const lidCurrency = convertCurrencyId(
            entry.currency,
            doc,
            jump.currencies,
          );

          const name = `${template.name} ${subtypeName} Stipend`;
          created.push(name);
          const newId = registryAdd(c.purchases, {
            charId,
            jumpId,
            name,
            duration: 1,
            description: `Stipend from the ${template.name} ${categoryName} for ${subtypeName} purchases.`,
            type: PurchaseType.Drawback,
            cost: { modifier: CostModifier.Full },
            value: [{ amount: entry.amount, currency: lidCurrency }],
            overrides: {},
            stipendType: type,
            stipend: template.id as any,
            subtype: lidSubtype,
          });
          if (!jump.drawbacks[charId]) jump.drawbacks[charId] = [];
          jump.drawbacks[charId]!.push(newId);
        };

        relevantOriginTemplates
          .filter(t => !activeOriginTids.has(t.id))
          .forEach(t => removeStipends(t.id, build.originStipends));

        relevantPurchaseTemplates
          .filter(t => !activePurchaseTids.has(t.id))
          .forEach(t => removeStipends(t.id, build.purchaseStipends));

        relevantOriginTemplates
          .filter(t => activeOriginTids.has(t.id))
          .forEach(t => {
            const categoryName = (
              doc.originCategories.O[t.type]?.name ?? ""
            ).toLowerCase();
            t.originStipend!.forEach(entry =>
              addStipend(
                "origin",
                t,
                categoryName,
                entry,
                build.originStipends,
              ),
            );
          });

        relevantPurchaseTemplates
          .filter(t => activePurchaseTids.has(t.id))
          .forEach(t => {
            const categoryName = (
              doc.purchaseSubtypes.O[t.subtype]?.name ?? ""
            ).toLowerCase();
            t.stipend!.forEach(entry =>
              addStipend(
                "purchase",
                t,
                categoryName.toLowerCase(),
                entry,
                build.purchaseStipends,
              ),
            );
          });

        if (removed.length + created.length) c.budgetFlag += 1;
      });
      if (removed.length && !created.length)
        toast.info(`Removed stipends: ${fmtNames(removed)}`);
      if (created.length && !removed.length)
        toast.info(`Added stipends: ${fmtNames(created)}`);
      if (created.length && removed.length)
        toast.info(`Replaced ${fmtNames(removed)} with ${fmtNames(created)}`);
    },
    build => [
      relevantOriginTemplates.length &&
      build.origins
        .map(o => o.template?.id ?? "")
        .sort()
        .join(","),
      relevantPurchaseTemplates && Object.keys(build.purchases).length,
    ],
  );
}
