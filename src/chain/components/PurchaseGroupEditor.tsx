import { Check, ChevronDown, ChevronRight, Pencil, Undo2 } from "lucide-react";
import { useState } from "react";
import { type GID, type Id } from "@/chain/data/types";
import { usePurchaseGroup } from "@/chain/state/hooks";
import { DraggablePurchaseList } from "./DraggablePurchaseList";
import { PurchasePreview } from "./PurchasePreview";
import { useDraft } from "@/chain/state/useDraft";
import { AutoResizeTextarea } from "@/ui/AutoResizeTextarea";
import { convertWhitespace } from "@/utilities/miscUtilities";

type PurchaseGroupEditorProps = {
  groupId: Id<GID.PurchaseGroup>;
  charId: Id<GID.Character>;
  jumpId?: Id<GID.Jump>;
  chainId: string;
  charIdStr: string;
  /** When set, this purchase is shown greyed-out and uneditable in the component list.
   *  If it is already in the group it renders in-place but dimmed;
   *  otherwise it is appended at the bottom as a non-interactive preview. */
  currentPurchaseId?: Id<GID.Purchase>;
  /** When true, the group starts in the expanded state. Defaults to false. */
  defaultExpanded?: boolean;
};

export function PurchaseGroupEditor({
  groupId,
  charId,
  jumpId,
  chainId,
  charIdStr,
  currentPurchaseId,
  defaultExpanded = false,
}: PurchaseGroupEditorProps) {
  const { group, componentIds, actions } = usePurchaseGroup(groupId, charId, jumpId);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isEditing, setIsEditing] = useState(false);
  const draft = useDraft<{ name: string; description: string }>({ name: "", description: "" });

  if (!group) return null;

  const enterEdit = () => {
    draft.restart(
      { name: group.name, description: group.description },
      "Edit group",
      () => setIsEditing(false),
      () => {
        setIsEditing(true);
        setIsExpanded(true);
      },
    );
    setIsEditing(true);
    setIsExpanded(true);
  };

  const handleSave = () => {
    const s = draft.state;
    draft.close();
    actions.modify("Edit group", (g) => {
      g.name = s.name;
      g.description = s.description;
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    draft.cancel();
    setIsEditing(false);
  };

  // Split into interactive ids and the (optional) dimmed current-purchase id
  const draggableIds =
    currentPurchaseId != null
      ? componentIds.filter((pid) => pid !== currentPurchaseId)
      : componentIds;
  const dimmedInList = currentPurchaseId != null && componentIds.includes(currentPurchaseId);
  const showDimmedAtBottom = currentPurchaseId != null && !dimmedInList;

  const hasAny = draggableIds.length > 0 || currentPurchaseId != null;
  const componentList = hasAny ? (
    <div className="px-2 py-2 flex flex-col gap-1 border-t border-line">
      {draggableIds.length > 0 && (
        <DraggablePurchaseList
          ids={draggableIds}
          onReorder={actions.reorderComponents}
          renderItem={(pid) => (
            <PurchasePreview
              id={pid}
              chainId={chainId}
              charId={charIdStr}
              subdued
              onRemoveFromGroup={() => actions.removeComponent(pid)}
            />
          )}
        />
      )}
      {dimmedInList && currentPurchaseId != null && (
        <PurchasePreview
          id={currentPurchaseId}
          chainId={chainId}
          charId={charIdStr}
          onRemoveFromGroup={() => {}}
          subdued
          dimmed
        />
      )}
      {showDimmedAtBottom && currentPurchaseId != null && (
        <PurchasePreview
          id={currentPurchaseId}
          chainId={chainId}
          charId={charIdStr}
          onRemoveFromGroup={() => {}}
          subdued
          dimmed
        />
      )}
    </div>
  ) : null;

  if (isEditing) {
    return (
      <div
        className="border border-accent-ring rounded-lg bg-linear-to-b from-accent-tint to-tint shadow-md flex flex-col divide-y divide-line my-1"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            handleCancel();
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSave();
          }
        }}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-xs font-medium text-muted/70 shrink-0">Group</span>
          <input
            autoFocus
            className="flex-1 min-w-32 font-semibold text-sm bg-transparent border-b border-transparent hover:border-trim focus:border-accent-ring outline-none px-0.5 py-0.5"
            placeholder="Group name"
            defaultValue={draft.state.name}
            onChange={(e) =>
              draft.sync((d) => {
                d.name = e.target.value;
              })
            }
          />
          <button
            onClick={handleSave}
            className="text-muted hover:text-accent transition-colors p-0.5 shrink-0"
            title="Save"
          >
            <Check size={14} />
          </button>
          <button
            onClick={handleCancel}
            className="text-ghost hover:text-muted transition-colors p-0.5 shrink-0"
            title="Cancel"
          >
            <Undo2 size={14} />
          </button>
        </div>
        <div className="px-3 py-2">
          <AutoResizeTextarea
            className="w-full text-sm text-muted min-h-12 focus:outline-none placeholder-ghost"
            placeholder="Description"
            defaultValue={draft.state.description}
            onChange={(e) =>
              draft.sync((d) => {
                d.description = e.target.value;
              })
            }
          />
        </div>
        {componentList}
      </div>
    );
  }

  if (!isExpanded) {
    return (
      <div
        className="group rounded-lg flex items-center gap-1.5 px-2.5 py-1 bg-surface border border-transparent hover:border-edge cursor-pointer transition-colors"
        onClick={() => setIsExpanded(true)}
      >
        <ChevronRight size={13} className="text-ghost shrink-0 transition-opacity" />
        <span className="text-xs font-medium text-muted/70 shrink-0 select-none">Group</span>
        <span className="font-semibold text-sm shrink-0 truncate">
          {group.name || <span className="font-normal text-ghost italic">Unnamed Group</span>}
        </span>
        {group.description ? (
          <span className="flex-1 min-w-0 text-sm text-muted truncate">{group.description}</span>
        ) : (
          <span className="flex-1" />
        )}
        <span className="text-xs text-ghost shrink-0 tabular-nums">({componentIds.length})</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            enterEdit();
          }}
          className="sm:opacity-0 sm:group-hover:opacity-100 text-ghost hover:text-accent transition-all p-0.5 shrink-0"
          title="Edit group"
        >
          <Pencil size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="border border-trim rounded-lg bg-linear-to-b from-tint to-accent2-tint shadow-sm my-1">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setIsExpanded(false)}
      >
        <ChevronDown size={14} className="text-ghost shrink-0" />
        <span className="text-xs font-medium text-muted/70 shrink-0 select-none">Group</span>
        <span className="flex-1 font-semibold text-sm text-ink min-w-0 truncate">
          {group.name || <span className="font-normal text-ghost italic">Unnamed Group</span>}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            enterEdit();
          }}
          className="text-ghost hover:text-accent transition-colors p-0.5 shrink-0"
          title="Edit group"
        >
          <Pencil size={14} />
        </button>
      </div>

      {group.description && (
        <div className="px-3 pt-1 pb-2.5 text-sm text-muted flex flex-col gap-2 leading-snug border-t border-line">
          {convertWhitespace(group.description)}
        </div>
      )}

      {componentList}
    </div>
  );
}
