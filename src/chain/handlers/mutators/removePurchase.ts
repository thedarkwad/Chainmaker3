import { GID, Id } from "../../data/types";
import { setTracked } from "../../state/hooks";
import { JumpDocBuildData } from "../../state/ViewerActionStore";
import { JumpPurchase, BasicPurchase } from "../../data/Purchase";

export function removePurchase(
  id: Id<GID.Purchase>,
  build: JumpDocBuildData,
  parent?: Id<GID.Purchase>,
): void {
  console.log("Removing", parent);
  const isDrawback = Object.values(build.drawbacks).some((arr) =>
    arr?.includes(id),
  );
  const isScenario = Object.values(build.scenarios).some((arr) =>
    arr?.includes(id),
  );
  setTracked(
    isDrawback
      ? "Remove drawback"
      : isScenario
        ? "Remove scenario"
        : "Remove purchase",
    (c) => {
      const p = c.purchases.O[id] as JumpPurchase | undefined;
      if (!p) return;
      const pJumpId = p.jumpId;
      const pCharId = p.charId;
      const jump = c.jumps.O[pJumpId];
      if (!jump) return;
      delete c.purchases.O[id];
      if (isScenario) {
        const list = jump.scenarios[pCharId];
        if (list) {
          const idx = list.indexOf(id);
          if (idx !== -1) list.splice(idx, 1);
        }
      } else if (isDrawback) {
        const list = jump.drawbacks[pCharId];
        if (list) {
          const idx = list.indexOf(id);
          if (idx !== -1) list.splice(idx, 1);
        }
      } else if (parent !== undefined) {
        const list = (c.purchases.O[parent] as BasicPurchase).subpurchases
          ?.list;
        console.log(list);
        if (list) {
          const idx = list.indexOf(id);
          if (idx !== -1) list.splice(idx, 1);
        }
        console.log(list);
      } else {
        const bp = p as BasicPurchase;
        if (bp.subpurchases?.list)
          for (const sub of bp.subpurchases.list) delete c.purchases.O[sub];
        if (bp.purchaseGroup != null) {
          const g = c.purchaseGroups[pCharId]?.O[bp.purchaseGroup];
          if (g) {
            const gi = g.components.indexOf(id);
            if (gi !== -1) g.components.splice(gi, 1);
          }
        }
        const list = jump.purchases[pCharId] as Id<GID.Purchase>[] | undefined;
        if (list) {
          const idx = list.indexOf(id);
          if (idx !== -1) list.splice(idx, 1);
        }
      }
      c.budgetFlag += 1;
    },
  );
}
