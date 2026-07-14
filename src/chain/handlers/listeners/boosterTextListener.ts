import { toast } from "react-toastify";
import { createListener } from "./listenerHelper";
import { createId, Id, TID, GID } from "../../data/types";
import { BuildListener } from "../../state/ViewerActionStore";
import { setTracked } from "../../state/hooks";
import { Chain } from "../../data/Chain";
import { DrawbackTemplate, JumpPurchase, Drawback, PurchaseType } from "../../data/Purchase";

const fmtNames = (names: string[]) => names.map(n => `"${n}"`).join(", ");

export function createBoosterTextListener(): BuildListener {
  const reconcileBoosts = (
    gid: Id<GID.Purchase>,
    boosted: DrawbackTemplate["boosted"],
    build: any,
    c: Chain,
    added: string[],
    removed: string[],
  ) => {
    const p = c.purchases.O[gid] as JumpPurchase | undefined;
    if (!p) return;
    for (const { description, booster, boosterKind } of boosted) {
      const boosterPresent =
        boosterKind === "drawback"
          ? (build.drawbacks[booster as any] ?? []).length > 0
          : (build.purchases[booster as any] ?? []).length > 0;
      const suffix = `${description}`;
      const alreadyApplied = p.boosts?.some?.(b => b.purchaseId == booster);

      if (boosterPresent && !alreadyApplied) {
        p.description = p.description.trimEnd() + "\n\n" + suffix;
        if (!p.boosts) p.boosts = [];
        p.boosts.push({ purchaseId: booster as Id<GID.Purchase>, description });
        added.push(p.name);
      } else if (!boosterPresent && alreadyApplied) {
        p.description = p.description.replace(suffix, "").trimEnd();
        p.boosts = (p.boosts ?? []).filter(b => b.purchaseId !== booster);
        removed.push(p.name);
      }
    }
  };

  return createListener(
    (build, _, doc) => {
      const added: string[] = [];
      const removed: string[] = [];
      setTracked("Reconcile booster text", c => {
        for (const tidStr in build.purchases) {
          const tid = createId<TID.Purchase>(+tidStr);
          const template = doc.availablePurchases.O[tid];
          if (!template?.boosted.length) continue;
          for (const gid of build.purchases[tid] ?? [])
            reconcileBoosts(
              gid,
              template.boosted as DrawbackTemplate["boosted"],
              build,
              c as Chain,
              added,
              removed,
            );
        }
        for (const tidStr in build.drawbacks) {
          const tid = createId<TID.Drawback>(+tidStr);
          const template = doc.availableDrawbacks.O[tid];
          if (!template?.boosted?.length) continue;
          for (const gid of build.drawbacks[tid] ?? [])
            reconcileBoosts(
              gid,
              template.boosted,
              build,
              c as Chain,
              added,
              removed,
            );
        }
      });
      if (added.length) toast.info(`Boosts added to ${fmtNames(added)}`);
      if (removed.length)
        toast.info(`Boosts removed from ${fmtNames(removed)}`);
    },
    build => [
      Object.keys(build.purchases).length,
      Object.keys(build.drawbacks).length,
    ],
  );
}
