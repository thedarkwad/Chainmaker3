import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  Tag,
  Undo2,
  X,
} from "lucide-react";
import { useState } from "react";

import {
  type AbstractPurchase,
  type BasicPurchase,
  PurchaseType,
  type SupplementPurchase,
} from "@/chain/data/Purchase";
import { type GID, type Id } from "@/chain/data/types";
import { useJumpDocId, useJumpName, usePurchase, usePurchaseSubtypes } from "@/chain/state/hooks";
import { useDraft } from "@/chain/state/useDraft";
import { AutoResizeTextarea } from "@/ui/AutoResizeTextarea";
import { Link } from "@tanstack/react-router";
import { convertWhitespace } from "@/utilities/miscUtilities";

// ─────────────────────────────────────────────────────────────────────────────

type PurchasePreviewProps = {
  id: Id<GID.Purchase>;
  chainId: string;
  charId: string;
  /**
   * When true the collapsed row has a transparent border and invisible chevron
   * that only appear on hover — use for subpurchase rows and tag-grouped lists.
   */
  subdued?: boolean;
  /** When true, renders an obsolete toggle button on the card (supp pages only). */
  showObsoleteToggle?: boolean;
  /** Whether this purchase is currently obsolete for the viewed jump. */
  isObsolete?: boolean;
  /** Called when the user toggles the obsolete state. */
  onSetObsolete?: (obsolete: boolean) => void;
  /** When set, shows a remove-from-group button next to the edit pencil. */
  onRemoveFromGroup?: () => void;
  /** When true, renders the card greyed out and non-interactive (no edit, no remove). */
  dimmed?: boolean;
};

/**
 * Collapsible, lightly-editable purchase card for summary/list views.
 *
 * - Edit mode allows changing name + description; subpurchases remain visible.
 * - Subpurchases render as nested PurchasePreview cards (subdued, no jump pill, no tags).
 * - The jump pill links to the correct tab: /purchases for normal/section perks,
 *   /subsystem/$subtypeId for route-placement subtypes, or /supp/$supplementId for
 *   supplement perks.
 * - Subpurchase cards (PurchaseType.Subpurchase) never show tags or jump pills.
 */
export function PurchasePreview({
  id,
  chainId,
  charId,
  subdued = false,
  showObsoleteToggle = false,
  isObsolete = false,
  onSetObsolete,
  onRemoveFromGroup,
  dimmed = false,
}: PurchasePreviewProps) {
  const { purchase, actions } = usePurchase<AbstractPurchase>(id);
  const jumpId = (purchase as any)?.jumpId as Id<GID.Jump> | undefined;
  const jumpName = useJumpName(jumpId);
  const subtypes = usePurchaseSubtypes(jumpId);
  const jumpdocId = useJumpDocId(jumpId!); // jumpId guaranteed non-null when pill renders (guarded below)
  const draft = useDraft<{ name: string; description: string }>({ name: "", description: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!purchase) return null;

  // ── Derived data ──────────────────────────────────────────────────────────
  const isSubpurchase = purchase.type === PurchaseType.Subpurchase;
  const isSupp = purchase.type === PurchaseType.SupplementPerk;

  const tags: string[] =
    !isSubpurchase && "tags" in purchase
      ? (purchase as BasicPurchase | SupplementPurchase).tags
      : [];
  const subList: Id<GID.Purchase>[] = !isSubpurchase
    ? ((purchase as BasicPurchase).subpurchases?.list ?? [])
    : [];

  // ── Jump pill (suppressed for subpurchases) ───────────────────────────────
  const jumpPill = (() => {
    if (isSubpurchase || jumpId == null) return null;

    const pillClass =
      "truncate min-w-10 text-xs px-2 py-0.5 rounded-full bg-accent2-tint text-accent2 border border-accent2-ring hover:bg-accent2 hover:text-surface transition-colors font-medium";

    const scrollToSearch = {
      scrollTo: String(id),
      ...(jumpdocId != null ? { hideViewer: true as const } : {}),
    };

    if (isSupp) {
      const suppId = (purchase as SupplementPurchase).supplement;
      return (
        <Link
          to="/chain/$chainId/char/$charId/jump/$jumpId/supp/$supplementId"
          params={{ chainId, charId, jumpId: String(jumpId), supplementId: String(suppId) }}
          search={scrollToSearch}
          className={pillClass}
        >
          {jumpName || "Jump"}
        </Link>
      );
    }

    const subtypeId = (purchase as BasicPurchase).subtype;
    const isRoute = subtypeId != null && subtypes?.O[subtypeId]?.placement === "route";

    if (isRoute) {
      return (
        <Link
          to="/chain/$chainId/char/$charId/jump/$jumpId/subsystem/$subtypeId"
          params={{ chainId, charId, jumpId: String(jumpId), subtypeId: String(subtypeId) }}
          search={scrollToSearch}
          className={pillClass}
        >
          {jumpName || "Jump"}
        </Link>
      );
    }

    return (
      <Link
        to="/chain/$chainId/char/$charId/jump/$jumpId/purchases"
        params={{ chainId, charId, jumpId: String(jumpId) }}
        search={scrollToSearch}
        className={pillClass}
      >
        {jumpName || "Jump"}
      </Link>
    );
  })();

  // ── Edit actions ──────────────────────────────────────────────────────────
  const enterEdit = () => {
    draft.restart(
      { name: purchase.name, description: purchase.description },
      "Enter edit",
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
    actions.modify("Edit purchase", (d) => {
      d.name = s.name;
      d.description = s.description;
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    draft.cancel();
    setIsEditing(false);
  };

  // ── Obsolete toggle — compact icon for collapsed row ─────────────────────
  const obsoleteButtonCompact = showObsoleteToggle ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSetObsolete?.(!isObsolete);
      }}
      title={isObsolete ? "Un-mark obsolete" : "Mark as obsolete"}
      className={`sm:opacity-0 sm:group-hover:opacity-100 text-ghost hover:text-accent transition-all p-0.5 shrink-0`}
    >
      {isObsolete ? <ArchiveRestore size={13} /> : <Archive size={13} />}
    </button>
  ) : null;

  // ── Obsolete toggle — prominent labeled row for expanded view ─────────────
  const obsoleteButtonExpanded = showObsoleteToggle ? (
    <div className="px-3 py-2 border-t border-line">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSetObsolete?.(!isObsolete);
        }}
        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors ${
          isObsolete
            ? "text-muted border-edge bg-accent2-tint hover:text-accent2 hover:border-accent2/50"
            : "text-muted border-edge bg-accent2-tint hover:text-accent2 hover:border-accent2/50"
        }`}
      >
        {isObsolete ? <ArchiveRestore size={13} /> : <Archive size={13} />}
        {isObsolete ? "Un-mark obsolete" : "Mark as obsolete"}
      </button>
    </div>
  ) : null;

  // ── Subpurchase section (shared between edit + expanded views) ────────────
  const subpurchaseSection =
    subList.length > 0 ? (
      <div className="px-3 py-2 flex flex-col gap-1 border-t border-line">
        {subList.map((subId) => (
          <PurchasePreview key={subId} id={subId} chainId={chainId} charId={charId} subdued />
        ))}
      </div>
    ) : null;

  // ── Edit mode ─────────────────────────────────────────────────────────────
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
          <input
            autoFocus
            className="flex-1 min-w-32 font-semibold text-sm bg-transparent border-b border-transparent hover:border-trim focus:border-accent-ring outline-none px-0.5 py-0.5"
            placeholder="Name"
            defaultValue={draft.state.name}
            onChange={(e) =>
              draft.sync((d) => {
                d.name = e.target.value;
              })
            }
          />
          {jumpPill}
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
        {subpurchaseSection}
      </div>
    );
  }

  // ── Collapsed view ────────────────────────────────────────────────────────
  if (!isExpanded) {
    return (
      <div
        className={`group rounded-lg flex items-center gap-1.5 px-2.5 transition-colors border ${
          dimmed
            ? "bg-surface border-line py-1 opacity-40 pointer-events-none select-none"
            : subdued
              ? "cursor-pointer hover:bg-surface bg-transparent border-transparent hover:border-edge py-0.5"
              : "cursor-pointer bg-surface border-line hover:border-edge py-0.5"
        } ${!dimmed && isObsolete ? "opacity-50" : ""}`}
        onClick={dimmed ? undefined : () => setIsExpanded(true)}
      >
        <ChevronRight
          size={13}
          className={`text-ghost shrink-0 transition-opacity ${
            subdued ? "sm:opacity-0 sm:group-hover:opacity-100" : ""
          }`}
        />
        <span className="font-semibold text-sm grow max-w-max truncate">
          {purchase.name || <span className="font-normal text-ghost italic">Unnamed</span>}
        </span>
        {purchase.description ? (
          <span className="flex-1 min-w-0 text-sm text-muted truncate">{purchase.description}</span>
        ) : (
          <span className="flex-1" />
        )}
        {jumpPill}
        {!dimmed && obsoleteButtonCompact}
        {dimmed
          ? <span className={`shrink-0 ${onRemoveFromGroup ? "w-10.5" : "w-5.25"}`} />
          : (
            <>
              {onRemoveFromGroup && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveFromGroup(); }}
                  className="sm:opacity-0 sm:group-hover:opacity-100 text-ghost hover:text-danger transition-all p-0.5 shrink-0"
                  title="Remove from group"
                >
                  <X size={13} />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); enterEdit(); }}
                className="sm:opacity-0 sm:group-hover:opacity-100 text-ghost hover:text-accent transition-all p-0.5 shrink-0"
                title="Edit"
              >
                <Pencil size={13} />
              </button>
            </>
          )
        }
      </div>
    );
  }

  // ── Expanded view ─────────────────────────────────────────────────────────
  return (
    <div
      className={`border border-trim rounded-lg bg-linear-to-b from-tint to-accent2-tint shadow-sm my-1 ${isObsolete ? "opacity-50" : ""}`}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setIsExpanded(false)}
      >
        <ChevronDown size={14} className="text-ghost shrink-0" />
        <span className="flex-1 font-semibold text-sm text-ink min-w-0 truncate">
          {purchase.name || <span className="font-normal text-ghost italic">Unnamed</span>}
        </span>
        {jumpPill}
        {onRemoveFromGroup && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveFromGroup(); }}
            className="text-ghost hover:text-danger transition-colors p-0.5 shrink-0"
            title="Remove from group"
          >
            <X size={14} />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            enterEdit();
          }}
          className="text-ghost hover:text-accent transition-colors p-0.5 shrink-0"
          title="Edit"
        >
          <Pencil size={14} />
        </button>
      </div>

      {purchase.description && (
        <div className="px-3 pt-1 pb-2.5 text-sm text-muted flex flex-col gap-2 leading-snug border-t border-line">
          {convertWhitespace(purchase.description)}
        </div>
      )}

      {tags.length > 0 && (
        <div className="px-3 py-1.5 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Link
              key={tag}
              to={
                purchase.type == PurchaseType.Item || purchase.type == PurchaseType.SupplementItem
                  ? "/chain/$chainId/char/$charId/items"
                  : "/chain/$chainId/char/$charId/summary/perks"
              }
              params={{ chainId, charId }}
              search={{ tag }}
              className="flex items-center gap-0.5 text-xs bg-tint/30 border border-edge text-muted rounded px-1.5 py-0.5 hover:bg-accent-tint hover:text-accent hover:border-accent transition-colors"
            >
              <Tag size={9} />
              {tag}
            </Link>
          ))}
        </div>
      )}

      {subpurchaseSection}
      {obsoleteButtonExpanded}
    </div>
  );
}
