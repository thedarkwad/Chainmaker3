import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AddButton } from "@/ui/FormPrimitives";

import { PurchaseType } from "@/chain/data/Purchase";
import { createId, type GID, type Id, type LID } from "@/chain/data/types";
import {
  useJumpBasicPurchases,
  useJumpSectionSubtypeIds,
  useJumpSubtypePurchases,
  usePurchaseSubtypes,
  useScrollToPurchasePlacement,
} from "@/chain/state/hooks";
import { BasicPurchaseEditor } from "@/chain/components/PurchaseEditor";
import { DraggablePurchaseList, PasteButton } from "@/chain/components/DraggablePurchaseList";
import { CollapsibleSection } from "@/ui/CollapsibleSection";
import { usePastePurchases } from "@/chain/state/hooks";

export const Route = createFileRoute("/chain/$chainId/char/$charId/jump/$jumpId/purchases")({
  validateSearch: (search: Record<string, unknown>) => ({
    scrollTo: typeof search.scrollTo === "string" ? search.scrollTo : undefined,
  }),
  component: PurchasesTab,
});

// ─────────────────────────────────────────────────────────────────────────────

/** Renders the CollapsibleSection for a single section-placement subtype. */
function SectionSubtypeSection({
  jumpGid,
  charGid,
  subtypeId,
  forceOpenNonce,
}: {
  jumpGid: Id<GID.Jump>;
  charGid: Id<GID.Character>;
  subtypeId: Id<LID.PurchaseSubtype>;
  forceOpenNonce?: number;
}) {
  const subtypes = usePurchaseSubtypes(jumpGid);
  const subtype = subtypes?.O[subtypeId];
  const { purchaseIds, actions } = useJumpSubtypePurchases(jumpGid, charGid, subtypeId);
  const [newPurchaseIds, setNewPurchaseIds] = useState<Set<Id<GID.Purchase>>>(() => new Set());

  const title = subtype?.name ?? "Section";
  const clipboardKey = subtype?.type === PurchaseType.Item ? "item" : "perk";

  return (
    <CollapsibleSection
      secondary
      defaultOpen={purchaseIds.length > 0}
      forceOpenNonce={forceOpenNonce}
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
              onSubmit={() =>
                setNewPurchaseIds((prev) => {
                  const s = new Set(prev);
                  s.delete(id);
                  return s;
                })
              }
              onRemove={() => actions.removePurchase(id)}
              clipboardKey={clipboardKey}
            />
          )}
        />
      )}
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────

function PurchasesTab() {
  const { jumpId } = Route.useParams();
  const jumpGid = createId<GID.Jump>(+jumpId);
  const charGid = createId<GID.Character>(+Route.useParams().charId);

  const { scrollTo } = Route.useSearch();
  const scrollToPurchaseId = scrollTo ? createId<GID.Purchase>(+scrollTo) : undefined;
  const scrollToPlacement = useScrollToPurchasePlacement(jumpGid, scrollToPurchaseId);
  const scrollToNonce = scrollTo ? +scrollTo : undefined;

  const { perkIds, itemIds, actions } = useJumpBasicPurchases(jumpGid, charGid);
  const sectionSubtypeIds = useJumpSectionSubtypeIds(jumpGid);
  const subtypes = usePurchaseSubtypes(jumpGid);
  const sectionPerkIds = sectionSubtypeIds.filter(
    (id) => subtypes?.O[id]?.type === PurchaseType.Perk,
  );
  const sectionItemIds = sectionSubtypeIds.filter(
    (id) => subtypes?.O[id]?.type === PurchaseType.Item,
  );
  const [newPurchaseIds, setNewPurchaseIds] = useState<Set<Id<GID.Purchase>>>(() => new Set());
  const pastePurchases = usePastePurchases(jumpGid, charGid);

  const addNew = (type: PurchaseType.Perk | PurchaseType.Item) => {
    const id = actions.addPurchase(type);
    setNewPurchaseIds((prev) => new Set(prev).add(id));
  };

  const clearNew = (id: Id<GID.Purchase>) =>
    setNewPurchaseIds((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });

  return (
    <div className="flex flex-col gap-1">
      {/* ── Perks ── */}
      <CollapsibleSection
        title="Perks"
        forceOpenNonce={scrollToPlacement?.placement === "normal" && scrollToPlacement.type === PurchaseType.Perk ? scrollToNonce : undefined}
        action={
          <>
            <PasteButton clipboardKey="perk" onPaste={() => pastePurchases("perk")} />
            <AddButton label="Add perk" onClick={() => addNew(PurchaseType.Perk)} />
          </>
        }
      >
        <div className="flex flex-col gap-1">
          {perkIds.length === 0 ? (
            <p className="text-xs text-ghost text-center py-3 italic">No perks yet.</p>
          ) : (
            <DraggablePurchaseList
              ids={perkIds}
              onReorder={(newIds) => actions.reorderPurchases(newIds, PurchaseType.Perk)}
              renderItem={(id) => (
                <BasicPurchaseEditor
                  id={id}
                  isNew={newPurchaseIds.has(id)}
                  onSubmit={() => clearNew(id)}
                  onRemove={() => actions.removePurchase(id)}
                  clipboardKey="perk"
                />
              )}
            />
          )}
        </div>
      </CollapsibleSection>

      {/* ── Perk-type section subtypes ── */}
      {sectionPerkIds.map((subtypeId) => (
        <SectionSubtypeSection
          key={subtypeId as number}
          jumpGid={jumpGid}
          charGid={charGid}
          subtypeId={subtypeId}
          forceOpenNonce={scrollToPlacement?.subtypeId === subtypeId ? scrollToNonce : undefined}
        />
      ))}

      {/* ── Items ── */}
      <CollapsibleSection
        title="Items"
        forceOpenNonce={scrollToPlacement?.placement === "normal" && scrollToPlacement.type === PurchaseType.Item ? scrollToNonce : undefined}
        action={
          <>
            <PasteButton clipboardKey="item" onPaste={() => pastePurchases("item")} />
            <AddButton label="Add item" onClick={() => addNew(PurchaseType.Item)} />
          </>
        }
      >
        <div className="flex flex-col gap-1">
          {itemIds.length === 0 ? (
            <p className="text-xs text-ghost text-center py-3 italic">No items yet.</p>
          ) : (
            <DraggablePurchaseList
              ids={itemIds}
              onReorder={(newIds) => actions.reorderPurchases(newIds, PurchaseType.Item)}
              renderItem={(id) => (
                <BasicPurchaseEditor
                  id={id}
                  isNew={newPurchaseIds.has(id)}
                  onSubmit={() => clearNew(id)}
                  onRemove={() => actions.removePurchase(id)}
                  clipboardKey="item"
                />
              )}
            />
          )}
        </div>
      </CollapsibleSection>

      {/* ── Item-type section subtypes ── */}
      {sectionItemIds.map((subtypeId) => (
        <SectionSubtypeSection
          key={subtypeId as number}
          jumpGid={jumpGid}
          charGid={charGid}
          subtypeId={subtypeId}
          forceOpenNonce={scrollToPlacement?.subtypeId === subtypeId ? scrollToNonce : undefined}
        />
      ))}
    </div>
  );
}
