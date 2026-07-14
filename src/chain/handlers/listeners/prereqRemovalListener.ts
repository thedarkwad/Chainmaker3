import { toast } from "react-toastify";
import { createListener } from "./listenerHelper";
import { getPrereqError } from "../utils";
import { createId, Id, TID, GID } from "../../data/types";
import { BuildListener, JumpDocBuildData } from "../../state/ViewerActionStore";
import { JumpDoc } from "../../data/JumpDoc";

const fmtNames = (names: string[]) => names.map(n => `"${n}"`).join(", ");

export function createPrereqRemovalListener(): BuildListener {
  const shouldRemove = (
    template: {
      prerequisites?: JumpDocPrerequisite[];
      originBenefit?: string;
      origins?: Id<TID.Origin>[];
    },
    build: JumpDocBuildData,
    doc: JumpDoc,
  ) => {
    const hasPrereqError = (template.prerequisites ?? []).some(
      p => getPrereqError(p, build, doc) !== undefined,
    );
    const hasAccessError =
      template.originBenefit === "access" &&
      (template.origins ?? []).length > 0 &&
      (template.origins ?? []).every(o =>
        build.origins.every(bo => bo.template?.id !== o),
      );
    return hasPrereqError || hasAccessError;
  };

  type JumpDocPrerequisite = NonNullable<
    NonNullable<JumpDoc["availablePurchases"]["O"][number]>["prerequisites"]
  >[number];

  return createListener(
    (build, chain, doc, mutators) => {
      const removed: string[] = [];
      const removeAll = (gids: Id<GID.Purchase>[]) => {
        for (const gid of [...gids]) {
          removed.push(chain.purchases.O[gid]?.name ?? "?");
          mutators.removePurchase(gid, build);
        }
      };
      for (const tidStr in build.purchases) {
        const tid = createId<TID.Purchase>(+tidStr);
        const template = doc.availablePurchases.O[tid];
        if (template && shouldRemove(template, build, doc))
          removeAll(build.purchases[tid] ?? []);
      }
      for (const tidStr in build.drawbacks) {
        const tid = createId<TID.Drawback>(+tidStr);
        const template = doc.availableDrawbacks.O[tid];
        if (template && shouldRemove(template, build, doc))
          removeAll(build.drawbacks[tid] ?? []);
      }
      for (const tidStr in build.scenarios) {
        const tid = createId<TID.Scenario>(+tidStr);
        const template = doc.availableScenarios.O[tid];
        if (template && shouldRemove(template, build, doc))
          removeAll(build.scenarios[tid] ?? []);
      }
      for (const tidStr in build.companionImports) {
        const tid = createId<TID.Companion>(+tidStr);
        const template = doc.availableCompanions.O[tid];
        if (template && shouldRemove(template, build, doc))
          removeAll(build.companionImports[tid] ?? []);
      }
      if (removed.length) toast.info(`Removed: ${fmtNames(removed)}`);
    },
    build => [
      Object.keys(build.purchases).length,
      Object.keys(build.drawbacks).length,
      Object.keys(build.scenarios).length,
      Object.keys(build.companionImports).length,
      build.origins
        .map(o => o.template?.id ?? "")
        .sort()
        .join(","),
    ],
  );
}
