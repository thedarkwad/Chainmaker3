import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createContext, memo, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { SmartMouseSensor, SmartTouchSensor } from "./draggableSensors";

// ─────────────────────────────────────────────────────────────────────────────
// Internal contexts — lets SortableItemContent read renderItem without receiving
// it as a prop, so React.memo can bail out on every drag-move re-render.
// ─────────────────────────────────────────────────────────────────────────────

type RenderFn<T extends number> = (id: T) => ReactNode;

const ItemRendererContext = createContext<RenderFn<number>>(() => null);
const PlaceholderClassContext = createContext<string>(
  "h-8 rounded-lg border-2 border-dashed border-accent-ring bg-accent-tint",
);

const SortableItemContent = memo(function SortableItemContent({ id }: { id: number }) {
  const renderItem = useContext(ItemRendererContext);
  return <>{renderItem(id)}</>;
});

// ─────────────────────────────────────────────────────────────────────────────
// SortableItem — keeps content mounted during drag (state is preserved).
// ─────────────────────────────────────────────────────────────────────────────

function SortableItem({ id }: { id: number }) {
  const placeholderClass = useContext(PlaceholderClassContext);
  const { setNodeRef, transform, transition, isDragging, listeners, attributes } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {isDragging && <div className={placeholderClass} />}
      <div
        className={isDragging ? "hidden" : "cursor-grab active:cursor-grabbing"}
        {...(isDragging ? undefined : listeners)}
        {...(isDragging ? undefined : attributes)}
      >
        <SortableItemContent id={id} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DraggableList — public API
// ─────────────────────────────────────────────────────────────────────────────

export type DraggableListProps<T extends number> = {
  ids: T[];
  onReorder: (newIds: T[]) => void;
  renderItem: (id: T) => ReactNode;
  renderOverlay?: (id: T) => ReactNode;
  /** "list" (default) uses a vertical flex column; "grid" uses rectSortingStrategy. */
  layout?: "list" | "grid";
  /** CSS classes for the items container. Defaults to "flex flex-col gap-0.5" for list. */
  containerClassName?: string;
  /** CSS classes for the drop placeholder shown in the vacated slot while dragging. */
  placeholderClassName?: string;
};

export function DraggableList<T extends number>({
  ids,
  onReorder,
  renderItem,
  renderOverlay,
  layout = "list",
  containerClassName,
  placeholderClassName,
}: DraggableListProps<T>) {
  const [activeId, setActiveId] = useState<number | null>(null);

  const renderItemRef = useRef(renderItem);
  renderItemRef.current = renderItem;
  const stableRender = useCallback((id: number) => renderItemRef.current(id as T), []);

  const sensors = useSensors(
    useSensor(SmartMouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(SmartTouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
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

  const isGrid = layout === "grid";
  const strategy = isGrid ? rectSortingStrategy : verticalListSortingStrategy;
  const containerClass = containerClassName ?? (isGrid ? "" : "flex flex-col gap-0.5");
  const phClass =
    placeholderClassName ??
    (isGrid
      ? "aspect-square rounded-lg border-2 border-dashed border-accent-ring bg-accent-tint"
      : "h-8 rounded-lg border-2 border-dashed border-accent-ring bg-accent-tint");

  return (
    <ItemRendererContext.Provider value={stableRender}>
      <PlaceholderClassContext.Provider value={phClass}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ids as number[]} strategy={strategy}>
            <div className={containerClass}>
              {ids.map((id) => (
                <SortableItem key={id as number} id={id as number} />
              ))}
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {activeId !== null && (
              renderOverlay
                ? renderOverlay(activeId as T)
                : <div className="rounded-lg border border-trim bg-surface shadow-xl ring-2 ring-accent opacity-95 cursor-grabbing px-2.5 py-1.5 text-sm font-semibold text-ink">...</div>
            )}
          </DragOverlay>
        </DndContext>
      </PlaceholderClassContext.Provider>
    </ItemRendererContext.Provider>
  );
}
