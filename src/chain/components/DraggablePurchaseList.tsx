import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createContext, memo, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Clipboard } from "lucide-react";
import { SmartMouseSensor, SmartTouchSensor } from "./draggableSensors";
import { type GID, type Id } from "@/chain/data/types";
import { usePurchase } from "@/chain/state/hooks";
import { useClipboard } from "@/chain/state/clipboard";

// ─────────────────────────────────────────────────────────────────────────────
// Internal context — lets SortableItemContent read renderItem without receiving
// it as a prop, so React.memo can bail out on every drag-move re-render.
// ─────────────────────────────────────────────────────────────────────────────

const ItemRendererContext = createContext<(id: Id<GID.Purchase>) => ReactNode>(() => null);

// Memoized shell: only re-renders when the purchase's own store data changes,
// not when the dnd-kit drag state updates.
const SortableItemContent = memo(function SortableItemContent({ id }: { id: Id<GID.Purchase> }) {
  const renderItem = useContext(ItemRendererContext);
  return <>{renderItem(id)}</>;
});

// ─────────────────────────────────────────────────────────────────────────────
// SortableItem — thin drag wrapper; re-renders on drag moves but its child
// (SortableItemContent) is memoized and skips the expensive work.
// ─────────────────────────────────────────────────────────────────────────────

function SortableItem({ id }: { id: Id<GID.Purchase> }) {
  const { setNodeRef, transform, transition, isDragging, listeners, attributes } = useSortable({
    id: id as number,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Keep SortableItemContent mounted even while dragging so that any open
  // edit sessions (draft state, isEditing, etc.) survive the drag gesture.
  return (
    <div ref={setNodeRef} style={style} className="min-w-0">
      {isDragging && (
        <div className="h-8 rounded-lg border-2 border-dashed border-accent-ring bg-accent-tint" />
      )}
      <div
        className={isDragging ? "hidden" : "min-w-0 cursor-grab active:cursor-grabbing"}
        {...(isDragging ? undefined : listeners)}
        {...(isDragging ? undefined : attributes)}
      >
        <SortableItemContent id={id} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlay — lightweight preview that floats freely during drag
// ─────────────────────────────────────────────────────────────────────────────

function PurchaseOverlay({ id }: { id: Id<GID.Purchase> }) {
  const { purchase } = usePurchase(id);
  return (
    <div className="rounded-lg border border-trim bg-surface shadow-xl ring-2 ring-accent opacity-95 cursor-grabbing px-2.5 py-1.5">
      <span className="font-semibold text-sm text-ink">
        {purchase?.name || <span className="font-normal text-ghost italic">Unnamed</span>}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PasteButton — renders when clipboard has entries matching the given key
// ─────────────────────────────────────────────────────────────────────────────

export function PasteButton({
  clipboardKey,
  onPaste,
}: {
  clipboardKey: string;
  onPaste: () => void;
}) {
  const hasMatch = useClipboard((s) => s.entries.some((e) => e.key === clipboardKey));
  if (!hasMatch) return null;
  return (
    <button
      type="button"
      title="Paste purchases"
      onClick={onPaste}
      className="p-0.5 rounded transition-colors hover:bg-accent/20"
    >
      <Clipboard size={14} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DraggablePurchaseList — public API
// ─────────────────────────────────────────────────────────────────────────────

export type DraggablePurchaseListProps = {
  ids: Id<GID.Purchase>[];
  onReorder: (newIds: Id<GID.Purchase>[]) => void;
  renderItem: (id: Id<GID.Purchase>) => ReactNode;
};

export function DraggablePurchaseList({ ids, onReorder, renderItem }: DraggablePurchaseListProps) {
  const [activeId, setActiveId] = useState<number | null>(null);

  // Keep a ref to the latest renderItem so the stable context value always
  // calls the current version without having to change its reference.
  const renderItemRef = useRef(renderItem);
  renderItemRef.current = renderItem;
  const stableRender = useCallback((id: Id<GID.Purchase>) => renderItemRef.current(id), []);

  const sensors = useSensors(
    useSensor(SmartMouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(SmartTouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
  );

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id as number);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIdx = ids.findIndex((id) => (id as number) === active.id);
    const newIdx = ids.findIndex((id) => (id as number) === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    onReorder(arrayMove(ids, oldIdx, newIdx));
  };

  const numericIds = ids.map((id) => id as number);

  return (
    <ItemRendererContext.Provider value={stableRender}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={numericIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-0.5">
            {ids.map((id) => (
              <SortableItem key={id as number} id={id} />
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeId !== null && <PurchaseOverlay id={activeId as Id<GID.Purchase>} />}
        </DragOverlay>
      </DndContext>
    </ItemRendererContext.Provider>
  );
}
