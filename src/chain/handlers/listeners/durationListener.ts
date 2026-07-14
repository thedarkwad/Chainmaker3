import { toast } from "react-toastify";
import { createListener } from "./listenerHelper";
import { createId, Id, TID, GID } from "../../data/types";
import { BuildListener } from "../../state/ViewerActionStore";
import { setTracked } from "../../state/hooks";
import { formatDuration } from "@/utilities/units";
import { JumpDoc } from "@/jumpdoc/data/JumpDoc";

export function createDurationListener(
  jumpId: Id<GID.Jump>,
  doc: JumpDoc,
): BuildListener {
  const durationModDrawbackTids = Object.keys(doc.availableDrawbacks.O)
    .map(s => createId<TID.Drawback>(+s))
    .filter(tid => doc.availableDrawbacks.O[tid]?.durationMod);
  const durationScenarioModTids = Object.keys(doc.availableScenarios.O)
    .map(s => createId<TID.Scenario>(+s))
    .filter(tid => doc.availableScenarios.O[tid]?.durationMod);

  return createListener(
    (build, chain, doc, _mutators) => {
      let base = doc.duration.years;
      let increment = 0;

      const applyMod = (mod: any, gids: Id<GID.Purchase>[]) => {
        if (mod.type === "set") {
          base = mod.years;
        } else if (mod.type === "choice") {
          for (const gid of gids) {
            const p = chain.purchases.O[gid] as
              | { customDuration?: number }
              | undefined;
            base = p?.customDuration ?? 0;
          }
        } else {
          increment += mod.years * gids.length;
        }
      };

      for (const tidStr in build.drawbacks) {
        const tid = createId<TID.Drawback>(+tidStr);
        const mod = doc.availableDrawbacks.O[tid]?.durationMod;
        if (mod) applyMod(mod, build.drawbacks[tid] ?? []);
      }
      for (const tidStr in build.scenarios) {
        const tid = createId<TID.Scenario>(+tidStr);
        const mod = doc.availableScenarios.O[tid]?.durationMod;
        if (mod) applyMod(mod, build.scenarios[tid] ?? []);
      }

      const newYears = base + increment;
      const newDuration = {
        days: doc.duration.days,
        months: doc.duration.months,
        years: newYears,
      };
      let changed = false;
      setTracked("Update jump duration", c => {
        const jump = c.jumps.O[jumpId];
        if (!jump) return;
        if (!jump.originalDuration)
          jump.originalDuration = { ...jump.duration };

        const prev = jump.originalDuration;
        if (
          prev &&
          prev.years === newYears &&
          prev.months === newDuration.months &&
          prev.days === newDuration.days
        )
          return;
        changed = true;
        jump.duration = newDuration;
        jump.originalDuration = newDuration;
      });
      if (changed)
        toast.info(`Jump duration updated to ${formatDuration(newYears)}`);
    },
    build => [
      ...durationModDrawbackTids.map(
        tid => (build.drawbacks[tid] ?? []).length,
      ),
      ...durationScenarioModTids.map(
        tid => (build.scenarios[tid] ?? []).length,
      ),
    ],
  );
}
