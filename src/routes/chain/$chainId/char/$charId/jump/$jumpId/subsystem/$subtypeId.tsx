import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";

import { createId, type GID, type Id, type LID } from "@/chain/data/types";
import { useJumpSubtypePurchases, usePurchaseSubtypes } from "@/chain/state/hooks";
import { BasicPurchaseEditor } from "@/chain/components/PurchaseEditor";
import { DraggablePurchaseList } from "@/chain/components/DraggablePurchaseList";
import { CollapsibleSection } from "@/ui/CollapsibleSection";

export const Route = createFileRoute(
  "/chain/$chainId/char/$charId/jump/$jumpId/subsystem/$subtypeId",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    scrollTo: typeof search.scrollTo === "string" ? search.scrollTo : undefined,
  }),
  component: SubsystemTab,
});

function SubsystemTab() {
  const { charId, jumpId, subtypeId } = Route.useParams();
  const jumpGid    = createId<GID.Jump>(+jumpId);
  const charGid    = createId<GID.Character>(+charId);
  const subtypeGid = createId<LID.PurchaseSubtype>(+subtypeId);

  const subtypes = usePurchaseSubtypes(jumpGid);
  const subtype  = subtypes?.O[subtypeGid];

  const { purchaseIds, actions } = useJumpSubtypePurchases(jumpGid, charGid, subtypeGid);
  const [newPurchaseIds, setNewPurchaseIds] = useState<Set<Id<GID.Purchase>>>(() => new Set());

  const title = subtype?.name ?? "Subsystem";

  return (
    <div className="flex flex-col gap-1">
      <CollapsibleSection
          title={title}
          action={
            <button
              type="button"
              title={`Add ${title.toLowerCase()}`}
              onClick={() => {
                const id = actions.addPurchase();
                setNewPurchaseIds((prev) => new Set(prev).add(id));
              }}
              className="p-0.5 rounded transition-colors hover:bg-accent/20"
            >
              <Plus size={14} />
            </button>
          }
        >
          {purchaseIds.length === 0 ? (
            <p className="text-xs text-ghost text-center py-3 italic">No purchases yet.</p>
          ) : (
            <DraggablePurchaseList
              ids={purchaseIds}
              onReorder={actions.reorderPurchases}
              renderItem={(id) => (
                <BasicPurchaseEditor
                  id={id}
                  isNew={newPurchaseIds.has(id)}
                  onSubmit={() => setNewPurchaseIds((prev) => { const s = new Set(prev); s.delete(id); return s; })}
                  onRemove={() => actions.removePurchase(id)}
                />
              )}
            />
          )}
        </CollapsibleSection>
    </div>
  );
}
