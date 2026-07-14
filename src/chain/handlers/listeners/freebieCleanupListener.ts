import { toast } from "react-toastify";
import { createListener } from "./listenerHelper";
import { createId, Id, TID, GID } from "../../data/types";
import { BuildListener } from "../../state/ViewerActionStore";
import { BasicPurchase } from "../../data/Purchase";

const fmtNames = (names: string[]) => names.map(n => `"${n}"`).join(", ");

export function createFreebieCleanupListener(
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): BuildListener {
  return createListener(
    (build, chain, _doc, mutators) => {
      const removed: string[] = [];

      for (const tidStr in build.purchases) {
        const tid = createId<TID.Purchase>(+tidStr);
        for (const gid of build.purchases[tid] ?? []) {
          const p = chain.purchases.O[gid] as BasicPurchase | undefined;
          if (!p?.freebie) continue;
          if ((build.companionImports[p.freebie] ?? []).length === 0) {
            removed.push(p.name);
            mutators.removePurchase(gid, build);
          }
        }
      }

      for (const tidStr in build.drawbacks) {
        const tid = createId<TID.Drawback>(+tidStr);
        for (const gid of build.drawbacks[tid] ?? []) {
          const p = chain.purchases.O[gid] as BasicPurchase | undefined;
          if (!p?.freebie) continue;
          if ((build.companionImports[p.freebie] ?? []).length === 0) {
            removed.push(p.name);
            mutators.removePurchase(gid, build);
          }
        }
      }

      for (const origin of build.origins) {
        if (!origin.freebie || origin.freebie < 0 || !origin.template) continue;
        if ((build.companionImports[origin.freebie as any] ?? []).length === 0) {
          removed.push(origin.summary);
          mutators.removeOrigin(origin.template.id, jumpId, charId);
        }
      }

      if (removed.length)
        toast.info(`Removed freebie items: ${fmtNames(removed)}`);
    },
    () => [],
  );
}
