import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AddButton } from "@/ui/FormPrimitives";

import { type GID, type Id } from "@/chain/data/types";
import {
  useAddChainDrawback,
  useChainDrawbackList,
  useRemoveChainDrawback,
  useReorderChainDrawbacks,
} from "@/chain/state/hooks";
import { DrawbackEditor } from "@/chain/components/PurchaseEditor";
import { DraggablePurchaseList } from "@/chain/components/DraggablePurchaseList";
import { CollapsibleSection } from "@/ui/CollapsibleSection";

export const Route = createFileRoute("/chain/$chainId/config/drawbacks")({
  component: ChainDrawbacksPage,
});

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────

function ChainDrawbacksPage() {
  const drawbackIds = useChainDrawbackList();
  const addDrawback = useAddChainDrawback();
  const removeDrawback = useRemoveChainDrawback();
  const reorderDrawbacks = useReorderChainDrawbacks();
  const [newDrawbackIds, setNewDrawbackIds] = useState<Set<Id<GID.Purchase>>>(() => new Set());

  const clearNew = (id: Id<GID.Purchase>) =>
    setNewDrawbackIds((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });

  return (
    <div className="py-4 flex flex-col gap-4">
      <CollapsibleSection
        title="Chain Drawbacks"
        action={
          <AddButton
            label="Add chain drawback"
            onClick={() => {
              const id = addDrawback();
              setNewDrawbackIds((prev) => new Set(prev).add(id));
            }}
          />
        }
      >
        {drawbackIds.length === 0 ? (
          <p className="text-xs text-ghost text-center py-3 italic">No chain drawbacks yet.</p>
        ) : (
          <DraggablePurchaseList
            ids={drawbackIds}
            onReorder={reorderDrawbacks}
            renderItem={(id) => (
              <DrawbackEditor
                id={id}
                isNew={newDrawbackIds.has(id)}
                onSubmit={() => clearNew(id)}
                onRemove={() => removeDrawback(id)}
                hideCostModifier
              />
            )}
          />
        )}
      </CollapsibleSection>
    </div>
  );
}
