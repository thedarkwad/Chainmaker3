/**
 * AnnotationInteractionHandler — reacts to ViewerAnnotationActions from JumpDocViewer.
 *
 * Mounted once inside JumpLayout. When the viewer (inline or popped-out) writes a
 * pendingAction, this handler in the main window picks it up, builds an
 * AnnotationInteraction per action, then either:
 *   - executes it immediately (single action, forcePreview = false), or
 *   - shows a SweetAlert2 popup with one column per action so the user can choose.
 *
 * The popup always renders in the main window, even when the viewer is popped out.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { createId, type GID, type Id, type LID, type TID, type Registry } from "@/chain/data/types";
import type {
  Currency,
  CurrencyExchange,
  Origin,
  OriginCategory,
  PurchaseSubtype,
} from "@/chain/data/Jump";
import type { Budget } from "@/chain/data/CalculatedData";
import {
  CostModifier,
  PurchaseType,
  RewardType,
  type CompanionImport,
  type ModifiedCost,
  type Scenario,
  type StoredAlternativeCost,
  type StoredPurchasePrerequisite,
  type Value,
} from "@/chain/data/Purchase";
import {
  stripTemplating,
  type ScenarioRewardTemplate,
  type ScenarioTemplate,
} from "@/chain/data/JumpDoc";
import type { Chain } from "@/chain/data/Chain";
import { useJumpDocStore } from "@/jumpdoc/state/JumpDocStore";
import { useChainStore } from "@/chain/state/Store";
import { useNavigate } from "@tanstack/react-router";
import {
  useAllCharacters,
  useRemoveCharacter,
  useBudget,
  useCurrencyExchanges,
  useJumpCurrencies,
  useJumpDocCompanionActions,
  useJumpDocDrawbackActions,
  useJumpDocPurchaseActions,
  useJumpDocScenarioActions,
  useJumpOriginCategories,
  useJumpOrigins,
  usePurchaseSubtypes,
} from "@/chain/state/hooks";
import {
  useViewerActionStore,
  type ResolvedAltCost,
  type ViewerAnnotationAction,
} from "@/chain/state/ViewerActionStore";
import { CompanionMultiSelect } from "./CompanionMultiSelect";
import { NewCompanionModal } from "./NewCompanionModal";
import { InteractionPreviewCard, InteractionPreviewCardProps } from "./InteractionPreviewCard";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { convertWhitespace } from "@/utilities/miscUtilities";
import {
  type TagField,
  type RouteParams,
  resolveJumpOriginCategory,
  resolveJumpCurrency,
  resolveJumpPurchaseSubtype,
  extractTags,
  applyTags,
  resolveEviction,
  resolveOriginTemplate,
  createOriginStipendDrawbacks,
  removeOriginStipendDrawbacks,
  commitAddOrigin,
  resolveAltCostsToStorage,
  checkResolvedAltCostPrereqs,
  resolvePrereqsToStorage,
  getUnmetPrereqs,
  altCostValueStr,
  originDiscountModifier,
  originDiscountCostStr,
  parseTemplatePlaceholders,
  originTemplateInfo,
  buildFreebieActions,
  buildScenarioRewardActions,
  buildScenarioCompanionRewardActions,
} from "./annotationResolvers";

const MySwal = withReactContent(Swal);

// ─────────────────────────────────────────────────────────────────────────────
// Public type
// ─────────────────────────────────────────────────────────────────────────────

export type AnnotationInteraction = {
  /** Human-readable annotation name. */
  name: string;
  /** Human-readable type label (e.g. "Perk", "Origin"). */
  typeName: string;
  /** Accent color for this annotation type. */
  color: string;
  /**
   * When false and this is the only clicked annotation, executeDefault() fires
   * immediately. When true, the preview popup is always shown.
   */
  forcePreview: boolean;
  /** When true, this interaction represents a blocked/error state. Filtered out when other non-error interactions exist. */
  isError?: boolean;
  /** When true, this interaction is origin-option derived and will be sorted to the end of the tab list. */
  isOriginOption?: true;
  /**
   * Execute the action with default parameters — used for no-friction single clicks.
   * The Preview component should call this (plus onClose) when the user confirms.
   */
  executeDefault: () => void;
  /**
   * Renders a preview of the action, possibly with form controls.
   * Receives onClose to dismiss the SweetAlert2 popup when done.
   */
  Preview: React.ComponentType<{ onClose: () => void }>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared origin helpers
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Purchase preview component
// ─────────────────────────────────────────────────────────────────────────────

type PurchaseAction = Extract<ViewerAnnotationAction, { collection: "purchase" }>;
type PurchaseSubtypeResolved = {
  lid: Id<LID.PurchaseSubtype>;
  type: PurchaseType.Perk | PurchaseType.Item;
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared tag fields UI
// ─────────────────────────────────────────────────────────────────────────────

function TagFieldsSection({
  tags,
  tagValues,
  choiceContext,
  onChangeTag,
}: {
  tags: TagField[];
  tagValues: Record<string, string>;
  choiceContext?: string;
  onChangeTag: (name: string, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 p-2 rounded-md border-edge bg-tint border">
      {tags.map((tag) => (
        <label key={tag.name} className="contents">
          <div
            className={`text-xs font-semibold text-muted text-right min-w-min max-w-max w-30 justify-self-end ${!tag.multiline ? "self-stretch items-center flex" : ""}`}
          >
            {tag.name
              .split(" ")
              .map((w) => w[0].toUpperCase() + w.slice(1))
              .join(" ")}
            :
          </div>
          {tag.multiline ? (
            <textarea
              className="bg-transparent border border-edge rounded px-2 py-1 text-sm text-ink! focus:outline-none focus:border-accent-ring w-full"
              rows={3}
              value={tagValues[tag.name] ?? ""}
              ref={(el) => {
                if (el) {
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }
              }}
              onChange={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
                onChangeTag(tag.name, e.target.value);
              }}
            />
          ) : (
            <input
              type="text"
              className="h-min bg-transparent border border-edge rounded px-2 py-1 text-sm text-ink! focus:outline-none focus:border-accent-ring w-full"
              value={tagValues[tag.name] ?? ""}
              onChange={(e) => onChangeTag(tag.name, e.target.value)}
            />
          )}
        </label>
      ))}
      <div />
      {choiceContext && (
        <div className="text-xs text-ghost flex flex-col gap-1.5 max-w-sm">
          {convertWhitespace(choiceContext)}
        </div>
      )}
    </div>
  );
}

function PurchaseInteractionPreview({
  action,
  existingId,
  removeId,
  copyCount,
  subtype,
  effectiveCostStr,
  boosterDescriptions,
  extraActions,
  onExecute,
  onRemove,
  onClose,
}: {
  action: PurchaseAction;
  existingId: Id<GID.Purchase> | undefined;
  /** ID of an existing copy to remove (for allowMultiple with copies already held). */
  removeId: Id<GID.Purchase> | undefined;
  copyCount: number;
  subtype: PurchaseSubtypeResolved | undefined;
  effectiveCostStr: string;
  boosterDescriptions: string[];
  extraActions?: {
    label: string;
    variant: "confirm";
    onConfirm: (name: string, description: string) => void;
  }[];
  onExecute: (name: string, description: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const tags = useMemo(
    () => extractTags([action.template.name, action.template.description]),
    [action.template.name, action.template.description],
  );
  const hasTags = tags.length > 0;

  const [tagValues, setTagValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(tags.map((t) => [t.name, ""])),
  );

  const resolvedName = hasTags ? applyTags(action.template.name, tagValues) : action.template.name;
  const baseDesc = hasTags
    ? applyTags(action.template.description, tagValues)
    : action.template.description;

  const resolvedDesc =
    boosterDescriptions.length > 0
      ? `${baseDesc}\n\n${boosterDescriptions.join("\n\n")}`
      : baseDesc;

  const errorMessage = !subtype
    ? `"${action.subtypeName}" subtype no longer exists in this jump.`
    : undefined;

  const execute = () => {
    onExecute(resolvedName, resolvedDesc);
    onClose();
  };

  const allActions: InteractionPreviewCardProps["actions"] = [
    {
      label: existingId !== undefined ? "Remove" : `Add (${effectiveCostStr})`,
      variant: existingId !== undefined ? "danger" : "confirm",
      onConfirm: execute,
    },
    ...(existingId === undefined && extraActions
      ? extraActions.map((ea) => ({
          label: ea.label,
          variant: ea.variant,
          onConfirm: () => {
            ea.onConfirm(resolvedName, resolvedDesc);
            onClose();
          },
        }))
      : []),
    ...(existingId === undefined && removeId !== undefined
      ? [{ label: "Remove a copy", variant: "danger" as const, onConfirm: onRemove }]
      : []),
  ];

  const copyInfo =
    copyCount > 0 && action.template.allowMultiple
      ? `${copyCount} ${copyCount === 1 ? "copy" : "copies"} already held`
      : undefined;

  return (
    <InteractionPreviewCard
      typeName={action.typeName}
      name={resolvedName}
      accentColor={existingId !== undefined ? "#ef4444" : "#22c55e"}
      costStr={existingId !== undefined ? undefined : effectiveCostStr}
      description={resolvedDesc || undefined}
      info={copyInfo}
      errorMessage={errorMessage}
      actions={allActions}
      onClose={onClose}
    >
      {!errorMessage && hasTags && (
        <TagFieldsSection
          tags={tags}
          tagValues={tagValues}
          choiceContext={action.template.choiceContext}
          onChangeTag={(name, value) => setTagValues((v) => ({ ...v, [name]: value }))}
        />
      )}
    </InteractionPreviewCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawback / Scenario preview (shared)
// ─────────────────────────────────────────────────────────────────────────────

type DocItemAction = Extract<ViewerAnnotationAction, { collection: "drawback" | "scenario" }>;
type CompanionAction = Extract<ViewerAnnotationAction, { collection: "companion" }>;

function DocItemInteractionPreview({
  action,
  existingId,
  removeId,
  copyCount,
  accentColor,
  effectiveCostStr,
  onExecute,
  onRemove,
  onClose,
}: {
  action: DocItemAction;
  existingId: Id<GID.Purchase> | undefined;
  removeId: Id<GID.Purchase> | undefined;
  copyCount: number;
  accentColor: string;
  effectiveCostStr?: string;
  onExecute: (name: string, description: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const tags = useMemo(
    () => extractTags([action.template.name, action.template.description]),
    [action.template.name, action.template.description],
  );
  const [tagValues, setTagValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(tags.map((t) => [t.name, ""])),
  );

  const resolvedName =
    tags.length > 0 ? applyTags(action.template.name, tagValues) : action.template.name;
  const resolvedDesc =
    tags.length > 0
      ? applyTags(action.template.description, tagValues)
      : action.template.description;

  const copyInfo =
    copyCount > 0 && existingId === undefined
      ? `${copyCount} cop${copyCount === 1 ? "y" : "ies"} already held`
      : undefined;

  const allActions: InteractionPreviewCardProps["actions"] = [
    {
      label: existingId !== undefined ? "Remove" : "Add",
      variant: existingId !== undefined ? "danger" : "confirm",
      onConfirm: () => onExecute(resolvedName, resolvedDesc),
    },
  ];
  if (existingId === undefined && removeId !== undefined) {
    allActions.push({ label: "Remove a copy", variant: "danger", onConfirm: onRemove });
  }

  return (
    <InteractionPreviewCard
      typeName={action.typeName}
      name={resolvedName}
      accentColor={existingId !== undefined ? "#ef4444" : accentColor}
      costStr={existingId !== undefined ? undefined : (effectiveCostStr ?? action.costStr)}
      description={resolvedDesc || undefined}
      info={copyInfo}
      actions={allActions}
      onClose={onClose}
    >
      {tags.length > 0 && (
        <TagFieldsSection
          tags={tags}
          tagValues={tagValues}
          choiceContext={action.template.choiceContext}
          onChangeTag={(name, value) => setTagValues((v) => ({ ...v, [name]: value }))}
        />
      )}
    </InteractionPreviewCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Companion preview component
// ─────────────────────────────────────────────────────────────────────────────

function CompanionCharField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <span className="text-xs text-muted shrink-0 w-14 text-right">{label}:</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 text-xs bg-tint border border-edge rounded px-1.5 py-0.5 text-ink focus:outline-none focus:border-accent"
        placeholder={label.toLowerCase()}
      />
    </>
  );
}

function CompanionInteractionPreview({
  action,
  selfCharId,
  jumpId,
  existingId,
  currencies,
  hasOriginDiscount,
  originBenefit,
  qualifyingMandatoryAltCost,
  qualifyingOptionalAltCosts,
  storedAltCosts,
  addFromTemplate,
  remove,
  navigateTo,
  onClose,
}: {
  action: CompanionAction;
  selfCharId: Id<GID.Character>;
  jumpId: Id<GID.Jump>;
  existingId: Id<GID.Purchase> | undefined;
  currencies: Registry<LID.Currency, Currency> | undefined;
  hasOriginDiscount: boolean;
  originBenefit: "discounted" | "free" | "access" | undefined;
  qualifyingMandatoryAltCost:
    | { value: { amount: number; currencyAbbrev: string }[]; beforeDiscounts?: boolean }
    | undefined;
  qualifyingOptionalAltCosts: ResolvedAltCost[];
  storedAltCosts: StoredAlternativeCost[];
  addFromTemplate: ReturnType<typeof useJumpDocCompanionActions>["addFromTemplate"];
  remove: ReturnType<typeof useJumpDocCompanionActions>["remove"];
  navigateTo: (follower: boolean) => (scrollTo?: string) => void;
  onClose: () => void;
}) {
  const allChars = useAllCharacters();
  const removeCharacter = useRemoveCharacter();
  const setPendingNewCompanion = useViewerActionStore((s) => s.setPendingNewCompanion);
  const [follower, setFollower] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Id<GID.Character>[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{
    charIdsToDelete: Id<GID.Character>[];
    message: string;
  } | null>(null);

  const defaultCharInfo = action.template.characterInfo?.[0];
  const [charName, setCharName] = useState(defaultCharInfo?.name ?? "");
  const [charSpecies, setCharSpecies] = useState(defaultCharInfo?.species ?? "");
  const [charGender, setCharGender] = useState(defaultCharInfo?.gender ?? "");

  const selectableChars = allChars.filter((c) => c.id !== selfCharId);
  const selectedChars = selectedIds
    .map((id) => selectableChars.find((c) => c.id === id))
    .filter((c): c is { id: Id<GID.Character>; name: string } => c !== undefined);
  const availableChars = selectableChars.filter((c) => !selectedIds.includes(c.id));

  const max = action.template.count;

  // For "discounted"/"free" benefit the first copy gets the discount; companions don't allow
  // multiples so isFirstCopy is always true.
  const effectiveCostStr = (() => {
    if (qualifyingMandatoryAltCost?.beforeDiscounts && hasOriginDiscount) {
      return `${originDiscountCostStr(qualifyingMandatoryAltCost.value, currencies, originBenefit, true)} ; altered`;
    }
    if (qualifyingMandatoryAltCost?.beforeDiscounts) {
      return `${altCostValueStr(qualifyingMandatoryAltCost.value)} ; altered`;
    }
    if (hasOriginDiscount) {
      const originMod = originDiscountModifier(action.cost, currencies, originBenefit, true);
      if (originMod.modifier === CostModifier.Free) {
        return originDiscountCostStr(action.cost, currencies, originBenefit, true);
      }
      if (qualifyingMandatoryAltCost) {
        return `${altCostValueStr(qualifyingMandatoryAltCost.value)} ; altered`;
      }
      return originDiscountCostStr(action.cost, currencies, originBenefit, true);
    }
    if (qualifyingMandatoryAltCost) {
      return `${altCostValueStr(qualifyingMandatoryAltCost.value)} ; altered`;
    }
    return action.costStr;
  })();

  const computeInitialCost = (): ModifiedCost | undefined => {
    if (qualifyingMandatoryAltCost?.beforeDiscounts) {
      const altResolved: Value = qualifyingMandatoryAltCost.value.map(
        ({ amount, currencyAbbrev }) => ({
          amount,
          currency: resolveJumpCurrency(currencyAbbrev, currencies),
        }),
      );
      if (hasOriginDiscount) {
        const altMod = originDiscountModifier(
          qualifyingMandatoryAltCost.value,
          currencies,
          originBenefit,
          true,
        );
        if (altMod.modifier === CostModifier.Free) return { modifier: CostModifier.Free };
        return {
          modifier: CostModifier.Custom,
          modifiedTo: altResolved.map((v) => ({
            amount: Math.floor(v.amount / 2),
            currency: v.currency,
          })),
        };
      }
      return { modifier: CostModifier.Custom, modifiedTo: altResolved };
    }
    if (hasOriginDiscount) {
      const originMod = originDiscountModifier(action.cost, currencies, originBenefit, true);
      if (originMod.modifier === CostModifier.Free) return originMod;
      if (qualifyingMandatoryAltCost) {
        const resolvedValue: Value = qualifyingMandatoryAltCost.value.map(
          ({ amount, currencyAbbrev }) => ({
            amount,
            currency: resolveJumpCurrency(currencyAbbrev, currencies),
          }),
        );
        return { modifier: CostModifier.Custom, modifiedTo: resolvedValue };
      }
      return originMod;
    }
    if (qualifyingMandatoryAltCost) {
      const resolvedValue: Value = qualifyingMandatoryAltCost.value.map(
        ({ amount, currencyAbbrev }) => ({
          amount,
          currency: resolveJumpCurrency(currencyAbbrev, currencies),
        }),
      );
      return { modifier: CostModifier.Custom, modifiedTo: resolvedValue };
    }
    return undefined;
  };

  const doRemove = (follower: boolean) => {
    if (existingId === undefined) return;
    // For specific-character imports, check if the linked character(s) have activity
    // before deleting them. Non-specific imports never auto-delete companion characters.
    if (action.template.specificCharacter) {
      const state = useChainStore.getState();
      const chain = state.chain;
      const jumpAccess = state.calculatedData.jumpAccess;
      const purchase = chain?.purchases.O[existingId];
      if (purchase?.type === PurchaseType.Companion) {
        const ci = purchase as CompanionImport;
        const linkedChars = ci.importData.characters.filter(
          (cid) => chain?.characters.O[cid]?.originalImportTID !== undefined,
        );
        if (linkedChars.length > 0) {
          const jump = chain?.jumps.O[jumpId];
          const isActive = (cid: Id<GID.Character>): boolean => {
            const access = jumpAccess?.[cid];
            if (access && [...access].some((jid) => jid !== (jumpId as number))) return true;
            if ((jump?.purchases[cid]?.length ?? 0) > 0) return true;
            if ((jump?.drawbacks[cid]?.length ?? 0) > 0) return true;
            return false;
          };
          const activeChars = linkedChars
            .map((cid) => ({ id: cid, name: chain?.characters.O[cid]?.name ?? "" }))
            .filter(({ id }) => isActive(id));
          if (activeChars.length > 0) {
            const names = activeChars.map((c) => c.name).join(", ");
            setConfirmDelete({
              charIdsToDelete: linkedChars,
              message: `This will also delete: ${names}. They have activity elsewhere. Are you sure?`,
            });
            return;
          }
          // No active characters — silently delete all linked chars.
          for (const cid of linkedChars) removeCharacter(cid);
        }
      }
    }
    remove(existingId);
    navigateTo(follower)();
    onClose();
  };

  const confirmAndRemove = (follower: boolean) => {
    if (!confirmDelete || existingId === undefined) return;
    for (const cid of confirmDelete.charIdsToDelete) removeCharacter(cid);
    remove(existingId);
    navigateTo(follower)();
    onClose();
  };

  const doExecute =
    (isFollower: boolean, overrideInitialCost?: ModifiedCost, isOptionalAltCost?: boolean) =>
    () => {
      if (existingId !== undefined) {
        doRemove(isFollower);
        return;
      } else {
        const value: Value = action.cost.map(({ amount, currencyAbbrev }) => ({
          amount,
          currency: resolveJumpCurrency(currencyAbbrev, currencies),
        }));
        const newId = addFromTemplate({
          name: action.template.name,
          description: action.template.description,
          value,
          templateId: action.docTemplateId,
          docId: action.docId,
          companionIds: selectedIds,
          allowances: action.allowances,
          stipend: action.stipend,
          initialCost: overrideInitialCost ?? computeInitialCost(),
          discountOrigins: action.originNames.length > 0 ? action.originNames : undefined,
          originBenefit,
          alternativeCosts: storedAltCosts.length ? storedAltCosts : undefined,
          optionalAltCost: isOptionalAltCost || undefined,
          follower: isFollower,
          createCharacterData:
            !isFollower && action.template.specificCharacter
              ? {
                  name: charName,
                  gender: charGender,
                  species: charSpecies,
                  backgroundSummary: action.template.name,
                  backgroundDescription: action.template.description,
                }
              : undefined,
        });
        // For non-follower companion imports: enqueue any freebies from the template.
        if (!isFollower) {
          const doc = useJumpDocStore.getState().doc;
          const freebies = action.template.freebies;
          if (doc && freebies?.length) {
            const companionImport = useChainStore.getState().chain?.purchases.O[newId] as
              | CompanionImport
              | undefined;
            const companionCharIds = companionImport?.importData.characters ?? [];
            if (companionCharIds.length > 0) {
              const batches = buildFreebieActions(freebies, doc, action.docId, companionCharIds);
              if (batches.length > 0) useViewerActionStore.getState().enqueueActions(batches);
            }
          }
        }
        navigateTo(isFollower)(String(newId));
      }
      onClose();
    };

  const isSpecific = action.template.specificCharacter;

  const optionalAltCostActions: InteractionPreviewCardProps["actions"] =
    existingId === undefined
      ? qualifyingOptionalAltCosts.map((ac) => ({
          label: `Add (${altCostValueStr(ac.value)})`,
          variant: "confirm" as const,
          onConfirm: () => {
            const resolvedValue: Value = ac.value.map(({ amount, currencyAbbrev }) => ({
              amount,
              currency: resolveJumpCurrency(currencyAbbrev, currencies),
            }));
            doExecute(
              follower,
              { modifier: CostModifier.Custom, modifiedTo: resolvedValue },
              true,
            )();
          },
        }))
      : [];

  let actions: InteractionPreviewCardProps["actions"];
  if (confirmDelete) {
    actions = [
      { label: "Confirm Delete", variant: "danger", onConfirm: () => confirmAndRemove(follower) },
      {
        label: "Cancel",
        variant: "warn",
        noAutoClose: true,
        onConfirm: () => setConfirmDelete(null),
      },
    ];
  } else if (existingId !== undefined) {
    actions = [
      { label: "Remove", variant: "danger", noAutoClose: true, onConfirm: () => doRemove(false) },
    ];
  } else if (isSpecific) {
    actions = [
      {
        label: `Add (${effectiveCostStr})`,
        variant: "confirm",
        onConfirm: doExecute(follower),
      },
      ...optionalAltCostActions,
    ];
  } else {
    actions = [
      {
        label: `Add (${effectiveCostStr})`,
        variant: selectedChars.length === 0 ? "warn" : "confirm",
        blocker:
          selectedChars.length === 0
            ? "You must select or create at least one character in order to add them as a companion."
            : undefined,
        onConfirm: doExecute(follower),
      },
      ...optionalAltCostActions,
    ];
  }

  return (
    <>
      <InteractionPreviewCard
        typeName={action.typeName}
        name={action.template.name}
        accentColor={existingId !== undefined ? "#ef4444" : "#f59e0b"}
        costStr={existingId !== undefined ? undefined : effectiveCostStr}
        description={
          confirmDelete ? confirmDelete.message : action.template.description || undefined
        }
        errorMessage={undefined}
        actions={actions}
        onClose={onClose}
      >
        {!confirmDelete && existingId === undefined && (
          <div className="px-2 pb-1">
            <SegmentedControl
              value={follower ? "follower" : "companion"}
              onChange={(v) => setFollower(v === "follower")}
              options={[
                { value: "companion", label: "Companion" },
                { value: "follower", label: "Follower" },
              ]}
            />
          </div>
        )}
        {!confirmDelete && existingId === undefined && isSpecific && !follower && (
          <div className="px-2 pb-2 grid grid-cols-[auto_1fr] gap-1.5 self-center items-center">
            <CompanionCharField label="Name" value={charName} onChange={setCharName} />
            <CompanionCharField label="Species" value={charSpecies} onChange={setCharSpecies} />
            <CompanionCharField label="Gender" value={charGender} onChange={setCharGender} />
          </div>
        )}
        {!confirmDelete && existingId === undefined && !isSpecific && !follower && (
          <div className="px-2 pb-2 flex flex-col gap-1.5">
            <span className="text-xs text-muted font-medium">
              Chosen Companions ({selectedIds.length} of {max}):
            </span>
            <CompanionMultiSelect
              selected={selectedChars}
              available={availableChars}
              onAdd={(id) => setSelectedIds((prev) => [...prev, id])}
              onRemove={(id) => setSelectedIds((prev) => prev.filter((cid) => cid !== id))}
              onNew={() => {
                setPendingNewCompanion({
                  onDone: (newId) => {
                    setSelectedIds((prev) => [...prev, newId]);
                  },
                  onCancel: () => {},
                });
              }}
              max={max}
            />
          </div>
        )}
      </InteractionPreviewCard>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Alternative cost helpers — see annotationResolvers.ts
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Origin preview component
// ─────────────────────────────────────────────────────────────────────────────

type OriginAction = Extract<ViewerAnnotationAction, { collection: "origin" }>;

/** Minimal action shape required by OriginInteractionPreview — satisfied by both OriginAction and rolled randomizer templates. */
type OriginPreviewAction = {
  typeName: string;
  costStr: string;
  template: { name: string; description?: string; choiceContext?: string };
};

function OriginInteractionPreview({
  action,
  alreadyPresent,
  accentColor,
  evictedName,
  synergyLabel,
  effectiveCostStr,
  categoryDeleted,
  onExecute,
  onReroll,
  onClose,
}: {
  action: OriginPreviewAction;
  alreadyPresent: boolean;
  accentColor: string;
  evictedName: string | null;
  synergyLabel: string | undefined;
  effectiveCostStr: string | undefined;
  categoryDeleted: boolean;
  onExecute: (name: string, description: string) => void;
  onReroll?: () => void;
  onClose: () => void;
}) {
  const tags = useMemo(
    () => extractTags([action.template.name, action.template.description ?? ""]),
    [action.template.name, action.template.description],
  );
  const [tagValues, setTagValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(tags.map((t) => [t.name, ""])),
  );
  const resolvedName =
    tags.length > 0 ? applyTags(action.template.name, tagValues) : action.template.name;
  const resolvedDesc =
    tags.length > 0
      ? applyTags(action.template.description ?? "", tagValues)
      : (action.template.description ?? "");

  return (
    <InteractionPreviewCard
      typeName={action.typeName}
      name={resolvedName}
      description={resolvedDesc || undefined}
      accentColor={accentColor}
      costStr={alreadyPresent ? undefined : effectiveCostStr}
      warning={evictedName ?? synergyLabel ?? undefined}
      errorMessage={
        categoryDeleted ? `"${action.typeName}" no longer exists in this jump.` : undefined
      }
      actions={[
        {
          label: alreadyPresent ? `Remove ${action.typeName}` : `Use ${action.typeName}`,
          variant: alreadyPresent ? "danger" : evictedName ? "warn" : "confirm",
          onConfirm: () => {
            onExecute(resolvedName, resolvedDesc);
            onClose();
          },
        },
        // ...(onReroll
        //   ? [{ label: "Reroll", variant: "warn" as const, noAutoClose: true, onConfirm: onReroll }]
        //   : []),
      ]}
      onClose={onClose}
    >
      {!categoryDeleted && tags.length > 0 && (
        <TagFieldsSection
          tags={tags}
          tagValues={tagValues}
          choiceContext={action.template.choiceContext}
          onChangeTag={(name, value) => setTagValues((v) => ({ ...v, [name]: value }))}
        />
      )}
    </InteractionPreviewCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Interaction builders
// ─────────────────────────────────────────────────────────────────────────────

function buildOriginInteraction(
  action: Extract<ViewerAnnotationAction, { collection: "origin" }>,
  origins: Record<number, Origin[]> | null,
  originCategories: Registry<LID.OriginCategory, OriginCategory> | undefined,
  currencies: Registry<LID.Currency, Currency> | undefined,
  purchaseSubtypes: Registry<LID.PurchaseSubtype, PurchaseSubtype> | undefined,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  setOrigins: ReturnType<typeof useJumpOrigins>["setOrigins"],
  getModifiersUpdater: ReturnType<typeof useJumpDocPurchaseActions>["getModifiersUpdater"],
  navigate: ReturnType<typeof useNavigate>,
  routeParams: RouteParams,
  forceRemove: boolean,
): AnnotationInteraction | null {
  const categoryLid = resolveJumpOriginCategory(action.typeName, originCategories);
  const categoryDeleted = categoryLid === undefined;
  const chainCategory = categoryLid !== undefined ? originCategories?.O[categoryLid] : undefined;
  const currentList: Origin[] = categoryLid !== undefined ? (origins?.[categoryLid] ?? []) : [];
  const alreadyPresent = currentList.some(
    (o) => o.summary === action.name || o.templateName === action.name,
  );
  if (forceRemove && !alreadyPresent) return null;
  const { evictedIdx, evictedName } = resolveEviction(
    currentList,
    alreadyPresent,
    chainCategory,
    action.docCategoryMax,
  );

  // Always pass modifiers updater when synergies or discounts are involved.
  const hasModifiers =
    action.discountedPurchaseTemplateIds.length > 0 || action.synergyOriginNames.length > 0;
  const discountUpdate = hasModifiers ? getModifiersUpdater(action.docId) : undefined;

  // Synergy: check if any synergy origin is held.
  const hasSynergy =
    action.synergyOriginNames.length > 0 &&
    action.synergyOriginNames.some(({ categoryName, originName }) => {
      const catLid = resolveJumpOriginCategory(categoryName, originCategories);
      if (!catLid) return false;
      return (origins?.[catLid] ?? []).some(
        (o) => o.summary === originName || o.templateName === originName,
      );
    });

  // Access-restricted origin: block add when synergy origin not held.
  if (action.synergyBenefit === "access" && !hasSynergy && !alreadyPresent && !forceRemove) {
    const originList = action.synergyOriginNames.map((o) => o.originName).join(", ");
    const Preview: AnnotationInteraction["Preview"] = ({ onClose }) => (
      <InteractionPreviewCard
        typeName={action.typeName}
        name={action.name}
        accentColor="#22c55e"
        costStr={action.costStr}
        description={action.template.description}
        errorMessage={`This origin is restricted to holders of: ${originList}.`}
        actions={[]}
        onClose={onClose}
      />
    );
    return {
      name: action.name,
      typeName: action.typeName,
      color: "#22c55e",
      forcePreview: true,
      executeDefault: () => {},
      Preview,
    };
  }

  // Effective cost string when synergy applies.
  const effectiveCostStr = (() => {
    if (alreadyPresent) return undefined;
    if (hasSynergy && action.synergyBenefit === "free") return "free";
    if (hasSynergy && action.synergyBenefit === "discounted") {
      const threshold = Object.values(currencies?.O ?? {}).find(
        (c) => c?.abbrev === action.docCurrencyAbbrev,
      )?.discountFreeThreshold;
      if (threshold != null && action.template.cost.amount <= threshold) return "free; discounted";
      const halfCost = action.costStr.replace(/(\d+)/g, (m) => String(Math.floor(Number(m) / 2)));
      return `${halfCost}; discounted`;
    }
    return action.costStr;
  })();

  const tags = extractTags([action.template.name, action.template.description ?? ""]);

  const execute = (name: string, description: string) => {
    if (categoryLid === undefined) return;
    if (alreadyPresent) {
      setOrigins(
        (d) => {
          const rec = d as Record<number, Origin[]>;
          const list = rec[categoryLid];
          if (!list) return;
          const idx = list.findIndex(
            (o) => o.summary === action.name || o.templateName === action.name,
          );
          if (idx !== -1) list.splice(idx, 1);
          if (list.length === 0) delete rec[categoryLid];
        },
        (c) => {
          removeOriginStipendDrawbacks(action.name, jumpId, charId)(c);
          discountUpdate?.(c);
        },
      );
    } else {
      const stipendMutation = (c: Chain) => {
        if (evictedName) removeOriginStipendDrawbacks(evictedName, jumpId, charId)(c);
        if (action.resolvedOriginStipend.length)
          createOriginStipendDrawbacks(
            name,
            action.resolvedOriginStipend,
            currencies,
            purchaseSubtypes,
            jumpId,
            charId,
          )(c);
        discountUpdate?.(c);
      };
      commitAddOrigin(
        categoryLid,
        evictedIdx,
        {
          name,
          templateName: action.template.name !== name ? action.template.name : undefined,
          description,
          synergyOrigins: action.synergyOriginNames.length ? action.synergyOriginNames : undefined,
          synergyBenefit: action.synergyBenefit,
        },
        action.template.cost.amount,
        action.docCurrencyAbbrev,
        currencies,
        setOrigins,
        stipendMutation,
      );
    }
    navigate({ to: "/chain/$chainId/char/$charId/jump/$jumpId", params: routeParams });
  };

  const accentColor = alreadyPresent ? "#ef4444" : evictedName ? "#f59e0b" : "#22c55e";

  const synergyLabel =
    !alreadyPresent && hasSynergy && action.synergyBenefit !== "access"
      ? `Synergy: ${action.synergyOriginNames.map((o) => o.originName).join(", ")}`
      : undefined;

  const Preview: AnnotationInteraction["Preview"] = ({ onClose }) => (
    <OriginInteractionPreview
      action={action}
      alreadyPresent={alreadyPresent}
      accentColor={accentColor}
      evictedName={evictedName}
      synergyLabel={synergyLabel}
      effectiveCostStr={effectiveCostStr}
      categoryDeleted={categoryDeleted}
      onExecute={execute}
      onClose={onClose}
    />
  );

  return {
    name: action.name,
    typeName: action.typeName,
    color: "#22c55e",
    forcePreview:
      categoryDeleted ||
      (!alreadyPresent && (action.synergyOriginNames.length > 0 || tags.length > 0)),
    executeDefault: () => execute(action.template.name, action.template.description ?? ""),
    Preview,
  };
}

function buildOriginRandomizerInteraction(
  action: Extract<ViewerAnnotationAction, { collection: "origin-randomizer" }>,
  origins: Record<number, Origin[]> | null,
  originCategories: Registry<LID.OriginCategory, OriginCategory> | undefined,
  currencies: Registry<LID.Currency, Currency> | undefined,
  purchaseSubtypes: Registry<LID.PurchaseSubtype, PurchaseSubtype> | undefined,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  setOrigins: ReturnType<typeof useJumpOrigins>["setOrigins"],
  navigate: ReturnType<typeof useNavigate>,
  routeParams: RouteParams,
  forceRemove: boolean,
): AnnotationInteraction | null {
  if (forceRemove) return null; // randomizer has nothing to remove
  const categoryLid = resolveJumpOriginCategory(action.categoryName, originCategories);
  const categoryDeleted = categoryLid === undefined;
  const chainCategory = categoryLid !== undefined ? originCategories?.O[categoryLid] : undefined;
  const currentList: Origin[] = categoryLid !== undefined ? (origins?.[categoryLid] ?? []) : [];
  // Randomizer always adds, so alreadyPresent=false for eviction purposes.
  const { evictedIdx, evictedName } = resolveEviction(
    currentList,
    false,
    chainCategory,
    action.docCategoryMax,
  );

  const buildStipendMutation =
    (template: (typeof action.templates)[number], resolvedName: string) => (c: Chain) => {
      if (evictedName) removeOriginStipendDrawbacks(evictedName, jumpId, charId)(c);
      if (template.resolvedOriginStipend.length)
        createOriginStipendDrawbacks(
          resolvedName,
          template.resolvedOriginStipend,
          currencies,
          purchaseSubtypes,
          jumpId,
          charId,
        )(c);
    };

  const execute = () => {
    if (categoryLid === undefined) return;
    const available = action.templates.filter(
      (t) => !currentList.some((o) => o.summary === t.name),
    );
    if (available.length === 0) return;
    const template = available[Math.floor(Math.random() * available.length)]!;
    const resolvedName = resolveOriginTemplate(template.name);
    commitAddOrigin(
      categoryLid,
      evictedIdx,
      { ...template, name: resolvedName },
      action.cost.amount,
      action.docCurrencyAbbrev,
      currencies,
      setOrigins,
      buildStipendMutation(template, resolvedName),
    );
    navigate({ to: "/chain/$chainId/char/$charId/jump/$jumpId", params: routeParams });
  };

  const Preview: AnnotationInteraction["Preview"] = ({ onClose }) => {
    const [rolled, setRolled] = React.useState<{
      template: (typeof action.templates)[number];
      resolvedName: string;
      rollKey: number;
    } | null>(null);

    const roll = () => {
      if (categoryLid === undefined) return;
      const available = action.templates.filter(
        (t) => !currentList.some((o) => o.summary === t.name),
      );
      if (available.length === 0) return;
      const template = available[Math.floor(Math.random() * available.length)]!;
      const resolvedName = resolveOriginTemplate(template.name);
      if (parseTemplatePlaceholders(template.name).placeholders.length > 0) {
        setRolled((prev) => ({ template, resolvedName, rollKey: (prev?.rollKey ?? 0) + 1 }));
      } else {
        commitAddOrigin(
          categoryLid,
          evictedIdx,
          { ...template, name: resolvedName },
          action.cost.amount,
          action.docCurrencyAbbrev,
          currencies,
          setOrigins,
          buildStipendMutation(template, resolvedName),
        );
        navigate({ to: "/chain/$chainId/char/$charId/jump/$jumpId", params: routeParams });
        onClose();
      }
    };

    if (rolled) {
      return (
        <OriginInteractionPreview
          key={rolled.rollKey}
          action={{ typeName: action.typeName, costStr: action.costStr, template: rolled.template }}
          alreadyPresent={false}
          accentColor={evictedName ? "#f59e0b" : "#22c55e"}
          evictedName={evictedName}
          synergyLabel={undefined}
          effectiveCostStr={action.costStr}
          categoryDeleted={categoryDeleted}
          onExecute={(name, desc) => {
            if (categoryLid === undefined) return;
            commitAddOrigin(
              categoryLid,
              evictedIdx,
              { ...rolled.template, name, description: desc || rolled.template.description },
              action.cost.amount,
              action.docCurrencyAbbrev,
              currencies,
              setOrigins,
              buildStipendMutation(rolled.template, name),
            );
            navigate({ to: "/chain/$chainId/char/$charId/jump/$jumpId", params: routeParams });
          }}
          onReroll={roll}
          onClose={onClose}
        />
      );
    }

    return (
      <InteractionPreviewCard
        typeName={action.typeName}
        name={action.name}
        accentColor={evictedName ? "#f59e0b" : "#22c55e"}
        costStr={action.costStr}
        warning={evictedName ?? undefined}
        errorMessage={
          categoryDeleted ? `"${action.typeName}" no longer exists in this jump.` : undefined
        }
        actions={[
          {
            label: "Randomize",
            variant: "confirm",
            noAutoClose: true,
            onConfirm: roll,
          },
        ]}
        onClose={onClose}
      />
    );
  };

  return {
    name: action.name,
    typeName: action.typeName,
    color: "#22c55e",
    forcePreview: true,
    executeDefault: execute,
    Preview,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Template randomness explainer — see annotationResolvers.ts
// ─────────────────────────────────────────────────────────────────────────────

function buildOriginOptionInteraction(
  action: Extract<ViewerAnnotationAction, { collection: "origin-option" }>,
  origins: Record<number, Origin[]> | null,
  originCategories: Registry<LID.OriginCategory, OriginCategory> | undefined,
  currencies: Registry<LID.Currency, Currency> | undefined,
  setOrigins: ReturnType<typeof useJumpOrigins>["setOrigins"],
  navigate: ReturnType<typeof useNavigate>,
  routeParams: RouteParams,
  forceRemove: boolean,
): AnnotationInteraction | null {
  const categoryLid = resolveJumpOriginCategory(action.typeName, originCategories);
  const categoryDeleted = categoryLid === undefined;
  const chainCategory = categoryLid !== undefined ? originCategories?.O[categoryLid] : undefined;
  const currentList: Origin[] = categoryLid !== undefined ? (origins?.[categoryLid] ?? []) : [];
  if (forceRemove) return null;
  const isFreeform = action.option.type === "freeform";
  const { evictedIdx, evictedName } = resolveEviction(
    currentList,
    false,
    chainCategory,
    undefined, // origin-options carry no docCategoryMax
  );

  const execute = (summaryOverride?: string) => {
    if (categoryLid === undefined) return;
    const resolved =
      action.option.type === "template"
        ? resolveOriginTemplate(action.option.name)
        : action.option.name;
    commitAddOrigin(
      categoryLid,
      evictedIdx,
      { name: summaryOverride ?? resolved },
      action.option.cost.amount,
      action.docCurrencyAbbrev,
      currencies,
      setOrigins,
    );
    navigate({ to: "/chain/$chainId/char/$charId/jump/$jumpId", params: routeParams });
  };

  const accentColor = evictedName ? "#f59e0b" : "#22c55e";
  const isRandomized = !isFreeform && /\$\{[^}]+\}/.test(action.option.name);
  const templateInfo = !isFreeform ? originTemplateInfo(action.option.name) : null;

  const Preview: AnnotationInteraction["Preview"] = ({ onClose }) => {
    const [freeformText, setFreeformText] = React.useState(currentList[0]?.summary ?? "");
    const doExecute = () => {
      execute(isFreeform ? freeformText || undefined : undefined);
      onClose();
    };
    return (
      <InteractionPreviewCard
        typeName={action.typeName}
        name={""}
        accentColor={accentColor}
        costStr={action.costStr}
        warning={evictedName ?? undefined}
        errorMessage={
          categoryDeleted ? `"${action.typeName}" no longer exists in this jump.` : undefined
        }
        actions={[
          {
            label: "Update",
            variant: "confirm",
            onConfirm: doExecute,
          },
        ]}
        onClose={onClose}
      >
        {isFreeform && (
          <div className="px-2 pb-2">
            <input
              type="text"
              className="bg-transparent border border-edge rounded px-2 py-1 text-sm text-ink! focus:outline-none focus:border-accent-ring w-full"
              placeholder="Enter value…"
              value={freeformText}
              onChange={(e) => setFreeformText(e.target.value)}
            />
          </div>
        )}
        {templateInfo && (templateInfo.aux || isRandomized) && (
          <div className="px-2 pb-2 flex flex-col gap-1">
            <p className="text-xs text-ghost">{templateInfo.main}</p>
            {templateInfo.aux?.map((s, i) => (
              <p key={i} className="text-xs text-ghost">
                {s}
              </p>
            ))}
          </div>
        )}
      </InteractionPreviewCard>
    );
  };

  return {
    name: isFreeform
      ? `Manually Set ${action.typeName}`
      : isRandomized
        ? `Randomize ${action.typeName}`
        : `Set ${action.typeName} to "${action.name}"`,
    typeName: action.typeName,
    color: "#22c55e",
    isOriginOption: true,
    forcePreview: categoryDeleted || isFreeform || isRandomized,
    executeDefault: () => execute(),
    Preview,
  };
}

type OriginOptionData = {
  categoryName: string;
  isFreeform: boolean;
  evictedName: string | null | undefined;
  /** Current freeform value in the jump for this category; null for non-freeform options. */
  currentFreeformValue: string | null;
  accentColor: string;
  displayName: string;
  /** Raw template name (with ${...} placeholders) for non-freeform options; null for freeform. */
  rawName: string | null;
  costStr: string | undefined;
  execute: (summaryOverride?: string) => void;
};

type OriginOptionGroup = { categoryName: string; options: OriginOptionData[] };

/** Selection state for a set of option groups: per-category selected index + freeform text. */
type GroupSelectionState = Record<string, { idx: number; freeform: string }>;

function initGroupState(groups: OriginOptionGroup[]): GroupSelectionState {
  return Object.fromEntries(
    groups.map((g) => {
      const freeformOpt = g.options.find((o) => o.isFreeform);
      const currentValue = freeformOpt?.currentFreeformValue ?? "";
      return [g.categoryName, { idx: 0, freeform: currentValue }];
    }),
  );
}

function executeGroupSelections(groups: OriginOptionGroup[], state: GroupSelectionState) {
  for (const g of groups) {
    const { idx, freeform } = state[g.categoryName] ?? { idx: 0, freeform: "" };
    const opt = g.options[idx];
    if (opt) opt.execute(opt.isFreeform ? freeform || undefined : undefined);
  }
}

/** Resolves per-action option data for any list of origin-option actions (mixed categories OK). */
function buildOriginOptionDataArray(
  optionActions: Array<Extract<ViewerAnnotationAction, { collection: "origin-option" }>>,
  origins: Record<number, Origin[]> | null,
  originCategories: Registry<LID.OriginCategory, OriginCategory> | undefined,
  currencies: Registry<LID.Currency, Currency> | undefined,
  setOrigins: ReturnType<typeof useJumpOrigins>["setOrigins"],
  navigate: ReturnType<typeof useNavigate> | null,
  routeParams: RouteParams | null,
  forceRemove: boolean,
): OriginOptionData[] {
  return optionActions.flatMap((action) => {
    const categoryLid = resolveJumpOriginCategory(action.typeName, originCategories);
    if (categoryLid === undefined) return []; // category deleted — skip silently
    const chainCategory = originCategories?.O[categoryLid];
    const currentList: Origin[] = origins?.[categoryLid] ?? [];
    const isFreeform = action.option.type === "freeform";
    const { evictedIdx, evictedName } = resolveEviction(
      currentList,
      false,
      chainCategory,
      undefined,
    );

    const execute = (summaryOverride?: string) => {
      if (forceRemove) {
        // Clear the entire category regardless of which option was selected.
        setOrigins((d) => {
          delete (d as Record<number, Origin[]>)[categoryLid];
        });
      } else {
        const resolved =
          action.option.type === "template"
            ? resolveOriginTemplate(action.option.name)
            : action.option.name;
        commitAddOrigin(
          categoryLid,
          evictedIdx,
          { name: summaryOverride ?? resolved },
          action.option.cost.amount,
          action.docCurrencyAbbrev,
          currencies,
          setOrigins,
        );
      }
      if (navigate && routeParams)
        navigate({ to: "/chain/$chainId/char/$charId/jump/$jumpId", params: routeParams });
    };

    return [
      {
        categoryName: action.typeName,
        isFreeform,
        evictedName,
        currentFreeformValue: isFreeform ? (currentList[0]?.summary ?? null) : null,
        accentColor: evictedName ? "#f59e0b" : "#22c55e",
        displayName: isFreeform
          ? `Manually set ${action.typeName}`
          : stripTemplating(action.option.name),
        rawName: isFreeform ? null : action.option.name,
        costStr: action.costStr,
        execute,
      },
    ];
  });
}

/** Groups a flat OriginOptionData array into per-category groups, preserving encounter order. */
function groupOptionData(options: OriginOptionData[]): OriginOptionGroup[] {
  const map = new Map<string, OriginOptionGroup>();
  for (const opt of options) {
    const g = map.get(opt.categoryName);
    if (g) g.options.push(opt);
    else map.set(opt.categoryName, { categoryName: opt.categoryName, options: [opt] });
  }
  return [...map.values()];
}

/** One labelled category group: a heading + selectable option buttons + optional freeform input. */
function OriginOptionSelector({
  group,
  selectedIdx,
  freeformText,
  onSelect,
  onFreeformChange,
}: {
  group: OriginOptionGroup;
  selectedIdx: number;
  freeformText: string;
  onSelect: (i: number) => void;
  onFreeformChange: (v: string) => void;
}) {
  const selectedOpt = group.options[selectedIdx];
  const onlyFreeform = group.options.length === 1 && group.options[0]!.isFreeform;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-ghost font-medium uppercase tracking-wide">{group.categoryName}</p>
      {onlyFreeform ? (
        <input
          type="text"
          className="bg-transparent border border-edge rounded px-2 py-1 text-sm text-ink! focus:outline-none focus:border-accent-ring w-full"
          placeholder="Enter value…"
          value={freeformText}
          onChange={(e) => onFreeformChange(e.target.value)}
        />
      ) : (
        group.options.map((opt, i) => {
          let { main, aux } = originTemplateInfo(opt.rawName ?? "");

          return (
            <>
              <button
                key={i}
                type="button"
                onClick={() => onSelect(i)}
                className={`text-left px-3 py-2 rounded border transition-colors ${
                  i === selectedIdx
                    ? "border-accent2-ring bg-accent2-tint text-ink"
                    : "border-edge text-muted hover:border-trim hover:text-ink"
                }`}
              >
                <span className="text-sm font-medium">
                  {opt?.isFreeform ? opt.displayName : main}
                </span>
                {opt.costStr && <span className="text-xs text-ghost ml-2">[{opt.costStr}]</span>}
                {aux && aux.length && (
                  <div className="text-xs text-ghost flex flex-col gap-0.5">
                    {aux.map((s) => (
                      <p>{s}</p>
                    ))}
                  </div>
                )}
              </button>
              {selectedOpt?.isFreeform && selectedIdx == i && (
                <input
                  type="text"
                  className="bg-transparent border border-edge rounded px-2 py-1 text-sm text-ink! focus:outline-none focus:border-accent-ring w-full"
                  placeholder="Enter value…"
                  value={freeformText}
                  onChange={(e) => onFreeformChange(e.target.value)}
                />
              )}
            </>
          );
        })
      )}
    </div>
  );
}

/** Renders all option groups with their current selection state. */
function OriginOptionGroups({
  groups,
  state,
  onChange,
}: {
  groups: OriginOptionGroup[];
  state: GroupSelectionState;
  onChange: (categoryName: string, idx: number, freeform: string) => void;
}) {
  return (
    <div className={`flex flex-col ${groups.length > 1 ? "gap-3" : "gap-1"}`}>
      {groups.map((g) => {
        const { idx, freeform } = state[g.categoryName] ?? { idx: 0, freeform: "" };
        return (
          <OriginOptionSelector
            key={g.categoryName}
            group={g}
            selectedIdx={idx}
            freeformText={freeform}
            onSelect={(i) => onChange(g.categoryName, i, "")}
            onFreeformChange={(v) => onChange(g.categoryName, idx, v)}
          />
        );
      })}
    </div>
  );
}

/**
 * Pools multiple origin-option actions (mixed categories OK) into a single preview card.
 * Options are shown as independent groups per category, each with a mandatory default selection.
 * forcePreview is true only when at least one category has ≥2 options (a real choice exists).
 */
function buildPooledOriginOptionInteraction(
  actions: Array<Extract<ViewerAnnotationAction, { collection: "origin-option" }>>,
  origins: Record<number, Origin[]> | null,
  originCategories: Registry<LID.OriginCategory, OriginCategory> | undefined,
  currencies: Registry<LID.Currency, Currency> | undefined,
  setOrigins: ReturnType<typeof useJumpOrigins>["setOrigins"],
  navigate: ReturnType<typeof useNavigate>,
  routeParams: RouteParams,
  forceRemove: boolean,
): AnnotationInteraction | null {
  if (actions.length === 0) return null;

  const allOptions = buildOriginOptionDataArray(
    actions,
    origins,
    originCategories,
    currencies,
    setOrigins,
    navigate,
    routeParams,
    forceRemove,
  );
  if (allOptions.length === 0) return null;

  const groups = groupOptionData(allOptions);
  const needsChoice = groups.some((g) => g.options.length >= 2);
  const hasFreeform = allOptions.some((o) => o.isFreeform);
  const cardTypeName = groups.length === 1 ? groups[0]!.categoryName : "Origin Options";

  const Preview: AnnotationInteraction["Preview"] = ({ onClose }) => {
    const [state, setState] = React.useState<GroupSelectionState>(() => initGroupState(groups));
    const handleChange = (categoryName: string, idx: number, freeform: string) =>
      setState((prev) => ({ ...prev, [categoryName]: { idx, freeform } }));
    return (
      <InteractionPreviewCard
        typeName={cardTypeName}
        name=""
        accentColor="#22c55e"
        actions={[
          {
            label: "Confirm",
            variant: "confirm",
            onConfirm: () => executeGroupSelections(groups, state),
          },
        ]}
        onClose={onClose}
      >
        <OriginOptionGroups groups={groups} state={state} onChange={handleChange} />
      </InteractionPreviewCard>
    );
  };

  return {
    name: `Set ${cardTypeName}`,
    typeName: cardTypeName,
    color: "#22c55e",
    isOriginOption: true,
    forcePreview: needsChoice || hasFreeform,
    executeDefault: () => executeGroupSelections(groups, initGroupState(groups)),
    Preview,
  };
}

/**
 * Combines a single origin action with co-located origin-option actions.
 * The origin card is shown with its description; option groups appear below so
 * the user can set both at once. One tab is produced per call, so pass each
 * origin action separately when there are multiple origins.
 */
function buildCombinedOriginWithOptionsInteraction(
  originAction: Extract<ViewerAnnotationAction, { collection: "origin" }>,
  optionActions: Array<Extract<ViewerAnnotationAction, { collection: "origin-option" }>>,
  origins: Record<number, Origin[]> | null,
  originCategories: Registry<LID.OriginCategory, OriginCategory> | undefined,
  currencies: Registry<LID.Currency, Currency> | undefined,
  purchaseSubtypes: Registry<LID.PurchaseSubtype, PurchaseSubtype> | undefined,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  setOrigins: ReturnType<typeof useJumpOrigins>["setOrigins"],
  getModifiersUpdater: ReturnType<typeof useJumpDocPurchaseActions>["getModifiersUpdater"],
  navigate: ReturnType<typeof useNavigate>,
  routeParams: RouteParams,
  forceRemove: boolean,
): AnnotationInteraction | null {
  const action = originAction;
  const categoryLid = resolveJumpOriginCategory(action.typeName, originCategories);
  const categoryDeleted = categoryLid === undefined;
  const chainCategory = categoryLid !== undefined ? originCategories?.O[categoryLid] : undefined;
  const currentList: Origin[] = categoryLid !== undefined ? (origins?.[categoryLid] ?? []) : [];
  const alreadyPresent = currentList.some(
    (o) => o.summary === action.name || o.templateName === action.name,
  );
  if (forceRemove && !alreadyPresent) return null;
  const { evictedIdx, evictedName } = resolveEviction(
    currentList,
    alreadyPresent,
    chainCategory,
    action.docCategoryMax,
  );

  const hasModifiers =
    action.discountedPurchaseTemplateIds.length > 0 || action.synergyOriginNames.length > 0;
  const discountUpdate = hasModifiers ? getModifiersUpdater(action.docId) : undefined;

  const hasSynergy =
    action.synergyOriginNames.length > 0 &&
    action.synergyOriginNames.some(({ categoryName, originName }) => {
      const catLid = resolveJumpOriginCategory(categoryName, originCategories);
      if (!catLid) return false;
      return (origins?.[catLid] ?? []).some(
        (o) => o.summary === originName || o.templateName === originName,
      );
    });

  // Access-restricted: show error card without option selector.
  if (action.synergyBenefit === "access" && !hasSynergy && !alreadyPresent && !forceRemove) {
    const originList = action.synergyOriginNames.map((o) => o.originName).join(", ");
    const Preview: AnnotationInteraction["Preview"] = ({ onClose }) => (
      <InteractionPreviewCard
        typeName={action.typeName}
        name={action.name}
        accentColor="#22c55e"
        costStr={action.costStr}
        description={action.template.description}
        errorMessage={`This origin is restricted to holders of: ${originList}.`}
        actions={[]}
        onClose={onClose}
      />
    );
    return {
      name: action.name,
      typeName: action.typeName,
      color: "#22c55e",
      forcePreview: true,
      executeDefault: () => {},
      Preview,
    };
  }

  const effectiveCostStr = (() => {
    if (alreadyPresent) return undefined;
    if (hasSynergy && action.synergyBenefit === "free") return "free";
    if (hasSynergy && action.synergyBenefit === "discounted") {
      const threshold = Object.values(currencies?.O ?? {}).find(
        (c) => c?.abbrev === action.docCurrencyAbbrev,
      )?.discountFreeThreshold;
      if (threshold != null && action.template.cost.amount <= threshold) return "free; discounted";
      const halfCost = action.costStr.replace(/(\d+)/g, (m) => String(Math.floor(Number(m) / 2)));
      return `${halfCost}; discounted`;
    }
    return action.costStr;
  })();

  const executeOrigin = (name: string, description: string) => {
    if (categoryLid === undefined) return;
    if (alreadyPresent) {
      setOrigins(
        (d) => {
          const rec = d as Record<number, Origin[]>;
          const list = rec[categoryLid];
          if (!list) return;
          const idx = list.findIndex(
            (o) => o.summary === action.name || o.templateName === action.name,
          );
          if (idx !== -1) list.splice(idx, 1);
          if (list.length === 0) delete rec[categoryLid];
        },
        (c) => {
          removeOriginStipendDrawbacks(action.name, jumpId, charId)(c);
          discountUpdate?.(c);
        },
      );
    } else {
      const stipendMutation = (c: Chain) => {
        if (evictedName) removeOriginStipendDrawbacks(evictedName, jumpId, charId)(c);
        if (action.resolvedOriginStipend.length)
          createOriginStipendDrawbacks(
            name,
            action.resolvedOriginStipend,
            currencies,
            purchaseSubtypes,
            jumpId,
            charId,
          )(c);
        discountUpdate?.(c);
      };
      commitAddOrigin(
        categoryLid,
        evictedIdx,
        {
          name,
          templateName: action.template.name !== name ? action.template.name : undefined,
          description,
          synergyOrigins: action.synergyOriginNames.length ? action.synergyOriginNames : undefined,
          synergyBenefit: action.synergyBenefit,
        },
        action.template.cost.amount,
        action.docCurrencyAbbrev,
        currencies,
        setOrigins,
        stipendMutation,
      );
    }
    navigate({ to: "/chain/$chainId/char/$charId/jump/$jumpId", params: routeParams });
  };

  const accentColor = alreadyPresent ? "#ef4444" : evictedName ? "#f59e0b" : "#22c55e";
  const synergyLabel =
    !alreadyPresent && hasSynergy && action.synergyBenefit !== "access"
      ? `Synergy: ${action.synergyOriginNames.map((o) => o.originName).join(", ")}`
      : undefined;

  // Build option groups — no navigate, origin's navigate handles the redirect.
  const optionGroups = groupOptionData(
    buildOriginOptionDataArray(
      optionActions,
      origins,
      originCategories,
      currencies,
      setOrigins,
      null,
      null,
      forceRemove,
    ),
  );

  const Preview: AnnotationInteraction["Preview"] = ({ onClose }) => {
    const tags = useMemo(
      () => extractTags([action.template.name, action.template.description ?? ""]),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );
    const [tagValues, setTagValues] = useState<Record<string, string>>(() =>
      Object.fromEntries(tags.map((t) => [t.name, ""])),
    );
    const resolvedName =
      tags.length > 0 ? applyTags(action.template.name, tagValues) : action.template.name;
    const resolvedDesc =
      tags.length > 0
        ? applyTags(action.template.description ?? "", tagValues)
        : (action.template.description ?? "");

    const [optState, setOptState] = useState<GroupSelectionState>(() =>
      initGroupState(optionGroups),
    );
    const handleChange = (categoryName: string, idx: number, freeform: string) =>
      setOptState((prev) => ({ ...prev, [categoryName]: { idx, freeform } }));

    return (
      <InteractionPreviewCard
        typeName={action.typeName}
        description={resolvedDesc || undefined}
        name={resolvedName}
        accentColor={accentColor}
        costStr={alreadyPresent ? undefined : effectiveCostStr}
        warning={evictedName ?? synergyLabel ?? undefined}
        errorMessage={
          categoryDeleted ? `"${action.typeName}" no longer exists in this jump.` : undefined
        }
        actions={[
          {
            label: alreadyPresent ? `Remove ${action.typeName}` : `Use ${action.typeName}`,
            variant: alreadyPresent ? "danger" : evictedName ? "warn" : "confirm",
            onConfirm: () => {
              executeOrigin(resolvedName, resolvedDesc);
              executeGroupSelections(optionGroups, optState);
              onClose();
            },
          },
        ]}
        onClose={onClose}
      >
        {!alreadyPresent && tags.length > 0 && (
          <TagFieldsSection
            tags={tags}
            tagValues={tagValues}
            choiceContext={action.template.choiceContext}
            onChangeTag={(name, value) => setTagValues((v) => ({ ...v, [name]: value }))}
          />
        )}
        {!alreadyPresent && optionGroups.length > 0 && (
          <OriginOptionGroups groups={optionGroups} state={optState} onChange={handleChange} />
        )}
      </InteractionPreviewCard>
    );
  };

  return {
    name: action.name,
    typeName: action.typeName,
    color: "#22c55e",
    isOriginOption: true,
    forcePreview: !alreadyPresent,
    executeDefault: () => executeOrigin(action.template.name, action.template.description ?? ""),
    Preview,
  };
}

/**
 * Returns an AnnotationInteraction that shows a read-only explanation when an
 * "access"-type template is clicked but the user doesn't hold a qualifying origin.
 * Shared by purchase and companion interaction builders.
 */
function buildAccessDeniedInteraction(
  action: {
    name: string;
    typeName: string;
    costStr: string;
    originNames: { categoryName: string; originName: string }[];
  },
  color: string,
): AnnotationInteraction {
  const originList = action.originNames.map((o) => o.originName).join(", ");
  const Preview: AnnotationInteraction["Preview"] = ({ onClose }) => (
    <InteractionPreviewCard
      typeName={action.typeName}
      name={action.name}
      accentColor={color}
      costStr={action.costStr}
      errorMessage={`This purchase is restricted to holders of: ${originList}.`}
      actions={[]}
      onClose={onClose}
    />
  );
  return {
    name: action.name,
    typeName: action.typeName,
    color,
    forcePreview: true,
    isError: true,
    executeDefault: () => {},
    Preview,
  };
}

function buildPurchaseInteraction(
  action: PurchaseAction,
  origins: Record<number, Origin[]> | null,
  originCategories: Registry<LID.OriginCategory, OriginCategory> | undefined,
  purchaseSubtypes: Registry<LID.PurchaseSubtype, PurchaseSubtype> | undefined,
  currencies: Registry<LID.Currency, Currency> | undefined,
  budget: Budget | undefined,
  addFromTemplate: ReturnType<typeof useJumpDocPurchaseActions>["addFromTemplate"],
  removePurchase: ReturnType<typeof useJumpDocPurchaseActions>["removePurchase"],
  findByTemplate: ReturnType<typeof useJumpDocPurchaseActions>["findByTemplate"],
  countByTemplate: ReturnType<typeof useJumpDocPurchaseActions>["countByTemplate"],
  findDrawback: ReturnType<typeof useJumpDocDrawbackActions>["findByTemplate"],
  navigate: ReturnType<typeof useNavigate>,
  routeParams: RouteParams,
  forceRemove: boolean,
  findReverseIncompatibilities: ReturnType<
    typeof useJumpDocPurchaseActions
  >["findReverseIncompatibilities"],
): AnnotationInteraction | null {
  const subtype = resolveJumpPurchaseSubtype(action.subtypeName, purchaseSubtypes);
  const subtypeData = subtype ? purchaseSubtypes?.O[subtype.lid] : undefined;
  const floatingDiscountMode = action.cost.some((c) => c.amount)
    ? subtypeData?.floatingDiscountMode
    : undefined;
  const hasFloatingDiscountThresholds =
    !!subtypeData?.floatingDiscountThresholds?.length && action.cost.some((c) => c.amount);
  const tags = extractTags([action.template.name, action.template.description]);
  const existingId =
    forceRemove || !action.template.allowMultiple
      ? findByTemplate(action.docId, action.docTemplateId)
      : undefined;
  if (forceRemove && existingId === undefined) return null;

  // Origin discount: check each qualifying origin in its specific category.
  const hasOriginDiscount = action.originNames.some(({ categoryName, originName }) => {
    const categoryLid = resolveJumpOriginCategory(categoryName, originCategories);
    if (categoryLid === undefined) return false;
    return (origins?.[categoryLid] ?? []).some(
      (o) => o.summary === originName || o.templateName === originName,
    );
  });

  // Only the first copy of a given template gets the free discount; subsequent copies are Reduced.
  const isFirstCopy = countByTemplate(action.docId, action.docTemplateId) === 0;

  // Access-only purchases are never discounted; discount display only applies to "discounted"/"free".
  const isAccessOnly = action.originBenefit === "access";

  // Floating discount relevance.
  // Case a) free-use: no origin discount, subtype allows any purchase to use a floating discount.
  // Case b) origin-based: has origin discount, but discount must be applied manually.
  // In both cases, don't offer if the undiscounted cost exceeds the largest threshold for any currency.
  const withinFloatingDiscountThreshold = action.cost.every(({ amount, currencyAbbrev }) => {
    if (amount <= 0) return true;
    const thresholds = subtypeData?.floatingDiscountThresholds ?? [];
    const currencyLid = Object.entries(currencies?.O ?? {}).find(
      ([, c]) => c?.abbrev === currencyAbbrev,
    )?.[0];
    if (currencyLid === undefined) return true;
    const maxThreshold = Math.max(
      ...thresholds.filter((t) => String(t.currency) === currencyLid).map((t) => t.amount),
    );
    return isFinite(maxThreshold) && amount <= maxThreshold;
  });
  const floatingDiscountFreeRelevant =
    !hasOriginDiscount &&
    !isAccessOnly &&
    hasFloatingDiscountThresholds &&
    withinFloatingDiscountThreshold &&
    (floatingDiscountMode === "free" || floatingDiscountMode == null);
  const floatingDiscountOriginRelevant =
    hasOriginDiscount &&
    !isAccessOnly &&
    hasFloatingDiscountThresholds &&
    withinFloatingDiscountThreshold &&
    floatingDiscountMode === "origin";
  const floatingDiscountRelevant = floatingDiscountFreeRelevant || floatingDiscountOriginRelevant;

  // Capstone boosters: append boosted descriptions for any booster the user holds.
  const boosterDescriptions = action.template.boosted.flatMap((b) => {
    const held =
      b.boosterKind === "drawback"
        ? findDrawback(action.docId, b.booster as Id<TID.Drawback>) !== undefined
        : findByTemplate(action.docId, b.booster as Id<TID.Purchase>) !== undefined;
    return held ? [b.description] : [];
  });

  // If the user lacks a qualifying origin for an access-only purchase, block with an explanation.
  if (isAccessOnly && !hasOriginDiscount) {
    return buildAccessDeniedInteraction(action, "#818cf8");
  }

  // Prerequisite check: block add if any prereq is unmet (only when adding, not removing).
  // Also checks the reverse direction: held purchases that declare THIS template incompatible.
  if (!existingId) {
    const unmet =
      action.prerequisites.length > 0
        ? getUnmetPrereqs(action.prerequisites, action.docId, findByTemplate, findDrawback)
        : [];
    const reverseBlocked = findReverseIncompatibilities(action.docId, action.docTemplateId);
    if (unmet.length > 0 || reverseBlocked.length > 0) {
      const missing = unmet.filter((p) => p.positive).map((p) => p.name);
      const incompatible = [
        ...unmet.filter((p) => !p.positive).map((p) => p.name),
        ...reverseBlocked,
      ];
      const parts: string[] = [];
      if (missing.length) parts.push(`Requires: ${missing.join(", ")}`);
      if (incompatible.length) parts.push(`Incompatible with: ${incompatible.join(", ")}`);
      const errorMessage = parts.join(" · ");
      const Preview: AnnotationInteraction["Preview"] = ({ onClose }) => (
        <InteractionPreviewCard
          typeName={action.typeName}
          name={action.name}
          accentColor="#818cf8"
          costStr={action.costStr}
          errorMessage={errorMessage}
          actions={[]}
          onClose={onClose}
        />
      );
      return {
        name: action.name,
        typeName: action.typeName,
        color: "#818cf8",
        forcePreview: true,
        isError: true,
        executeDefault: () => {},
        Preview,
      };
    }
  }

  // Alternative costs: determine qualifying mandatory and optional alt costs.
  const qualifyingMandatoryAltCost = (() => {
    const q = action.alternativeCosts.filter(
      (ac) =>
        ac.mandatory &&
        checkResolvedAltCostPrereqs(
          ac.prerequisites,
          action.docId,
          origins,
          originCategories,
          findByTemplate,
          findDrawback,
        ),
    );
    if (!q.length) return undefined;
    return q.find((ac) => ac.value.every((v) => v.amount === 0)) ?? q[0]!;
  })();

  const qualifyingOptionalAltCosts = action.alternativeCosts.filter((ac) => {
    if (ac.mandatory) return false;
    if (
      !checkResolvedAltCostPrereqs(
        ac.prerequisites,
        action.docId,
        origins,
        originCategories,
        findByTemplate,
        findDrawback,
      )
    )
      return false;
    // Exclude alt costs that spend a hidden currency the user has no balance or stipend of.
    if (currencies && budget) {
      for (const v of ac.value) {
        if (v.amount === 0) continue;
        const abbrev = v.currencyAbbrev;
        for (const [idStr, c] of Object.entries(currencies.O) as [string, Currency | undefined][]) {
          if (c?.abbrev !== abbrev) continue;
          const currId = createId<LID.Currency>(+idStr);
          if (c.hidden && (budget.currency[currId] ?? 0) <= 0) {
            const subtypeStipends = subtype ? budget.stipends[subtype.lid] : undefined;
            const stipend = subtypeStipends ? (subtypeStipends[currId] ?? 0) : 0;
            if (stipend <= 0) return false;
          }
          break;
        }
      }
    }
    return true;
  });

  // Determine origin modifier (for priority comparison).
  const originModifier =
    hasOriginDiscount && !isAccessOnly
      ? originDiscountModifier(action.cost, currencies, action.originBenefit, isFirstCopy)
      : undefined;
  const originIsFree = originModifier?.modifier === CostModifier.Free;

  // Effective cost string.
  // beforeDiscounts alt costs: origin discount applies on top of the alt cost base.
  // Regular alt costs: override origin discount entirely.
  // Priority: beforeDiscounts-alt+origin > origin-free > regular-alt > origin-reduced > full.
  // For origin-based floating discount subtypes, origin discounts are not auto-applied.
  const effectiveCostStr = (() => {
    if (existingId !== undefined) return undefined;
    if (
      qualifyingMandatoryAltCost?.beforeDiscounts &&
      hasOriginDiscount &&
      !isAccessOnly &&
      !floatingDiscountOriginRelevant
    ) {
      return `${originDiscountCostStr(qualifyingMandatoryAltCost.value, currencies, action.originBenefit, isFirstCopy)} ; altered`;
    }
    if (qualifyingMandatoryAltCost?.beforeDiscounts)
      return `${altCostValueStr(qualifyingMandatoryAltCost.value)} ; altered`;
    if (originIsFree && !floatingDiscountOriginRelevant)
      return originDiscountCostStr(action.cost, currencies, action.originBenefit, isFirstCopy);
    if (qualifyingMandatoryAltCost)
      return `${altCostValueStr(qualifyingMandatoryAltCost.value)} ; altered`;
    if (hasOriginDiscount && !isAccessOnly && !floatingDiscountOriginRelevant)
      return originDiscountCostStr(action.cost, currencies, action.originBenefit, isFirstCopy);
    return action.costStr;
  })();

  const navigateToPurchases = (scrollTo?: string) =>
    navigate({
      to: "/chain/$chainId/char/$charId/jump/$jumpId/purchases",
      params: routeParams,
      search: { scrollTo },
    });

  const storedAltCosts = resolveAltCostsToStorage(
    action.alternativeCosts,
    action.docId,
    currencies,
  );
  const storedPrereqs = resolvePrereqsToStorage(action.prerequisites, action.docId);

  const doExecute = (
    name: string,
    description: string,
    overrideInitialCost?: ModifiedCost,
    isOptionalAltCost?: boolean,
    usesFloatingDiscount?: boolean,
    optionalAltCostBeforeDiscountsValue?: Value,
  ) => {
    if (existingId !== undefined) {
      removePurchase(existingId);
      navigateToPurchases();
    } else if (subtype) {
      // Resolve which currently-held purchases will gain booster text from this purchase.
      const boosts: { purchaseId: Id<GID.Purchase>; description: string }[] =
        action.isBoosterFor.flatMap(({ templateId, description: boostDesc }) => {
          const pId = findByTemplate(action.docId, templateId);
          return pId !== undefined ? [{ purchaseId: pId, description: boostDesc }] : [];
        });
      // Resolve booster purchases already held that boost this item so that deleting them
      // later can strip the booster text via stripBoostsFromPurchases.
      const reverseBoosts: { boosterPurchaseId: Id<GID.Purchase>; description: string }[] =
        action.template.boosted.flatMap(
          ({ booster: boosterTid, boosterKind, description: boostDesc }) => {
            // Default to "purchase" for old data without boosterKind.
            if (boosterKind === "drawback") {
              const boosterId = findDrawback(action.docId, boosterTid as Id<TID.Drawback>);
              return boosterId !== undefined
                ? [{ boosterPurchaseId: boosterId, description: boostDesc }]
                : [];
            }
            const boosterId = findByTemplate(action.docId, boosterTid as Id<TID.Purchase>);
            return boosterId !== undefined
              ? [{ boosterPurchaseId: boosterId, description: boostDesc }]
              : [];
          },
        );
      const value: Value = action.cost.map(({ amount, currencyAbbrev }) => ({
        amount,
        currency: resolveJumpCurrency(currencyAbbrev, currencies),
      }));

      // Compute initial cost: override > beforeDiscounts-alt+origin > origin-free > regular-alt > origin-reduced.
      // For origin-based floating discount subtypes, origin discount is never auto-applied.
      let initialCost: ModifiedCost | undefined = overrideInitialCost;
      if (!initialCost) {
        if (qualifyingMandatoryAltCost?.beforeDiscounts) {
          // Alt cost is the base; apply origin discount on top if applicable.
          const altResolved: Value = qualifyingMandatoryAltCost.value.map(
            ({ amount, currencyAbbrev }) => ({
              amount,
              currency: resolveJumpCurrency(currencyAbbrev, currencies),
            }),
          );
          if (hasOriginDiscount && !isAccessOnly && !floatingDiscountOriginRelevant) {
            const altMod = originDiscountModifier(
              qualifyingMandatoryAltCost.value,
              currencies,
              action.originBenefit,
              isFirstCopy,
            );
            if (altMod.modifier === CostModifier.Free) {
              initialCost = { modifier: CostModifier.Free };
            } else {
              initialCost = {
                modifier: CostModifier.Custom,
                modifiedTo: altResolved.map((v) => ({
                  amount: Math.floor(v.amount / 2),
                  currency: v.currency,
                })),
              };
            }
          } else {
            initialCost = { modifier: CostModifier.Custom, modifiedTo: altResolved };
          }
        } else if (originIsFree && !floatingDiscountOriginRelevant) {
          initialCost = originModifier;
        } else if (qualifyingMandatoryAltCost) {
          const resolvedValue: Value = qualifyingMandatoryAltCost.value.map(
            ({ amount, currencyAbbrev }) => ({
              amount,
              currency: resolveJumpCurrency(currencyAbbrev, currencies),
            }),
          );
          initialCost = { modifier: CostModifier.Custom, modifiedTo: resolvedValue };
        } else if (hasOriginDiscount && !isAccessOnly && !floatingDiscountOriginRelevant) {
          initialCost = originModifier;
        }
      }

      const newId = addFromTemplate({
        name,
        description,
        value,
        templateId: action.docTemplateId,
        docId: action.docId,
        subtype: subtype.lid,
        type: subtype.type,
        boosts,
        reverseBoosts: reverseBoosts.length ? reverseBoosts : undefined,
        initialCost,
        discountOrigins:
          !isAccessOnly && action.originNames.length > 0 ? action.originNames : undefined,
        originBenefit: action.originBenefit,
        alternativeCosts: (() => {
          const altCosts = isFirstCopy
            ? storedAltCosts.filter((ac) => {
                if (!ac.mandatory || ac.prerequisites.length === 0) return true;
                return !ac.prerequisites.every(
                  (p) =>
                    p.type === "purchase" &&
                    p.docId === action.docId &&
                    p.templateId === action.docTemplateId,
                );
              })
            : storedAltCosts;
          return altCosts.length ? altCosts : undefined;
        })(),
        optionalAltCost: isOptionalAltCost || undefined,
        optionalAltCostBeforeDiscountsValue,
        storedPrerequisites: storedPrereqs.length ? storedPrereqs : undefined,
        usesFloatingDiscount: usesFloatingDiscount || undefined,
        temporary: action.template.temporary || undefined,
      });
      navigateToPurchases(String(newId));
    }
  };

  // Build extra actions for optional alt costs.
  const optionalAltCostActions = qualifyingOptionalAltCosts.map((ac) => {
    const resolvedValue: Value = ac.value.map(({ amount, currencyAbbrev }) => ({
      amount,
      currency: resolveJumpCurrency(currencyAbbrev, currencies),
    }));
    if (ac.beforeDiscounts) {
      // Alt cost stacks with origin discounts — compute effective cost and label accordingly.
      const hasApplicableDiscount =
        hasOriginDiscount && !isAccessOnly && !floatingDiscountOriginRelevant;
      let label: string;
      let overrideInitialCost: ModifiedCost;
      if (hasApplicableDiscount) {
        label = `Add (${originDiscountCostStr(ac.value, currencies, action.originBenefit, isFirstCopy)}) ; altered`;
        const altMod = originDiscountModifier(
          ac.value,
          currencies,
          action.originBenefit,
          isFirstCopy,
        );
        if (altMod.modifier === CostModifier.Free) {
          overrideInitialCost = { modifier: CostModifier.Free };
        } else {
          overrideInitialCost = {
            modifier: CostModifier.Custom,
            modifiedTo: resolvedValue.map((v) => ({
              amount: Math.floor(v.amount / 2),
              currency: v.currency,
            })),
          };
        }
      } else {
        label = `Add (${altCostValueStr(ac.value)}) ; altered`;
        overrideInitialCost = { modifier: CostModifier.Custom, modifiedTo: resolvedValue };
      }
      return {
        label,
        variant: "confirm" as const,
        onConfirm: (name: string, description: string) => {
          doExecute(name, description, overrideInitialCost, true, undefined, resolvedValue);
        },
      };
    }
    return {
      label: `Add (${altCostValueStr(ac.value)})`,
      variant: "confirm" as const,
      onConfirm: (name: string, description: string) => {
        doExecute(
          name,
          description,
          { modifier: CostModifier.Custom, modifiedTo: resolvedValue },
          true,
        );
      },
    };
  });

  // Floating discount action — shown when relevant and only when adding (not removing).
  const floatingDiscountCost = floatingDiscountRelevant
    ? originDiscountModifier(action.cost, currencies, action.originBenefit, isFirstCopy)
    : undefined;
  const floatingDiscountAction = floatingDiscountCost
    ? [
        {
          label: `Use Floating Discount (${originDiscountCostStr(action.cost, currencies, action.originBenefit, isFirstCopy)})`,
          variant: "confirm" as const,
          onConfirm: (name: string, description: string) => {
            doExecute(name, description, floatingDiscountCost, false, true);
          },
        },
      ]
    : [];

  // For allowMultiple purchases, find an existing copy to offer as a removal target.
  const existingCount = countByTemplate(action.docId, action.docTemplateId);
  const removeId =
    action.template.allowMultiple && existingCount > 0
      ? findByTemplate(action.docId, action.docTemplateId)
      : undefined;

  const doRemoveCopy = () => {
    if (removeId !== undefined) {
      removePurchase(removeId);
      navigateToPurchases();
    }
  };

  const Preview: AnnotationInteraction["Preview"] = ({ onClose }) => (
    <PurchaseInteractionPreview
      action={action}
      existingId={existingId}
      removeId={removeId}
      copyCount={existingCount}
      subtype={subtype}
      effectiveCostStr={effectiveCostStr ?? action.costStr}
      boosterDescriptions={boosterDescriptions}
      onExecute={doExecute}
      onRemove={doRemoveCopy}
      extraActions={[...optionalAltCostActions, ...floatingDiscountAction]}
      onClose={onClose}
    />
  );

  const hasAnyModifier = qualifyingOptionalAltCosts.length > 0 || floatingDiscountRelevant;

  return {
    name: action.name,
    typeName: action.typeName,
    color: "#818cf8",
    forcePreview:
      existingId === undefined &&
      (!subtype || tags.length > 0 || hasAnyModifier || existingCount > 0),
    executeDefault: () =>
      doExecute(
        action.template.name,
        boosterDescriptions.length > 0
          ? `${action.template.description}\n\n${boosterDescriptions.join("\n\n")}`
          : action.template.description,
      ),
    Preview,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario preview (outcome selection)
// ─────────────────────────────────────────────────────────────────────────────

type ScenarioAction = Extract<ViewerAnnotationAction, { collection: "scenario" }>;
type RewardGroup = NonNullable<ScenarioTemplate["rewardGroups"]>[number];

/** Displays a single reward line (currency/stipend/perk/item). */
function RewardLine({
  reward,
  doc,
}: {
  reward: ScenarioRewardTemplate;
  doc: ReturnType<typeof useJumpDocStore.getState>["doc"];
}) {
  if (reward.type === RewardType.Currency) {
    const abbrev = doc?.currencies.O[reward.currency]?.abbrev ?? "?";
    return (
      <span className="text-xs text-ink">
        {reward.value} {abbrev}
      </span>
    );
  }
  if (reward.type === RewardType.Stipend) {
    const abbrev = doc?.currencies.O[reward.currency]?.abbrev ?? "?";
    const subtypeName = doc?.purchaseSubtypes.O[reward.subtype]?.name ?? "?";
    return (
      <span className="text-xs text-ink">
        {reward.value} {abbrev} ({subtypeName} stipend)
      </span>
    );
  }
  if (reward.type === RewardType.Companion) {
    const companion = doc?.availableCompanions.O[reward.id];
    return <span className="text-xs text-ink">Companion import: {companion?.name}</span>;
  }
  // Perk or Item
  const purchase = doc?.availablePurchases.O[reward.id];
  return <span className="text-xs text-ink">{purchase?.name}</span>;
}

/** Pill-based outcome selector with context + reward list for the selected group. */
function ScenarioOutcomeSelector({
  groups,
  selectedIndex,
  onSelect,
  doc,
}: {
  groups: RewardGroup[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  doc: ReturnType<typeof useJumpDocStore.getState>["doc"];
}) {
  const group = groups[selectedIndex];
  return (
    <div className="flex flex-col gap-2 pb-1">
      <div className="flex flex-wrap items-center gap-1.5 pl-3">
        <span className="text-xs text-muted font-semibold shrink-0">Outcome:</span>
        {groups.map((g, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
              selectedIndex === i
                ? "bg-accent2-tint text-accent2 border-accent2"
                : "bg-surface text-ink border-edge hover:border-accent2 hover:text-accent2"
            }`}
          >
            {g.title || `Outcome ${i + 1}`}
          </button>
        ))}
      </div>
      {group && (
        <div className="flex flex-col justify-center gap-2 rounded border border-accent-ring/15 bg-tint/50 p-5">
          {group.context && (
            <div className="text-xs text-muted flex flex-col gap-1">
              {convertWhitespace(group.context)}
            </div>
          )}
          {group.rewards.length > 0 && (
            <div className="flex flex-row flex-wrap gap-x-1.5 text-xs">
              <span className="font-medium">Rewards:</span>
              {group.rewards.map((r, i) => (
                <span>
                  <RewardLine key={i} reward={r} doc={doc} />
                  {i < group.rewards.length - 1 ? "; " : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScenarioInteractionPreview({
  action,
  existingId,
  addFromTemplate,
  storedPrereqs,
  remove,
  navigateTo,
  onClose,
}: {
  action: ScenarioAction;
  existingId: Id<GID.Purchase> | undefined;
  addFromTemplate: ReturnType<typeof useJumpDocScenarioActions>["addFromTemplate"];
  storedPrereqs: StoredPurchasePrerequisite[];
  remove: ReturnType<typeof useJumpDocScenarioActions>["remove"];
  navigateTo: (scrollTo?: string) => void;
  onClose: () => void;
}) {
  const rewardGroups = action.template.rewardGroups ?? [];
  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const doc = useJumpDocStore((s) => s.doc);

  const tags = useMemo(
    () => extractTags([action.template.name, action.template.description ?? ""]),
    [action.template.name, action.template.description],
  );
  const [tagValues, setTagValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(tags.map((t) => [t.name, ""])),
  );
  const resolvedName =
    tags.length > 0 ? applyTags(action.template.name, tagValues) : action.template.name;
  const resolvedDesc =
    tags.length > 0
      ? applyTags(action.template.description ?? "", tagValues)
      : (action.template.description ?? "");

  function doExecute() {
    if (existingId !== undefined) {
      // Enqueue forceRemove companion batches for each companion reward — routes through
      // the full companion removal flow (including the activity-check dialog).
      const chain = useChainStore.getState().chain;
      const doc = useJumpDocStore.getState().doc;
      const scenario = chain?.purchases.O[existingId] as Scenario | undefined;
      if (scenario?.type === PurchaseType.Scenario && doc && scenario.template?.jumpdoc) {
        const companionRewards = scenario.rewards.filter(
          (r): r is Extract<typeof r, { type: RewardType.Companion }> =>
            r.type === RewardType.Companion,
        );
        const batches = buildScenarioCompanionRewardActions(
          companionRewards,
          doc,
          scenario.template.jumpdoc,
        ).map((b) => ({ ...b, forceRemove: true as const }));
        if (batches.length > 0) useViewerActionStore.getState().enqueueActions(batches);
      }
      remove(existingId);
      navigateTo();
    } else {
      const group = rewardGroups.length > 0 ? rewardGroups[selectedOutcome] : undefined;
      const newId = addFromTemplate({
        name: resolvedName,
        description: resolvedDesc,
        value: [],
        templateId: action.docTemplateId,
        docId: action.docId,
        rewardGroup: group,
        storedPrerequisites: storedPrereqs.length ? storedPrereqs : undefined,
      });
      // Enqueue Item/Perk and Companion rewards as annotation interactions.
      const doc = useJumpDocStore.getState().doc;
      if (doc) {
        const purchaseRewards = (group?.rewards ?? []).filter(
          (r): r is Extract<typeof r, { type: RewardType.Item | RewardType.Perk }> =>
            r.type === RewardType.Item || r.type === RewardType.Perk,
        );
        const companionRewards = (group?.rewards ?? []).filter(
          (r): r is Extract<typeof r, { type: RewardType.Companion }> =>
            r.type === RewardType.Companion,
        );
        const batches = [
          ...buildScenarioRewardActions(purchaseRewards, doc, action.docId),
          ...buildScenarioCompanionRewardActions(companionRewards, doc, action.docId),
        ];
        if (batches.length > 0) useViewerActionStore.getState().enqueueActions(batches);
      }
      navigateTo(String(newId));
    }
    onClose();
  }

  return (
    <InteractionPreviewCard
      typeName={action.typeName}
      name={resolvedName}
      accentColor={existingId !== undefined ? "#ef4444" : "#a855f7"}
      description={resolvedDesc || undefined}
      actions={[
        {
          label: existingId !== undefined ? "Remove" : "Add",
          variant: existingId !== undefined ? "danger" : "confirm",
          onConfirm: doExecute,
        },
      ]}
      onClose={onClose}
    >
      {tags.length > 0 && (
        <TagFieldsSection
          tags={tags}
          tagValues={tagValues}
          choiceContext={action.template.choiceContext}
          onChangeTag={(name, value) => setTagValues((v) => ({ ...v, [name]: value }))}
        />
      )}
      {existingId === undefined && rewardGroups.length > 0 && (
        <ScenarioOutcomeSelector
          groups={rewardGroups}
          selectedIndex={selectedOutcome}
          onSelect={setSelectedOutcome}
          doc={doc}
        />
      )}
    </InteractionPreviewCard>
  );
}

function buildScenarioInteraction(
  action: ScenarioAction,
  addFromTemplate: ReturnType<typeof useJumpDocScenarioActions>["addFromTemplate"],
  remove: ReturnType<typeof useJumpDocScenarioActions>["remove"],
  findByTemplate: ReturnType<typeof useJumpDocScenarioActions>["findByTemplate"],
  navigateTo: (scrollTo?: string) => void,
  forceRemove: boolean,
  findPurchase?: (docId: string, id: Id<TID.Purchase>) => Id<GID.Purchase> | undefined,
  findDrawback?: (docId: string, id: Id<TID.Drawback>) => Id<GID.Purchase> | undefined,
): AnnotationInteraction | null {
  const existingId = findByTemplate(action.docId, action.docTemplateId);
  if (forceRemove && existingId === undefined) return null;

  const rewardGroups = action.template.rewardGroups ?? [];
  const tags = extractTags([action.template.name, action.template.description ?? ""]);
  const storedPrereqs = resolvePrereqsToStorage(action.prerequisites, action.docId);

  // Prerequisite check: block add if any prereq is unmet.
  if (!existingId && action.prerequisites.length > 0) {
    const unmet = getUnmetPrereqs(
      action.prerequisites,
      action.docId,
      findPurchase ?? (() => undefined),
      findDrawback ?? (() => undefined),
      findByTemplate as (docId: string, id: Id<TID.Scenario>) => Id<GID.Purchase> | undefined,
    );
    if (unmet.length > 0) {
      const missing = unmet.filter((p) => p.positive).map((p) => p.name);
      const incompatible = unmet.filter((p) => !p.positive).map((p) => p.name);
      const parts: string[] = [];
      if (missing.length) parts.push(`Requires: ${missing.join(", ")}`);
      if (incompatible.length) parts.push(`Incompatible with: ${incompatible.join(", ")}`);
      const errorMsg = parts.join(" · ");
      const PreviewErr: AnnotationInteraction["Preview"] = ({ onClose }) => (
        <InteractionPreviewCard
          typeName={action.typeName}
          name={action.name}
          accentColor="#a855f7"
          costStr={action.costStr}
          errorMessage={errorMsg}
          actions={[]}
          onClose={onClose}
        />
      );
      return {
        name: action.name,
        typeName: action.typeName,
        color: "#a855f7",
        forcePreview: true,
        executeDefault: () => {},
        Preview: PreviewErr,
      };
    }
  }

  const doExecute = (name: string, description: string) => {
    if (existingId !== undefined) {
      // Enqueue forceRemove companion batches for each companion reward — routes through
      // the full companion removal flow (including the activity-check dialog).
      const chain = useChainStore.getState().chain;
      const doc = useJumpDocStore.getState().doc;
      const scenario = chain?.purchases.O[existingId] as Scenario | undefined;
      if (scenario?.type === PurchaseType.Scenario && doc && scenario.template?.jumpdoc) {
        const companionRewards = scenario.rewards.filter(
          (r): r is Extract<typeof r, { type: RewardType.Companion }> =>
            r.type === RewardType.Companion,
        );
        const batches = buildScenarioCompanionRewardActions(
          companionRewards,
          doc,
          scenario.template.jumpdoc,
        ).map((b) => ({ ...b, forceRemove: true as const }));
        if (batches.length > 0) useViewerActionStore.getState().enqueueActions(batches);
      }
      remove(existingId);
      navigateTo();
    } else {
      // For single/zero outcomes, pick group[0] and resolve from store directly.
      const group = rewardGroups.length > 0 ? rewardGroups[0] : undefined;
      const newId = addFromTemplate({
        name,
        description,
        value: [],
        templateId: action.docTemplateId,
        docId: action.docId,
        rewardGroup: group,
        storedPrerequisites: storedPrereqs.length ? storedPrereqs : undefined,
      });
      // Enqueue Item/Perk and Companion rewards as annotation interactions.
      const doc = useJumpDocStore.getState().doc;
      if (doc) {
        const purchaseRewards = (group?.rewards ?? []).filter(
          (r): r is Extract<typeof r, { type: RewardType.Item | RewardType.Perk }> =>
            r.type === RewardType.Item || r.type === RewardType.Perk,
        );
        const companionRewards = (group?.rewards ?? []).filter(
          (r): r is Extract<typeof r, { type: RewardType.Companion }> =>
            r.type === RewardType.Companion,
        );
        const batches = [
          ...buildScenarioRewardActions(purchaseRewards, doc, action.docId),
          ...buildScenarioCompanionRewardActions(companionRewards, doc, action.docId),
        ];
        if (batches.length > 0) useViewerActionStore.getState().enqueueActions(batches);
      }
      navigateTo(String(newId));
    }
  };

  const Preview: AnnotationInteraction["Preview"] = ({ onClose }) => (
    <ScenarioInteractionPreview
      action={action}
      existingId={existingId}
      addFromTemplate={addFromTemplate}
      storedPrereqs={storedPrereqs}
      remove={remove}
      navigateTo={navigateTo}
      onClose={onClose}
    />
  );

  return {
    name: action.name,
    typeName: action.typeName,
    color: "#a855f7",
    forcePreview: existingId === undefined && (rewardGroups.length > 1 || tags.length > 0),
    executeDefault: () => doExecute(action.template.name, action.template.description ?? ""),
    Preview,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawback / Scenario interaction builder (shared)
// ─────────────────────────────────────────────────────────────────────────────

function buildDocItemInteraction(
  action: DocItemAction,
  currencies: Registry<LID.Currency, Currency> | undefined,
  addFromTemplate: (data: {
    name: string;
    description: string;
    value: Value;
    templateId: never;
    docId: string;
    initialCost?: ModifiedCost;
    alternativeCosts?: StoredAlternativeCost[];
    storedPrerequisites?: StoredPurchasePrerequisite[];
  }) => Id<GID.Purchase>,
  remove: (id: Id<GID.Purchase>) => void,
  findByTemplate: (docId: string, templateId: never) => Id<GID.Purchase> | undefined,
  countByTemplate: (docId: string, templateId: never) => number,
  navigateTo: (scrollTo?: string) => void,
  forceRemove: boolean,
  origins?: Record<number, Origin[]> | null,
  originCategories?: Registry<LID.OriginCategory, OriginCategory> | undefined,
  findPurchase?: (docId: string, id: Id<TID.Purchase>) => Id<GID.Purchase> | undefined,
  findDrawbackForPrereq?: (docId: string, id: Id<TID.Drawback>) => Id<GID.Purchase> | undefined,
): AnnotationInteraction | null {
  const existingId =
    forceRemove || !action.template.allowMultiple
      ? findByTemplate(action.docId, action.docTemplateId as never)
      : undefined;
  if (forceRemove && existingId === undefined) return null;
  const tags = extractTags([action.template.name, action.template.description]);
  const accentColor = action.collection === "drawback" ? "#ef4444" : "#a855f7";

  // Alt cost logic (drawbacks only).
  const qualifyingMandatoryAltCost =
    action.collection === "drawback" && origins !== undefined
      ? (() => {
          const q = action.alternativeCosts.filter(
            (ac) =>
              ac.mandatory &&
              checkResolvedAltCostPrereqs(
                ac.prerequisites,
                action.docId,
                origins ?? null,
                originCategories,
                findPurchase ?? (() => undefined),
                findDrawbackForPrereq ?? (() => undefined),
              ),
          );
          if (!q.length) return undefined;
          return q.find((ac) => ac.value.every((v) => v.amount === 0)) ?? q[0]!;
        })()
      : undefined;

  const effectiveCostStr =
    existingId === undefined && qualifyingMandatoryAltCost
      ? `${altCostValueStr(qualifyingMandatoryAltCost.value)} ; altered`
      : undefined;

  const storedAltCosts =
    action.collection === "drawback"
      ? resolveAltCostsToStorage(action.alternativeCosts, action.docId, currencies)
      : [];

  const storedPrereqs =
    action.collection === "drawback"
      ? resolvePrereqsToStorage(action.prerequisites, action.docId)
      : [];

  // Prerequisite check for drawbacks: block add if any prereq is unmet.
  if (action.collection === "drawback" && !existingId && action.prerequisites.length > 0) {
    const unmet = getUnmetPrereqs(
      action.prerequisites,
      action.docId,
      findPurchase ?? (() => undefined),
      findDrawbackForPrereq ?? (() => undefined),
    );
    if (unmet.length > 0) {
      const missing = unmet.filter((p) => p.positive).map((p) => p.name);
      const incompatible = unmet.filter((p) => !p.positive).map((p) => p.name);
      const parts: string[] = [];
      if (missing.length) parts.push(`Requires: ${missing.join(", ")}`);
      if (incompatible.length) parts.push(`Incompatible with: ${incompatible.join(", ")}`);
      const errorMsg = parts.join(" · ");
      const PreviewErr: AnnotationInteraction["Preview"] = ({ onClose }) => (
        <InteractionPreviewCard
          typeName={action.typeName}
          name={action.name}
          accentColor={accentColor}
          costStr={action.costStr}
          errorMessage={errorMsg}
          actions={[]}
          onClose={onClose}
        />
      );
      return {
        name: action.name,
        typeName: action.typeName,
        color: accentColor,
        forcePreview: true,
        executeDefault: () => {},
        Preview: PreviewErr,
      };
    }
  }

  const doExecute = (name: string, description: string) => {
    if (existingId !== undefined) {
      remove(existingId);
      navigateTo();
    } else {
      const cost = "cost" in action ? action.cost : [];
      const value: Value = cost.map(({ amount, currencyAbbrev }) => ({
        amount,
        currency: resolveJumpCurrency(currencyAbbrev, currencies),
      }));

      let initialCost: ModifiedCost | undefined;
      if (qualifyingMandatoryAltCost) {
        const resolvedValue: Value = qualifyingMandatoryAltCost.value.map(
          ({ amount, currencyAbbrev }) => ({
            amount,
            currency: resolveJumpCurrency(currencyAbbrev, currencies),
          }),
        );
        initialCost = { modifier: CostModifier.Custom, modifiedTo: resolvedValue };
      }

      // For drawback capstone boosters: resolve which currently-held purchases gain booster text.
      const boosts =
        action.collection === "drawback" && action.isBoosterFor.length > 0
          ? action.isBoosterFor.flatMap(({ templateId, description: boostDesc }) => {
              const pId = findPurchase?.(action.docId, templateId);
              return pId !== undefined ? [{ purchaseId: pId, description: boostDesc }] : [];
            })
          : undefined;

      const newId = addFromTemplate({
        name,
        description,
        value,
        templateId: action.docTemplateId as never,
        docId: action.docId,
        initialCost,
        alternativeCosts: storedAltCosts.length ? storedAltCosts : undefined,
        storedPrerequisites: storedPrereqs.length ? storedPrereqs : undefined,
        ...(boosts?.length ? { boosts } : {}),
      });
      navigateTo(String(newId));
    }
  };

  // For allowMultiple drawbacks, find an existing copy to offer as removal target.
  const existingCount =
    action.collection === "drawback" && action.template.allowMultiple
      ? countByTemplate(action.docId, action.docTemplateId as never)
      : 0;
  const removeId =
    existingCount > 0 ? findByTemplate(action.docId, action.docTemplateId as never) : undefined;

  const doRemoveCopy = () => {
    if (removeId !== undefined) {
      remove(removeId);
      navigateTo();
    }
  };

  const Preview: AnnotationInteraction["Preview"] = ({ onClose }) => (
    <DocItemInteractionPreview
      action={action}
      existingId={existingId}
      removeId={removeId}
      copyCount={existingCount}
      accentColor={accentColor}
      effectiveCostStr={effectiveCostStr}
      onExecute={doExecute}
      onRemove={doRemoveCopy}
      onClose={onClose}
    />
  );

  return {
    name: action.name,
    typeName: action.typeName,
    color: accentColor,
    forcePreview: existingId === undefined && (tags.length > 0 || existingCount > 0),
    executeDefault: () => doExecute(action.template.name, action.template.description),
    Preview,
  };
}

function buildCompanionInteraction(
  action: CompanionAction,
  selfCharId: Id<GID.Character>,
  jumpId: Id<GID.Jump>,
  origins: Record<Id<LID.OriginCategory>, Origin[]> | null,
  originCategories: Registry<LID.OriginCategory, OriginCategory> | undefined,
  currencies: Registry<LID.Currency, Currency> | undefined,
  budget: Budget | undefined,
  addFromTemplate: ReturnType<typeof useJumpDocCompanionActions>["addFromTemplate"],
  remove: ReturnType<typeof useJumpDocCompanionActions>["remove"],
  findByTemplate: ReturnType<typeof useJumpDocCompanionActions>["findByTemplate"],
  findPurchase: ReturnType<typeof useJumpDocPurchaseActions>["findByTemplate"],
  findDrawback: ReturnType<typeof useJumpDocDrawbackActions>["findByTemplate"],
  navigateTo: (follower: boolean) => (scrollTo?: string) => void,
  forceRemove: boolean,
): AnnotationInteraction | null {
  // Specific-character imports are unique — look up whether one already exists even without forceRemove.
  const existingId =
    forceRemove || action.template.specificCharacter
      ? findByTemplate(action.docId, action.docTemplateId)
      : undefined;
  if (forceRemove && existingId === undefined) return null;

  // Origin discount / access check (same logic as purchase interactions).
  const hasOriginMatch = action.originNames.some(({ categoryName, originName }) => {
    const categoryLid = resolveJumpOriginCategory(categoryName, originCategories);
    if (categoryLid === undefined) return false;
    return (origins?.[categoryLid] ?? []).some(
      (o) => o.summary === originName || o.templateName === originName,
    );
  });

  if (action.originBenefit === "access" && !hasOriginMatch) {
    return buildAccessDeniedInteraction(action, "#f59e0b");
  }

  // Mandatory alt cost check.
  const qualifyingMandatoryAltCost = (() => {
    const q = action.alternativeCosts.filter(
      (ac) =>
        ac.mandatory &&
        checkResolvedAltCostPrereqs(
          ac.prerequisites,
          action.docId,
          origins as Record<number, Origin[]> | null,
          originCategories,
          findPurchase,
          findDrawback,
        ),
    );
    if (!q.length) return undefined;
    return q.find((ac) => ac.value.every((v) => v.amount === 0)) ?? q[0]!;
  })();

  const qualifyingOptionalAltCosts = action.alternativeCosts.filter((ac) => {
    if (ac.mandatory) return false;
    if (
      !checkResolvedAltCostPrereqs(
        ac.prerequisites,
        action.docId,
        origins as Record<number, Origin[]> | null,
        originCategories,
        findPurchase,
        findDrawback,
      )
    )
      return false;
    if (currencies && budget) {
      for (const v of ac.value) {
        if (v.amount === 0) continue;
        const abbrev = v.currencyAbbrev;
        for (const [idStr, c] of Object.entries(currencies.O) as [string, Currency | undefined][]) {
          if (c?.abbrev !== abbrev) continue;
          const currId = createId<LID.Currency>(+idStr);
          if (c.hidden && (budget.currency[currId] ?? 0) <= 0) {
            const hasCompanionStipend =
              budget.companionStipend.currency === currId && budget.companionStipend.amount > 0;
            if (!hasCompanionStipend) return false;
          }
          break;
        }
      }
    }
    return true;
  });

  const storedAltCosts = resolveAltCostsToStorage(
    action.alternativeCosts,
    action.docId,
    currencies,
  );

  const Preview: AnnotationInteraction["Preview"] = ({ onClose }) => (
    <CompanionInteractionPreview
      action={action}
      selfCharId={selfCharId}
      jumpId={jumpId}
      existingId={existingId}
      currencies={currencies}
      hasOriginDiscount={hasOriginMatch && action.originBenefit !== "access"}
      originBenefit={action.originBenefit}
      qualifyingMandatoryAltCost={qualifyingMandatoryAltCost}
      qualifyingOptionalAltCosts={qualifyingOptionalAltCosts}
      storedAltCosts={storedAltCosts}
      addFromTemplate={addFromTemplate}
      remove={remove}
      navigateTo={navigateTo}
      onClose={onClose}
    />
  );

  return {
    name: action.name,
    typeName: action.typeName,
    color: "#f59e0b",
    forcePreview: true,
    executeDefault: () => {},
    Preview,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency exchange interaction builder
// ─────────────────────────────────────────────────────────────────────────────

type CurrencyExchangeAction = Extract<ViewerAnnotationAction, { collection: "currency-exchange" }>;

function CurrencyExchangePreview({
  action,
  takenCount,
  currencies,
  addFromDoc,
  removeDocExchange,
  onClose,
}: {
  action: CurrencyExchangeAction;
  takenCount: number;
  currencies: Registry<LID.Currency, Currency> | undefined;
  addFromDoc: ReturnType<typeof useCurrencyExchanges>["addFromDoc"];
  removeDocExchange: ReturnType<typeof useCurrencyExchanges>["removeDocExchange"];
  onClose: () => void;
}) {
  const [count, setCount] = React.useState(takenCount);

  const commit = () => {
    const delta = count - takenCount;
    const oCurrency = resolveJumpCurrency(action.oCurrencyAbbrev, currencies);
    const tCurrency = resolveJumpCurrency(action.tCurrencyAbbrev, currencies);

    if (delta > 0) {
      for (let i = 0; i < delta; i++) {
        addFromDoc({
          templateIndex: action.docExchangeIndex,
          oCurrency,
          tCurrency,
          oamount: action.oamount,
          tamount: action.tamount,
        });
      }
    } else if (delta < 0) {
      for (let i = 0; i < -delta; i++) {
        removeDocExchange({
          templateIndex: action.docExchangeIndex,
          oCurrency,
          tCurrency,
          oamount: action.oamount,
          tamount: action.tamount,
        });
      }
    }
    onClose();
  };

  const accentColor = count < takenCount ? "#ef4444" : count > takenCount ? "#22c55e" : "#f97316";

  return (
    <InteractionPreviewCard
      typeName={action.typeName}
      name={action.name}
      accentColor={accentColor}
      description={`Trade ${action.oamount} ${action.oCurrencyAbbrev} for ${action.tamount} ${action.tCurrencyAbbrev}`}
      actions={[
        { label: "Apply", variant: count < takenCount ? "danger" : "confirm", onConfirm: commit },
      ]}
      onClose={onClose}
    >
      <div className="px-2 pb-2 flex items-center gap-3">
        <span className="text-xs text-muted">Times taken:</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCount((n) => Math.max(0, n - 1))}
            className="w-6 h-6 flex items-center justify-center rounded border border-edge text-sm hover:bg-accent/10 transition-colors"
          >
            −
          </button>
          <span className="w-8 text-center text-sm tabular-nums">{count}</span>
          <button
            type="button"
            onClick={() => setCount((n) => n + 1)}
            className="w-6 h-6 flex items-center justify-center rounded border border-edge text-sm hover:bg-accent/10 transition-colors"
          >
            +
          </button>
        </div>
        {takenCount > 0 && <span className="text-xs text-ghost">({takenCount} already taken)</span>}
      </div>
    </InteractionPreviewCard>
  );
}

function buildCurrencyExchangeInteraction(
  action: CurrencyExchangeAction,
  exchanges: CurrencyExchange[],
  currencies: Registry<LID.Currency, Currency> | undefined,
  addFromDoc: ReturnType<typeof useCurrencyExchanges>["addFromDoc"],
  removeDocExchange: ReturnType<typeof useCurrencyExchanges>["removeDocExchange"],
): AnnotationInteraction {
  const takenCount = exchanges
    .filter((e) => e.templateIndex === action.docExchangeIndex)
    .reduce((n, ex) => n + Math.floor(ex.oamount / action.oamount), 0);

  const Preview: AnnotationInteraction["Preview"] = ({ onClose }) => (
    <CurrencyExchangePreview
      action={action}
      takenCount={takenCount}
      currencies={currencies}
      addFromDoc={addFromDoc}
      removeDocExchange={removeDocExchange}
      onClose={onClose}
    />
  );

  return {
    name: action.name,
    typeName: action.typeName,
    color: "#f97316",
    forcePreview: true,
    executeDefault: () => {},
    Preview,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialog wrapper (shown inside SweetAlert2)
// ─────────────────────────────────────────────────────────────────────────────

function InteractionDialog({
  interactions,
  onClose,
}: {
  interactions: AnnotationInteraction[];
  onClose: () => void;
}) {
  let [activeIndex, setActiveIndex] = useState(0);
  let Preview = interactions[activeIndex].Preview;
  return (
    <div className="bg-surface rounded-xl border border-edge shadow-xl text-left w-max max-w-[90vw] md:max-w-[70vw] lg:max-w-[60vw] justify-items-center overflow-visible">
      {interactions.length > 1 && (
        <>
          <p className="px-4 pt-3 pb-2 text-sm font-semibold text-ink border-b border-edge">
            Multiple options — choose one:
          </p>
          <div className="flex flex-row flex-wrap justify-center gap-1 mx-2 mt-2 max-w-100">
            {interactions.map(({ name }, i) => (
              <button
                onClick={() => setActiveIndex(i)}
                className={`text-xs px-2 py-0.5 rounded-full border ${i == activeIndex ? "bg-accent2-tint text-accent2 border-accent2-ring" : "text-muted border-transparent hover:text-ink hover:border-edge hover:bg-tint"}`}
              >
                {stripTemplating(name)}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="flex flex-col max-w-120 w-full">
        <Preview key={activeIndex} onClose={onClose} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler component (renders null; mounts in JumpLayout)
// ─────────────────────────────────────────────────────────────────────────────

export type AnnotationInteractionHandlerProps = {
  jumpId: Id<GID.Jump>;
  charId: Id<GID.Character>;
  routeParams: RouteParams;
};

export function AnnotationInteractionHandler({
  jumpId,
  charId,
  routeParams,
}: AnnotationInteractionHandlerProps) {
  const pendingAction = useViewerActionStore((s) => s.pendingAction);
  const forceRemove = useViewerActionStore((s) => s.forceRemove);
  const setPendingAction = useViewerActionStore((s) => s.setPendingAction);
  const pendingNewCompanion = useViewerActionStore((s) => s.pendingNewCompanion);
  const setPendingNewCompanion = useViewerActionStore((s) => s.setPendingNewCompanion);
  const activeTargetCharId = useViewerActionStore((s) => s.activeTargetCharId);
  const dequeueNext = useViewerActionStore((s) => s.dequeueNext);

  // When a freebie batch is active, route all annotation actions to the companion character.
  const effectiveCharId = activeTargetCharId ?? charId;

  const { origins, setOrigins } = useJumpOrigins(jumpId, effectiveCharId);
  const originCategories = useJumpOriginCategories(jumpId);
  const currencies = useJumpCurrencies(jumpId);
  const budget = useBudget(effectiveCharId, jumpId);
  const purchaseSubtypes = usePurchaseSubtypes(jumpId);
  const {
    addFromTemplate,
    removePurchase,
    findByTemplate,
    countByTemplate,
    getModifiersUpdater,
    findReverseIncompatibilities,
  } = useJumpDocPurchaseActions(jumpId, effectiveCharId);
  const {
    addFromTemplate: addDrawback,
    remove: removeDrawback,
    findByTemplate: findDrawback,
    countByTemplate: countDrawbackByTemplate,
  } = useJumpDocDrawbackActions(jumpId, effectiveCharId);
  const {
    addFromTemplate: addScenario,
    remove: removeScenario,
    findByTemplate: findScenario,
  } = useJumpDocScenarioActions(jumpId, effectiveCharId);
  // Companion imports always attach to the player character, even when processing freebies.
  const {
    addFromTemplate: addCompanion,
    remove: removeCompanion,
    findByTemplate: findCompanion,
  } = useJumpDocCompanionActions(jumpId, charId);
  const { exchanges, addFromDoc, removeDocExchange } = useCurrencyExchanges(jumpId, charId);
  const navigate = useNavigate();

  // Refs so the effect closure always reads the latest values without re-firing.
  const originsRef = useRef(origins);
  originsRef.current = origins;
  const categoriesRef = useRef(originCategories);
  categoriesRef.current = originCategories;
  const currenciesRef = useRef(currencies);
  currenciesRef.current = currencies;
  const budgetRef = useRef(budget);
  budgetRef.current = budget;
  const setOriginsRef = useRef(setOrigins);
  setOriginsRef.current = setOrigins;
  const purchaseSubtypesRef = useRef(purchaseSubtypes);
  purchaseSubtypesRef.current = purchaseSubtypes;
  const addFromTemplateRef = useRef(addFromTemplate);
  addFromTemplateRef.current = addFromTemplate;
  const removePurchaseRef = useRef(removePurchase);
  removePurchaseRef.current = removePurchase;
  const findByTemplateRef = useRef(findByTemplate);
  findByTemplateRef.current = findByTemplate;
  const countByTemplateRef = useRef(countByTemplate);
  countByTemplateRef.current = countByTemplate;
  const findReverseIncompatibilitiesRef = useRef(findReverseIncompatibilities);
  findReverseIncompatibilitiesRef.current = findReverseIncompatibilities;
  const getModifiersUpdaterRef = useRef(getModifiersUpdater);
  getModifiersUpdaterRef.current = getModifiersUpdater;
  const addDrawbackRef = useRef(addDrawback);
  addDrawbackRef.current = addDrawback;
  const removeDrawbackRef = useRef(removeDrawback);
  removeDrawbackRef.current = removeDrawback;
  const findDrawbackRef = useRef(findDrawback);
  findDrawbackRef.current = findDrawback;
  const countDrawbackByTemplateRef = useRef(countDrawbackByTemplate);
  countDrawbackByTemplateRef.current = countDrawbackByTemplate;
  const addScenarioRef = useRef(addScenario);
  addScenarioRef.current = addScenario;
  const removeScenarioRef = useRef(removeScenario);
  removeScenarioRef.current = removeScenario;
  const findScenarioRef = useRef(findScenario);
  findScenarioRef.current = findScenario;
  const addCompanionRef = useRef(addCompanion);
  addCompanionRef.current = addCompanion;
  const removeCompanionRef = useRef(removeCompanion);
  removeCompanionRef.current = removeCompanion;
  const findCompanionRef = useRef(findCompanion);
  findCompanionRef.current = findCompanion;
  const exchangesRef = useRef(exchanges);
  exchangesRef.current = exchanges;
  const addFromDocRef = useRef(addFromDoc);
  addFromDocRef.current = addFromDoc;
  const removeDocExchangeRef = useRef(removeDocExchange);
  removeDocExchangeRef.current = removeDocExchange;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const routeParamsRef = useRef(routeParams);
  routeParamsRef.current = routeParams;
  const forceRemoveRef = useRef(forceRemove);
  forceRemoveRef.current = forceRemove;
  const effectiveCharIdRef = useRef(effectiveCharId);
  effectiveCharIdRef.current = effectiveCharId;
  const dequeueNextRef = useRef(dequeueNext);
  dequeueNextRef.current = dequeueNext;

  useEffect(() => {
    if (!pendingAction?.length) return;

    // Build interactions from the pending actions.
    const origins = originsRef.current as Record<number, Origin[]> | null;
    const categories = categoriesRef.current;
    const currencies = currenciesRef.current;
    const fr = forceRemoveRef.current;

    // Pre-collect origin and origin-option actions so they can be combined or
    // pooled before the main flatMap processes everything else in order.
    type OriginOptionAction = Extract<ViewerAnnotationAction, { collection: "origin-option" }>;
    const originActions: OriginAction[] = [];
    const originOptionActions: OriginOptionAction[] = [];
    for (const action of pendingAction) {
      if (action.collection === "origin") originActions.push(action);
      else if (action.collection === "origin-option") originOptionActions.push(action);
    }

    // Decide the combined rendering strategy:
    //  • 1 origin + options   → 1 combined card (origin info + option groups)
    //  • N≥2 origins + options → N combined cards as tabs (each origin + same option groups)
    //  • 0 origins + ≥2 options → 1 pooled card (grouped by category)
    //  • everything else → handled per-action in the flatMap below
    const hasOptions = originOptionActions.length > 0;
    const singleOriginWithOptions = originActions.length === 1 && hasOptions;
    const multiOriginWithOptions = originActions.length >= 2 && hasOptions;
    const pureOptionPool = originActions.length === 0 && originOptionActions.length >= 2;

    const sharedArgs = [
      origins,
      categories,
      currencies,
      purchaseSubtypesRef.current,
      jumpId,
      effectiveCharIdRef.current,
      setOriginsRef.current,
      getModifiersUpdaterRef.current,
      navigateRef.current,
      routeParamsRef.current,
      fr,
    ] as const;

    // For N≥2 origins + options: build one combined interaction per origin up front.
    const multiOriginResults: AnnotationInteraction[] = multiOriginWithOptions
      ? originActions.flatMap((oa) => {
          const r = buildCombinedOriginWithOptionsInteraction(
            oa,
            originOptionActions,
            ...sharedArgs,
          );
          return r ? [r] : [];
        })
      : [];

    // For 1 origin + options or pure option pool: a single group result.
    let groupResult: AnnotationInteraction | null = null;
    if (singleOriginWithOptions) {
      groupResult = buildCombinedOriginWithOptionsInteraction(
        originActions[0]!,
        originOptionActions,
        ...sharedArgs,
      );
    } else if (pureOptionPool) {
      groupResult = buildPooledOriginOptionInteraction(
        originOptionActions,
        origins,
        categories,
        currencies,
        setOriginsRef.current,
        navigateRef.current,
        routeParamsRef.current,
        fr,
      );
    }

    let groupInserted = false;
    let multiInserted = false;

    const interactions: AnnotationInteraction[] = pendingAction.flatMap((action) => {
      let result: AnnotationInteraction | null = null;
      if (action.collection === "origin") {
        if (singleOriginWithOptions) {
          if (!groupInserted) {
            groupInserted = true;
            return groupResult ? [groupResult] : [];
          }
          return [];
        }
        if (multiOriginWithOptions) {
          // Insert all combined-origin cards at the first origin's position.
          if (!multiInserted) {
            multiInserted = true;
            return multiOriginResults;
          }
          return [];
        }
        result = buildOriginInteraction(
          action,
          origins,
          categories,
          currencies,
          purchaseSubtypesRef.current,
          jumpId,
          charId,
          setOriginsRef.current,
          getModifiersUpdaterRef.current,
          navigateRef.current,
          routeParamsRef.current,
          fr,
        );
      } else if (action.collection === "origin-randomizer")
        result = buildOriginRandomizerInteraction(
          action,
          origins,
          categories,
          currencies,
          purchaseSubtypesRef.current,
          jumpId,
          charId,
          setOriginsRef.current,
          navigateRef.current,
          routeParamsRef.current,
          fr,
        );
      else if (action.collection === "origin-option") {
        // Options are always embedded in origin cards when any origin is present.
        if (singleOriginWithOptions || multiOriginWithOptions) return [];
        if (groupResult !== null) {
          // Insert pooled card at the first option's position; skip the rest.
          if (!groupInserted) {
            groupInserted = true;
            return [groupResult];
          }
          return [];
        }
        // Single option with no pooling — handle individually.
        result = buildOriginOptionInteraction(
          action,
          origins,
          categories,
          currencies,
          setOriginsRef.current,
          navigateRef.current,
          routeParamsRef.current,
          fr,
        );
      } else if (action.collection === "purchase")
        result = buildPurchaseInteraction(
          action,
          originsRef.current as Record<number, Origin[]> | null,
          categoriesRef.current,
          purchaseSubtypesRef.current,
          currenciesRef.current,
          budgetRef.current,
          addFromTemplateRef.current,
          removePurchaseRef.current,
          findByTemplateRef.current,
          countByTemplateRef.current,
          findDrawbackRef.current,
          navigateRef.current,
          routeParamsRef.current,
          fr,
          findReverseIncompatibilitiesRef.current,
        );
      else if (action.collection === "drawback") {
        const rp = routeParamsRef.current;
        result = buildDocItemInteraction(
          action,
          currenciesRef.current,
          addDrawbackRef.current as never,
          removeDrawbackRef.current,
          findDrawbackRef.current as never,
          countDrawbackByTemplateRef.current as never,
          (scrollTo) =>
            navigateRef.current({
              to: "/chain/$chainId/char/$charId/jump/$jumpId/drawbacks",
              params: rp,
              search: { scrollTo },
            }),
          fr,
          originsRef.current as Record<number, Origin[]> | null,
          categoriesRef.current,
          findByTemplateRef.current,
          findDrawbackRef.current,
        );
      } else if (action.collection === "scenario") {
        const rp = routeParamsRef.current;
        result = buildScenarioInteraction(
          action,
          addScenarioRef.current,
          removeScenarioRef.current,
          findScenarioRef.current,
          (scrollTo) =>
            navigateRef.current({
              to: "/chain/$chainId/char/$charId/jump/$jumpId/drawbacks",
              params: rp,
              search: { scrollTo },
            }),
          fr,
          findByTemplateRef.current,
          findDrawbackRef.current,
        );
      } else if (action.collection === "currency-exchange") {
        result = buildCurrencyExchangeInteraction(
          action,
          exchangesRef.current,
          currenciesRef.current,
          addFromDocRef.current,
          removeDocExchangeRef.current,
        );
      } else if (action.collection === "companion") {
        const rp = routeParamsRef.current;
        result = buildCompanionInteraction(
          action,
          charId,
          jumpId,
          originsRef.current as Record<number, Origin[]> | null,
          categoriesRef.current,
          currenciesRef.current,
          budgetRef.current,
          addCompanionRef.current,
          removeCompanionRef.current,
          findCompanionRef.current,
          findByTemplateRef.current,
          findDrawbackRef.current,
          (follower) => (scrollTo) =>
            navigateRef.current({
              to: follower
                ? "/chain/$chainId/char/$charId/jump/$jumpId/purchases"
                : "/chain/$chainId/char/$charId/jump/$jumpId/companions",
              params: rp,
              search: scrollTo ? { scrollTo } : undefined,
            }),
          fr,
        );
      }
      return result ? [result] : [];
    });

    // Clear the store immediately to avoid double-handling.
    setPendingAction(null);

    if (interactions.length === 0) return;

    // Origin-option interactions always appear last in the tab list.
    interactions.sort((a, b) => (a.isOriginOption ? 1 : 0) - (b.isOriginOption ? 1 : 0));

    // Filter out error-state interactions when non-error ones are also present.
    const nonErrorInteractions = interactions.filter((i) => !i.isError);
    const visibleInteractions =
      nonErrorInteractions.length > 0 && nonErrorInteractions.length < interactions.length
        ? nonErrorInteractions
        : interactions;

    // Single action with no required preview: execute immediately, then advance the queue.
    if (visibleInteractions.length === 1 && !visibleInteractions[0]!.forcePreview) {
      visibleInteractions[0]!.executeDefault();
      dequeueNextRef.current();
      return;
    }

    // Show the SweetAlert2 popup (always in the main window).
    MySwal.close();
    MySwal.fire({
      html: <InteractionDialog interactions={visibleInteractions} onClose={() => MySwal.close()} />,
      showConfirmButton: false,
      showCancelButton: false,
      allowOutsideClick: true,
      allowEscapeKey: true,
      padding: 0,
      background: "transparent",
      backdrop: true,
      didClose: () => dequeueNextRef.current(),
      customClass: {
        popup: "!bg-transparent !shadow-none !border-0 !p-0 !overflow-visible !w-auto !max-w-none",
        htmlContainer: "!m-0 !p-0 !overflow-visible",
        container: "!p-4",
      },
    });
  }, [pendingAction]); // eslint-disable-line react-hooks/exhaustive-deps

  if (pendingNewCompanion) {
    return (
      <NewCompanionModal
        onDone={(newCharId) => {
          pendingNewCompanion.onDone(newCharId);
          setPendingNewCompanion(null);
        }}
        onCancel={() => {
          pendingNewCompanion.onCancel();
          setPendingNewCompanion(null);
        }}
      />
    );
  }

  return null;
}
