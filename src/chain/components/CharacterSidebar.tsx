import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { Chain } from "@/chain/data/Chain";
import type { Character } from "@/chain/data/Character";
import { createId, type GID } from "@/chain/data/types";
import {
  useReorderCharacters,
  useAddCharacter,
  useRemoveCharacter,
  useCharacterPassportStats,
} from "@/chain/state/hooks";
import { CollapsibleSidebar } from "@/ui/CollapsibleSidebar";
import { formatDuration } from "@/utilities/units";
import { Link, useNavigate } from "@tanstack/react-router";

// ─────────────────────────────────────────────────────────────────────────────

/** Floating overlay shown while dragging a character row. */
function CharBlockOverlay({ char }: { char: Character }) {
  return (
    <div className="rounded-md shadow-xl ring-2 ring-accent bg-surface opacity-95 cursor-grabbing">
      <div className="px-2 py-1.5 text-sm truncate">{char.name || "[unnamed character]"}</div>
    </div>
  );
}

/** One sortable character row. */
function SortableCharBlock({
  char,
  chainId,
  isSelected,
  charLinkTo,
}: {
  char: Character;
  chainId: string;
  isSelected: boolean;
  charLinkTo: string;
}) {
  const id = char.id as number;
  const stats = useCharacterPassportStats(char.id);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (isDragging) {
    return (
      <div ref={setNodeRef} style={style}>
        <div className="rounded-md border-2 border-dashed border-accent-ring bg-accent-tint px-2 py-1.5">
          <span className="invisible text-sm select-none">
            {char.name || "[unnamed character]"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="cursor-grab active:cursor-grabbing"
    >
      <Link
        to={charLinkTo as never}
        params={{ chainId, charId: String(id) } as never}
        className="min-w-0 truncate rounded text-sm transition-colors text-ink"
      >
        {isSelected ? (
          <div className="mx-2 m-1.5 rounded-xs outline outline-accent-ring">
            <div className="font-semibold text-center bg-accent-ring/15 text-accent-ring px-3 py-1 text-base">
              {char.name || "[unnamed character]"}
            </div>
            <div className="bg-surface p-1 text-xs flex flex-col items-center">
              <div className="grid grid-cols-2 gap-1">
                <div className="font-bold text-right">True Age:</div>
                <div>{stats ? formatDuration(stats.trueAgeYears) : "—"}</div>
                <div className="font-bold text-right">Total Jumps:</div>
                <div>{stats?.jumpsTaken ?? "—"}</div>
                {!char.primary && stats?.initialJumpId !== undefined && (
                  <>
                    <div className="font-bold text-right">Initial Jump:</div>
                    <div className="whitespace-normal">
                      <Link
                        to="/chain/$chainId/char/$charId/jump/$jumpId"
                        params={{
                          chainId,
                          charId: String(id),
                          jumpId: String(stats.initialJumpId as number),
                        }}
                        className="text-accent hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {stats.initialJumpName || "Jump"}
                      </Link>
                    </div>
                  </>
                )}
              </div>
              <div className="mt-2 mb-1 font-semibold text-accent-ring tracking-widest uppercase text-[10px]">
                Acquisitions:
              </div>
              <div className="grid grid-cols-[1fr_1fr] gap-y-1 gap-x-3 mb-1">
                <div><span className="font-semibold">{stats?.perkCount ?? "—"}</span> <span className="text-muted">Perks</span></div>
                <div><span className="font-semibold">{stats?.itemCount ?? "—"}</span> <span className="text-muted">Items</span></div>
                <div><span className="font-semibold">{stats?.altFormCount ?? "—"}</span> <span className="text-muted">Alt-Forms</span></div>
                <div><span className="font-semibold">{stats?.cpTotal?.toString?.()?.replace(/\B(?=(\d{3})+(?!\d))/g, ",") ?? "—"}</span> <span className="text-muted">CP Spent</span></div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xs border border-edge bg-surface p-1 mt-0.5 text-ink hover:text-accent2 hover:bg-accent2-tint">
            <span className="hover:text-accent2 font-semibold">
              {char.name || "[unnamed character]"}
            </span>
          </div>
        )}
      </Link>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sortable character list sidebar, shared between the Summary and Items layouts.
 *
 * `charLinkTo` — the TanStack Router `to` string used when clicking a character
 *  row. Must include `$chainId` and `$charId` path params, e.g.:
 *  `"/chain/$chainId/char/$charId/summary/"` or
 *  `"/chain/$chainId/char/$charId/items/"`
 */

export function CharacterSidebar({
  chain,
  chainId,
  currentCharId,
  charLinkTo,
}: {
  chain: Chain | undefined;
  chainId: string;
  currentCharId: number;
  charLinkTo: string;
}) {
  const reorderCharacters = useReorderCharacters();
  const addCharacter = useAddCharacter();
  const removeCharacter = useRemoveCharacter();
  const navigate = useNavigate();
  const [activePrimaryDragId, setActivePrimaryDragId] = useState<number | null>(null);
  const [activeCompanionDragId, setActiveCompanionDragId] = useState<number | null>(null);

  const primarySensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
  );
  const companionSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
  );

  const characters = chain
    ? chain.characterList.map((id) => chain.characters.O[id]).filter(Boolean)
    : [];

  const primary = characters.filter((c) => c!.primary) as Character[];
  const companions = characters.filter((c) => !c!.primary) as Character[];

  const primaryIds = primary.map((c) => c.id as number);
  const companionIds = companions.map((c) => c.id as number);

  const activePrimaryChar =
    activePrimaryDragId != null
      ? (primary.find((c) => (c.id as number) === activePrimaryDragId) ?? null)
      : null;
  const activeCompanionChar =
    activeCompanionDragId != null
      ? (companions.find((c) => (c.id as number) === activeCompanionDragId) ?? null)
      : null;

  const handlePrimaryDragEnd = ({ active, over }: DragEndEvent) => {
    setActivePrimaryDragId(null);
    if (!over || active.id === over.id) return;
    const oldIdx = primaryIds.indexOf(active.id as number);
    const newIdx = primaryIds.indexOf(over.id as number);
    if (oldIdx === -1 || newIdx === -1) return;
    const newPrimaryIds = arrayMove(primaryIds, oldIdx, newIdx);
    reorderCharacters([...newPrimaryIds, ...companionIds].map((id) => createId<GID.Character>(id)));
  };

  const handleCompanionDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveCompanionDragId(null);
    if (!over || active.id === over.id) return;
    const oldIdx = companionIds.indexOf(active.id as number);
    const newIdx = companionIds.indexOf(over.id as number);
    if (oldIdx === -1 || newIdx === -1) return;
    const newCompanionIds = arrayMove(companionIds, oldIdx, newIdx);
    reorderCharacters([...primaryIds, ...newCompanionIds].map((id) => createId<GID.Character>(id)));
  };

  return (
    <CollapsibleSidebar label="Characters">
      {/* Scrollable character lists */}
      <div className="flex-1 overflow-y-auto py-2 px-2 min-h-0">
        {/* Primary Jumpers section */}
        <div className="px-1 pb-0.5 mb-0.5 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ghost">
            Primary Jumpers
          </span>
        </div>

        <DndContext
          sensors={primarySensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) => setActivePrimaryDragId(active.id as number)}
          onDragEnd={handlePrimaryDragEnd}
        >
          <SortableContext items={primaryIds} strategy={verticalListSortingStrategy}>
            {primary.map((char) => (
              <SortableCharBlock
                key={char.id as number}
                char={char}
                chainId={chainId}
                isSelected={(char.id as number) === currentCharId}
                charLinkTo={charLinkTo}
              />
            ))}
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activePrimaryChar && <CharBlockOverlay char={activePrimaryChar} />}
          </DragOverlay>
        </DndContext>

        {!chain && <p className="text-xs text-ghost text-center mt-2 px-3">Loading…</p>}
        {chain && primary.length === 0 && (
          <p className="text-xs text-ghost text-center mt-2 px-3 italic">No primary jumpers.</p>
        )}

        {/* Primary jumper controls */}
        <div className="flex gap-1.5 mt-1.5 px-1">
          <button
            type="button"
            title="Add primary jumper"
            className="flex-1 flex items-center justify-center gap-1 text-xs text-muted hover:text-ink border border-edge rounded px-2 py-1 transition-colors"
            onClick={() => {
              const newId = addCharacter(true);
              navigate({
                to: charLinkTo,
                params: { chainId, charId: String(newId as number) } as never,
              });
            }}
          >
            <Plus size={12} /> Add
          </button>
          <button
            type="button"
            title="Delete this primary jumper"
            disabled={
              primary.length <= 1 || !primary.some((c) => (c.id as number) === currentCharId)
            }
            className="flex-1 flex items-center justify-center gap-1 text-xs text-muted hover:text-danger border border-edge rounded px-2 py-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-muted"
            onClick={() => {
              const fallback =
                primary.find((c) => (c.id as number) !== currentCharId) ?? companions[0];
              removeCharacter(createId<GID.Character>(currentCharId));
              if (fallback)
                navigate({
                  to: charLinkTo,
                  params: { chainId, charId: String(fallback.id as number) } as never,
                });
            }}
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>

        {/* Companions section */}
        <div className="px-1 pt-4 pb-0.5 mb-0.5 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ghost">
            Companions
          </span>
        </div>

        <DndContext
          sensors={companionSensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) => setActiveCompanionDragId(active.id as number)}
          onDragEnd={handleCompanionDragEnd}
        >
          <SortableContext items={companionIds} strategy={verticalListSortingStrategy}>
            {companions.map((char) => (
              <SortableCharBlock
                key={char.id as number}
                char={char}
                chainId={chainId}
                isSelected={(char.id as number) === currentCharId}
                charLinkTo={charLinkTo}
              />
            ))}
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activeCompanionChar && <CharBlockOverlay char={activeCompanionChar} />}
          </DragOverlay>
        </DndContext>

        {chain && companions.length === 0 && (
          <p className="text-xs text-ghost text-center mt-2 px-3 italic">No companions.</p>
        )}

        {/* Companion controls */}
        <div className="flex gap-1.5 mt-1.5 px-1">
          <button
            type="button"
            title="Add companion"
            className="flex-1 flex items-center justify-center gap-1 text-xs text-muted hover:text-ink border border-edge rounded px-2 py-1 transition-colors"
            onClick={() => {
              const newId = addCharacter(false);
              navigate({
                to: charLinkTo as never,
                params: { chainId, charId: String(newId as number) } as never,
              });
            }}
          >
            <Plus size={12} /> Add
          </button>
          <button
            type="button"
            title="Delete this companion"
            disabled={!companions.some((c) => (c.id as number) === currentCharId)}
            className="flex-1 flex items-center justify-center gap-1 text-xs text-muted hover:text-danger border border-edge rounded px-2 py-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-muted"
            onClick={() => {
              const fallback =
                primary[0] ?? companions.find((c) => (c.id as number) !== currentCharId);
              removeCharacter(createId<GID.Character>(currentCharId));
              if (fallback)
                navigate({
                  to: charLinkTo as never,
                  params: { chainId, charId: String(fallback.id as number) } as never,
                });
            }}
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>
    </CollapsibleSidebar>
  );
}
