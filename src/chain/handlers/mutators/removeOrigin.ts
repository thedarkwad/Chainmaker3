import { createId, GID, Id, LID, TID } from "../../data/types";
import { setTracked } from "../../state/hooks";
import { Origin } from "../../data/Jump";

export function removeOrigin(
  templateId: Id<TID.Origin>,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): void {
  setTracked("Remove origin", c => {
    const jump = c.jumps.O[jumpId];
    if (!jump) return;
    const charOrigins = jump.origins[charId] as
      | Record<Id<LID.OriginCategory>, Origin[]>
      | undefined;
    if (!charOrigins) return;
    for (const lidStr in charOrigins) {
      const lid = createId<LID.OriginCategory>(+lidStr);
      const list = charOrigins[lid];
      if (!list) continue;
      const idx = list.findIndex(o => o.template?.id === templateId);
      if (idx !== -1) {
        list.splice(idx, 1);
        c.budgetFlag += 1;
        break;
      }
    }
  });
}
