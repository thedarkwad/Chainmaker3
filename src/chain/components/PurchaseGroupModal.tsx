import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { type GID, type Id } from "@/chain/data/types";
import { PurchaseType } from "@/chain/data/Purchase";
import { useAllPurchaseGroups } from "@/chain/state/hooks";
import { PurchaseGroupEditor } from "./PurchaseGroupEditor";

type PurchaseGroupModalProps = {
  charId: Id<GID.Character>;
  charIdStr: string;
  chainId: string;
  purchaseId: Id<GID.Purchase>;
  type: PurchaseType.Perk | PurchaseType.Item;
  currentGroupId?: Id<GID.PurchaseGroup>;
  onAddToGroup: (groupId: Id<GID.PurchaseGroup>) => void;
  onRemoveFromGroup: () => void;
  onCreateGroup: (name: string, description: string) => Id<GID.PurchaseGroup>;
  onClose: () => void;
};

type ModalView =
  | { kind: "list" }
  | { kind: "group"; groupId: Id<GID.PurchaseGroup>; isCurrentGroup: boolean };

export function PurchaseGroupModal({
  charId,
  charIdStr,
  chainId,
  purchaseId,
  type,
  currentGroupId,
  onAddToGroup,
  onRemoveFromGroup,
  onCreateGroup,
  onClose,
}: PurchaseGroupModalProps) {
  const allGroups = useAllPurchaseGroups(charId, type);
  const typeName = type === PurchaseType.Perk ? "Perk" : "Item";

  const makeInitialView = (): ModalView => {
    if (currentGroupId != null) {
      return { kind: "group", groupId: currentGroupId, isCurrentGroup: true };
    }
    return { kind: "list" };
  };

  const [view, setView] = useState<ModalView>(makeInitialView);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const title = (() => {
    if (view.kind === "list") return `Add to ${typeName} Group`;
    if (view.kind === "group" && view.isCurrentGroup) return `${typeName} Group`;
    return `Add to ${typeName} Group`;
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex sm:items-center sm:justify-center bg-black/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); e.stopPropagation(); }}
      onPointerDown={(e) => e.stopPropagation()}
      onDragStart={(e) => e.stopPropagation()}
    >
      <div className="bg-surface border border-edge shadow-2xl flex flex-col overflow-hidden w-full h-full sm:h-auto sm:rounded-xl sm:max-w-sm md:max-w-xl sm:mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
          <span className="font-semibold text-sm text-ink">{title}</span>
          <button onClick={onClose} className="text-ghost hover:text-ink p-0.5 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col p-4 gap-2 overflow-y-auto flex-1 sm:flex-none sm:max-h-[70vh]">
          {view.kind === "list" && (
            <>
              {allGroups.length === 0 && (
                <p className="text-sm text-ghost italic text-center py-2">No groups yet.</p>
              )}
              {allGroups.map((g) => (
                <button
                  key={g.id as number}
                  onClick={() => setView({ kind: "group", groupId: g.id, isCurrentGroup: false })}
                  className="flex flex-col items-start gap-0.5 text-left rounded-lg border border-edge px-3 py-2 hover:bg-accent-tint hover:border-accent/50 transition-colors"
                >
                  <span className="font-semibold text-sm text-ink">
                    {g.name || <span className="italic text-ghost font-normal">Unnamed</span>}
                  </span>
                  {g.description && (
                    <span className="text-xs text-muted truncate w-full">{g.description}</span>
                  )}
                </button>
              ))}
              <button
                onClick={() => {
                  const newId = onCreateGroup("", "");
                  setView({ kind: "group", groupId: newId, isCurrentGroup: false });
                }}
                className="flex items-center gap-2 rounded-lg border border-dashed border-accent/50 px-3 py-2 text-sm text-accent hover:bg-accent-tint transition-colors"
              >
                <Plus size={14} />
                New group
              </button>
            </>
          )}

          {view.kind === "group" && (
            <>
              {!view.isCurrentGroup && allGroups.length > 0 && (
                <button
                  onClick={() => setView({ kind: "list" })}
                  className="text-xs text-accent hover:underline text-left mb-1"
                >
                  &larr; Back to list
                </button>
              )}
              <PurchaseGroupEditor
                groupId={view.groupId}
                charId={charId}
                chainId={chainId}
                charIdStr={charIdStr}
                currentPurchaseId={purchaseId}
                defaultExpanded
              />
              <div className="flex items-center justify-between mt-1">
                <div>
                  {view.isCurrentGroup && (
                    <button
                      onClick={() => { onRemoveFromGroup(); onClose(); }}
                      className="text-xs text-danger hover:underline"
                    >
                      Remove from group
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    className="text-sm text-ghost hover:text-ink px-3 py-1 transition-colors"
                  >
                    {view.isCurrentGroup ? "Done" : "Cancel"}
                  </button>
                  {!view.isCurrentGroup && (
                    <button
                      onClick={() => { onAddToGroup(view.groupId); onClose(); }}
                      className="text-sm bg-accent text-surface rounded px-3 py-1 hover:bg-accent/90 transition-colors font-medium"
                    >
                      Add to Group
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
