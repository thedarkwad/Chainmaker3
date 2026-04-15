/**
 * Shared store for annotation interactions from JumpDocViewer.
 *
 * The viewer (which may be in a pop-out portal) writes a pending action when
 * the user clicks an annotation. Components in the main window subscribe and
 * react accordingly. Using a Zustand store makes this agnostic to whether the
 * viewer is inline or popped out — both contexts share the same JS module.
 */

import { create } from "zustand";
import type {
  BasicPurchaseTemplate,
  CompanionTemplate,
  DrawbackTemplate,
  FreeFormOrigin,
  OriginTemplate,
  ScenarioTemplate,
} from "@/chain/data/JumpDoc";
import type { SimpleValue } from "@/chain/data/Purchase";
import type { GID, Id, TID } from "@/chain/data/types";

export type ResolvedAltCostPrereq =
  | { type: "origin"; categoryName: string; originName: string }
  | { type: "drawback"; templateId: Id<TID.Drawback> }
  | { type: "purchase"; templateId: Id<TID.Purchase> };

/** A prerequisite resolved from a PurchaseTemplate, for display and add-time checking. */
export type ResolvedPrerequisite =
  | { type: "purchase"; templateId: Id<TID.Purchase>; positive: boolean; name: string }
  | { type: "drawback"; templateId: Id<TID.Drawback>; positive: boolean; name: string }
  | { type: "scenario"; templateId: Id<TID.Scenario>; positive: boolean; name: string };

export type ResolvedAltCost = {
  value: { amount: number; currencyAbbrev: string }[];
  prerequisites: ResolvedAltCostPrereq[];
  mandatory: boolean;
  beforeDiscounts?: boolean;
};

/** Fields shared by every annotation action. */
type BaseAction = {
  /** publicUid of the JumpDoc this annotation belongs to. */
  docId: string;
  /** Numeric key within the collection registry. */
  itemId: number;
  /** Human-readable annotation name. */
  name: string;
  /** Human-readable type label (e.g. category name, subtype name). */
  typeName: string;
  /** Formatted cost string for display. */
  costStr: string;
};

export type ViewerAnnotationAction =
  | (BaseAction & {
      collection: "origin";
      /** TID.OriginCategory — equals LID.OriginCategory in the linked chain jump. */
      categoryId: Id<TID.OriginCategory>;
      /** max from the JumpDoc originCategory; undefined = unlimited. */
      docCategoryMax: number | undefined;
      /** Raw template data used to construct the Origin on commit. */
      template: Omit<OriginTemplate, "bounds">;
      /** Abbrev of the JumpDoc currency, used to match against the jump's currencies. */
      docCurrencyAbbrev: string;
      /** Purchase templates in this doc that receive a 50% discount when this origin is held. */
      discountedPurchaseTemplateIds: Id<TID.Purchase>[];
      /** Pre-resolved origin stipend entries (currency abbrev + subtype name + amount). */
      resolvedOriginStipend: { currencyAbbrev: string; subtypeName: string; amount: number }[];
      /** Origins (by name + category) that trigger a synergy benefit on THIS origin (OR: any one). */
      synergyOriginNames: { categoryName: string; originName: string }[];
      /** How a qualifying synergy origin affects this origin's cost or access. */
      synergyBenefit: "discounted" | "free" | "access" | undefined;
    })
  | (BaseAction & {
      collection: "origin-option";
      /** TID.OriginCategory — equals LID.OriginCategory in the linked chain jump. */
      categoryId: Id<TID.OriginCategory>;
      /** Index into the category's options array. */
      optionIndex: number;
      /** Raw option data used to construct the Origin on commit. */
      option: Omit<FreeFormOrigin, "bounds">;
      /** Abbrev of the JumpDoc currency, used to match against the jump's currencies. */
      docCurrencyAbbrev: string;
    })
  | (BaseAction & {
      collection: "origin-randomizer";
      /** TID.OriginCategory — equals LID.OriginCategory in the linked chain jump. */
      categoryId: Id<TID.OriginCategory>;
      /** Raw category name used to resolve the LID in the jump (typeName includes " (Randomizer)" suffix). */
      categoryName: string;
      /** max from the JumpDoc originCategory; undefined = unlimited. */
      docCategoryMax: number | undefined;
      /** Cost of the randomizer roll (TID currency — resolved by abbrev at handler time). */
      cost: SimpleValue<TID.Currency>;
      /** Abbrev of the JumpDoc currency, used to match against the jump's currencies. */
      docCurrencyAbbrev: string;
      /** All origin templates for this category, used to pick one randomly at execute time.
       *  Each template is extended with a pre-resolved stipend array for chain-side use. */
      templates: (Omit<OriginTemplate, "bounds"> & {
        resolvedOriginStipend: { currencyAbbrev: string; subtypeName: string; amount: number }[];
      })[];
    })
  | (BaseAction & {
      collection: "purchase";
      /** TID key of the template in the JumpDoc's availablePurchases registry. */
      docTemplateId: Id<TID.Purchase>;
      /** max from the JumpDoc originCategory; undefined = unlimited. */
      docCategoryMax: number | undefined;
      /** Full template without bounds. */
      template: Omit<BasicPurchaseTemplate, "bounds">;
      /** Pre-resolved cost with currency abbrevs (avoids TID→LID issues at dispatch time). */
      cost: { amount: number; currencyAbbrev: string }[];
      /** Name of the purchase subtype, used to resolve to LID in the handler. */
      subtypeName: string;
      /**
       * Origins that give an origin discount on this purchase, grouped by their
       * category name so the handler can verify the user holds the origin in the
       * correct category (not a same-named origin from a different category).
       * Pre-resolved from TID at dispatch time so no JumpDoc lookup is needed
       * in the handler.
       */
      originNames: { categoryName: string; originName: string }[];
      /** How a qualifying origin affects this purchase: discounts it, makes it free, or restricts it to origin holders only. */
      originBenefit: "discounted" | "free" | "access" | undefined;
      /**
       * Other purchase templates in this JumpDoc that are boosted by this purchase.
       * Pre-resolved at dispatch time so the handler can apply description side effects.
       */
      isBoosterFor: { templateId: Id<TID.Purchase>; description: string }[];
      /** Pre-resolved alternative costs with currency abbrevs and resolved prereq names. */
      alternativeCosts: ResolvedAltCost[];
      /** Pre-resolved prerequisites (requires / incompatible). */
      prerequisites: ResolvedPrerequisite[];
    })
  | (BaseAction & {
      collection: "drawback";
      docTemplateId: Id<TID.Drawback>;
      template: Omit<DrawbackTemplate, "bounds">;
      cost: { amount: number; currencyAbbrev: string }[];
      /** Pre-resolved alternative costs. */
      alternativeCosts: ResolvedAltCost[];
      /** Pre-resolved prerequisites (requires / incompatible). */
      prerequisites: ResolvedPrerequisite[];
      /**
       * Other purchase templates in this JumpDoc that are boosted by this drawback.
       * Only populated when the drawback's capstoneBooster flag is true.
       */
      isBoosterFor: { templateId: Id<TID.Purchase>; description: string }[];
    })
  | (BaseAction & {
      collection: "scenario";
      docTemplateId: Id<TID.Scenario>;
      template: Omit<ScenarioTemplate, "bounds">;
      /** Pre-resolved prerequisites (requires / incompatible). */
      prerequisites: ResolvedPrerequisite[];
    })
  | (BaseAction & {
      collection: "companion";
      docTemplateId: Id<TID.Companion>;
      template: Omit<CompanionTemplate, "bounds">;
      cost: { amount: number; currencyAbbrev: string }[];
      /** Pre-resolved allowances: one entry per currency with a non-zero amount. */
      allowances: { currencyAbbrev: string; amount: number }[];
      /** Pre-resolved stipend: one entry per (currency, subtype) with a non-zero amount. */
      stipend: { currencyAbbrev: string; subtypeName: string; amount: number }[];
      /** Origins that give a discount or restrict access to this companion import. */
      originNames: { categoryName: string; originName: string }[];
      /** How a qualifying origin affects this import. */
      originBenefit: "discounted" | "free" | "access" | undefined;
      /** Pre-resolved alternative costs (mandatory only applied). */
      alternativeCosts: ResolvedAltCost[];
    })
  | (BaseAction & {
      collection: "currency-exchange";
      /** Index into the JumpDoc's availableCurrencyExchanges array. */
      docExchangeIndex: number;
      oCurrencyAbbrev: string;
      tCurrencyAbbrev: string;
      oamount: number;
      tamount: number;
    });

/**
 * A batch of annotation actions to process in sequence.
 * Used by the freebie queue (and any future queued-event flows).
 */
export type QueuedAnnotationBatch = {
  actions: ViewerAnnotationAction[];
  /** When set, the handler routes this batch to the companion character instead of the player. */
  targetCharId?: Id<GID.Character>;
  /** When true, the handler should remove rather than add the matched item. */
  forceRemove?: boolean;
};

type ViewerActionState = {
  /** All annotations under the cursor at the time of the last click. */
  pendingAction: ViewerAnnotationAction[] | null;
  /**
   * When true the handler should remove the matched item rather than add it,
   * even if the annotation type supports multiples.
   * Set atomically with pendingAction via setPendingAction.
   */
  forceRemove: boolean;
  /** When true, always show the preview dialog even for single-action interactions. */
  forcePreview: boolean;
  setPendingAction: (action: ViewerAnnotationAction[] | null, forceRemove?: boolean, forcePreview?: boolean) => void;
  /** Queued batches waiting to be processed after the current pendingAction resolves. */
  actionQueue: QueuedAnnotationBatch[];
  /** The companion character currently being targeted by a queued freebie batch. Null when processing normal player actions. */
  activeTargetCharId: Id<GID.Character> | null;
  /**
   * Appends batches to the queue. If nothing is currently processing (pendingAction is null),
   * immediately dequeues and activates the first batch.
   */
  enqueueActions: (batches: QueuedAnnotationBatch[]) => void;
  /**
   * Advances to the next queued batch, or clears pendingAction if the queue is empty.
   * Called after each interaction resolves (immediate execute or dialog close).
   */
  dequeueNext: () => void;
  /**
   * Set by CompanionInteractionPreview (inside Swal's isolated React root) when the
   * user clicks "New Companion". AnnotationInteractionHandler (in the real React tree,
   * with all providers) reads this and renders NewCompanionModal.
   * onDone is called with the new character id once the modal is submitted.
   * onCancel is called when the modal is dismissed without creating a companion.
   */
  pendingNewCompanion: { onDone: (charId: Id<GID.Character>) => void; onCancel: () => void } | null;
  setPendingNewCompanion: (data: { onDone: (charId: Id<GID.Character>) => void; onCancel: () => void } | null) => void;
  /**
   * Registered by the jump layout when a JumpDoc is active.
   * Calling it pops the JumpDocViewer into a new window (or brings it back to the panel).
   * Null when no viewer is mounted.
   */
  popOutViewer: (() => void) | null;
  setPopOutViewer: (fn: (() => void) | null) => void;
};

export const useViewerActionStore = create<ViewerActionState>((set) => ({
  pendingAction: null,
  forceRemove: false,
  forcePreview: false,
  setPendingAction: (pendingAction, forceRemove = false, forcePreview = false) => set({ pendingAction, forceRemove, forcePreview }),
  pendingNewCompanion: null,
  setPendingNewCompanion: (pendingNewCompanion) => set({ pendingNewCompanion }),
  popOutViewer: null,
  setPopOutViewer: (popOutViewer) => set({ popOutViewer }),
  actionQueue: [],
  activeTargetCharId: null,
  enqueueActions: (batches) =>
    set((s) => {
      const newQueue = [...s.actionQueue, ...batches];
      if (s.pendingAction !== null || newQueue.length === 0) {
        return { actionQueue: newQueue };
      }
      const [first, ...rest] = newQueue;
      return {
        actionQueue: rest,
        pendingAction: first!.actions,
        forceRemove: first!.forceRemove ?? false,
        activeTargetCharId: first!.targetCharId ?? null,
      };
    }),
  dequeueNext: () =>
    set((s) => {
      if (s.actionQueue.length === 0) {
        return { pendingAction: null, forceRemove: false, activeTargetCharId: null };
      }
      const [first, ...rest] = s.actionQueue;
      return {
        actionQueue: rest,
        pendingAction: first!.actions,
        forceRemove: first!.forceRemove ?? false,
        activeTargetCharId: first!.targetCharId ?? null,
      };
    }),
}));
