import { toast } from "react-toastify";
import { createListener } from "./listenerHelper";
import { createId, Id, TID, GID } from "../../data/types";
import { BuildListener } from "../../state/ViewerActionStore";
import { BasicPurchase } from "../../data/Purchase";

const fmtNames = (names: string[]) => names.map(n => `"${n}"`).join(", ");

export function createScenarioRewardListener(): BuildListener {
  return createListener(
    (build, chain, _doc, mutators) => {
      const removed: string[] = [];
      for (const tidStr in build.purchases) {
        const tid = createId<TID.Purchase>(+tidStr);
        for (const gid of build.purchases[tid] ?? []) {
          const p = chain.purchases.O[gid] as BasicPurchase | undefined;
          if (!p?.reward) continue;
          const scenarioPresent =
            (build.scenarios[p.reward as any] ?? []).length > 0;
          if (!scenarioPresent) {
            removed.push(p.name);
            mutators.removePurchase(gid, build);
          }
        }
      }
      if (removed.length)
        toast.info(`Removed reward purchases: ${fmtNames(removed)}`);
    },
    build => [Object.keys(build.scenarios).length],
  );
}
