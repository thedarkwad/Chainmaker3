import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import withReactContent from "sweetalert2-react-content";
import Swal from "sweetalert2";

import {
  GID,
  Id,
  PartialIndex,
  TID,
} from "../data/types";
import { setTracked, useChain, useCharacter, useUpdateStack } from "../state/hooks";
import { useChainStore } from "../state/Store";
import {
  JumpDocBuildData,
  useViewerActionStore,
} from "../state/ViewerActionStore";
import { Chain } from "../data/Chain";
import {
  BasicPurchase,
  CostModifier,
  Drawback,
  JumpPurchase,
  ModifiedCost,
  PurchaseType,
  Value,
} from "../data/Purchase";

import { InteractionDialog } from "../handlers/components/InteractionDialog";
import { useChainMutators } from "../handlers/mutators/useChainMutators";

// Listeners
import { createPrereqRemovalListener } from "../handlers/listeners/prereqRemovalListener";
import { createRepricePurchasesListener } from "../handlers/listeners/repricePurchasesListener";
import { createBoosterTextListener } from "../handlers/listeners/boosterTextListener";
import { createScenarioRewardListener } from "../handlers/listeners/scenarioRewardListener";
import { createOriginSynergyListener } from "../handlers/listeners/originSynergyListener";
import { createStipendListener } from "../handlers/listeners/stipendListener";
import { createDurationListener } from "../handlers/listeners/durationListener";
import { createReapplyTagsListener } from "../handlers/listeners/reapplyTagsListener";

// Types
import {
  AnnotationInteractionHandlerProps,
  ChainMutators
} from "../handlers/types";
import { JumpDoc } from "@/jumpdoc/data/JumpDoc";

// Re-exports
export type {
  InternalTagsMap,
  AnnotationInteractionHandlerProps,
  PossibleCost,
  ChainMutators,
  MutatorNavTarget,
} from "../handlers/types";

export { useJumpDocInternalTags } from "../handlers/utils";

// Interaction handlers re-exports
export { purchaseInteraction } from "../handlers/interactions/purchaseHandler";
export {
  originInteraction,
  randomizerInteraction,
} from "../handlers/interactions/originHandler";
export { companionImportInteraction } from "../handlers/interactions/companionHandler";
export { scenarioInteraction } from "../handlers/interactions/scenarioHandler";
export { currencyExchangeInteraction } from "../handlers/interactions/currencyExchangeHandler";

const MySwal = withReactContent(Swal);

function computeBuildData(
  chain: Chain,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  doc?: JumpDoc,
): JumpDocBuildData {
  let jump = chain.jumps.O[jumpId];

  let purchases: PartialIndex<TID.Purchase, GID.Purchase> = {};
  let drawbacks: PartialIndex<TID.Drawback, GID.Purchase> = {};
  let scenarios: PartialIndex<TID.Scenario, GID.Purchase> = {};
  let companionImports: PartialIndex<TID.Companion, GID.Purchase> = {};

  [
    ...(jump.purchases[charId] ?? []),
    ...(jump.drawbacks[charId] ?? []),
    ...(jump.scenarios[charId] ?? []),
  ]?.forEach(pId => {
    let purchase = chain.purchases.O[pId] as JumpPurchase<TID>;
    if (!purchase) return;
    let add = <A extends TID>(
      index: PartialIndex<A, GID.Purchase>,
      a: number,
      b: Id<GID.Purchase>,
    ) => {
      if (!index[a as Id<A>]) index[a as Id<A>] = [];
      if (purchase.cost.modifier == CostModifier.Free)
        index[a as Id<A>]!.unshift(b);
      else index[a as Id<A>]!.push(b);
    };
    if (purchase.template?.id !== undefined)
      switch (purchase.type) {
        case PurchaseType.Perk:
        case PurchaseType.Item:
          if ((purchase as BasicPurchase).follower)
            add(companionImports, purchase.template.id, purchase.id);
          else add(purchases, purchase.template.id, purchase.id);
          break;
        case PurchaseType.Companion:
          add(companionImports, purchase.template.id, purchase.id);
          break;
        case PurchaseType.Drawback:
          add(drawbacks, purchase.template.id, purchase.id);
          break;
        case PurchaseType.Scenario:
          add(scenarios, purchase.template.id, purchase.id);
          break;
      }
  });

  let originStipends: PartialIndex<TID.Origin, GID.Purchase> | undefined;
  if (doc) {
    const hasOriginStipend = Object.values(doc.origins.O).some(t =>
      t?.originStipend?.some(e => e.amount > 0),
    );
    if (hasOriginStipend) {
      originStipends = {};
      for (const pId of jump.drawbacks[charId] ?? []) {
        const p = chain.purchases.O[pId] as Drawback;
        if (!p) continue;
        if (p.stipend == undefined || p.stipendType == "purchase") continue;
        const stipendTid = p.stipend;
        if (!originStipends[stipendTid]) originStipends[stipendTid] = [];
        originStipends[stipendTid]!.push(pId);
      }
    }
  }

  let purchaseStipends: PartialIndex<TID.Purchase, GID.Purchase> | undefined;
  if (doc) {
    const hasPurchaseStipend = Object.values(doc.availablePurchases.O).some(t =>
      t?.stipend?.some(e => e.amount > 0),
    );
    if (hasPurchaseStipend) {
      purchaseStipends = {};
      for (const pId of jump.drawbacks[charId] ?? []) {
        const p = chain.purchases.O[pId] as Drawback;
        if (!p) continue;
        if (p.stipend == undefined || p.stipendType == "origin") continue;
        const stipendTid = p.stipend;
        if (!purchaseStipends[stipendTid]) purchaseStipends[stipendTid] = [];
        purchaseStipends[stipendTid]!.push(pId);
      }
    }
  }

  return {
    purchases,
    drawbacks,
    scenarios,
    companionImports,
    currencyExchanges: jump.currencyExchanges[charId] ?? [],
    origins: Object.values(jump.origins[charId] ?? {}).flat(),
    originStipends,
    purchaseStipends,
  };
}

export function AnnotationInteractionHandler({
  jumpId,
  charId,
  doc,
  internalTags,
}: AnnotationInteractionHandlerProps) {
  const addListener = useViewerActionStore(s => s.addListener);
  const removeListener = useViewerActionStore(s => s.removeListener);
  const listeners = useViewerActionStore(s => s.listeners);
  const interactionQueue = useViewerActionStore(s => s.interactionQueue);
  const enqueueInteractions = useViewerActionStore(s => s.enqueueInteractions);
  const removeInteractions = useViewerActionStore(s => s.removeInteractions);

  const { startUpdate, finalizeUpdate } = useUpdateStack();
  const currentAction = useRef<undefined | string>(undefined);

  const character = useCharacter(charId);

  const allListeners = useMemo(
    () => [
      createPrereqRemovalListener(),
      createRepricePurchasesListener(internalTags, jumpId, charId),
      createBoosterTextListener(),
      createScenarioRewardListener(),
      createOriginSynergyListener(jumpId, charId),
      createStipendListener(jumpId, charId, doc),
      ...(character.char?.primary ? [createDurationListener(jumpId, doc)] : []),
      createReapplyTagsListener(internalTags, jumpId, charId),
    ],
    [jumpId, charId, doc],
  );

  const [currentInteractions, setCurrentInteractions] = useState<any[]>([]);

  const chain = useChain();
  const buildData = useViewerActionStore(s => s.buildData);
  const storeBuildData = useViewerActionStore(s => s.setBuildData);

  const rawNavigate = useNavigate();
  const { chainId } = useParams({ strict: false });
  const suppressNavigateRef = useRef(false);

  const navigate = useCallback<ChainMutators["navigate"]>(
    target => {
      if (suppressNavigateRef.current || !chainId) return;
      suppressNavigateRef.current = true;
      const p = {
        chainId,
        charId: String(charId),
        jumpId: String(jumpId),
      };
      const scrollSearch =
        target.sub !== "" && target.scrollTo !== undefined
          ? { scrollTo: String(target.scrollTo) }
          : {};
      if (target.sub === "") {
        rawNavigate({
          to: "/chain/$chainId/char/$charId/jump/$jumpId/" as any,
          params: p as any,
          search: target.extraSearch ?? ({} as any),
        });
      } else if (target.sub === "purchases") {
        rawNavigate({
          to: "/chain/$chainId/char/$charId/jump/$jumpId/purchases",
          params: p,
          search: scrollSearch as any,
        });
      } else if (target.sub === "companions") {
        rawNavigate({
          to: "/chain/$chainId/char/$charId/jump/$jumpId/companions",
          params: p,
          search: scrollSearch as any,
        });
      } else {
        rawNavigate({
          to: "/chain/$chainId/char/$charId/jump/$jumpId/drawbacks",
          params: p,
          search: {
            ...scrollSearch,
            ...(target.sub === "drawbacks" ? (target.extraSearch ?? {}) : {}),
          } as any,
        });
      }
    },
    [chainId, charId, jumpId, rawNavigate],
  );

  const baseChainMutators = useChainMutators();
  const mutators: ChainMutators = useMemo(
    () => ({ ...baseChainMutators, navigate }),
    [baseChainMutators, navigate],
  );

  useEffect(() => {
    allListeners.forEach(l => addListener(l));
    return () => allListeners.forEach(l => removeListener(l));
  }, [allListeners]);

  useEffect(() => {
    if (interactionQueue.length === 0 && currentInteractions.length === 0) {
      suppressNavigateRef.current = false;
      finalizeUpdate(currentAction.current ?? "");
      currentAction.current = undefined;
    }
  }, [interactionQueue.length, currentInteractions.length]);

  const budgetFlag = useChainStore(c => c.chain?.budgetFlag ?? 0);

  useEffect(() => {
    if (!chain) return;
    let newBuildData = computeBuildData(chain, jumpId, charId, doc);
    storeBuildData(newBuildData);
    listeners.forEach(l => {
      if (l.condition(newBuildData, chain))
        l.action(newBuildData, chain, doc, mutators);
    });
  }, [!!chain, budgetFlag]);

  useEffect(() => {
    if (!chain || !doc) return;
    setTracked("Backfill originalCost", c => {
      const jump = c.jumps.O[jumpId];
      if (!jump) return;
      for (const gid of [
        ...(jump.purchases[charId] ?? []),
        ...(jump.drawbacks[charId] ?? []),
      ]) {
        const p = c.purchases.O[gid] as JumpPurchase | undefined;
        if (!p?.template?.id) continue;
        if (p?.template?.originalCost) continue;
        const isDrawback = p.type === PurchaseType.Drawback;
        const tid = p.template.id;
        const template = isDrawback
          ? doc.availableDrawbacks.O[tid as Id<TID.Drawback>]
          : doc.availablePurchases.O[tid as Id<TID.Purchase>];
        if (!template) continue;
        const floatingDiscountOption = !!(p as BasicPurchase)
          .usesFloatingDiscount;
        p.template.originalCost = {
          cost: p.value as any as Value<TID.Currency>,
          ...(!floatingDiscountOption
            ? (p.cost as ModifiedCost<TID.Currency>)
            : { modifier: CostModifier.Full }),
          floatingDiscountOption: floatingDiscountOption || undefined,
        };
      }
    });
  }, []);

  useEffect(() => {
    if (
      !chain ||
      !buildData ||
      currentInteractions.length ||
      !interactionQueue.length
    )
      return;

    let j = 0;
    for (; j < interactionQueue.length; j++) {
      let { interactions, character } = interactionQueue[j] ?? {
        interactions: [],
      };
      let currentBuildData =
        character === undefined || character == charId
          ? buildData
          : computeBuildData(chain, jumpId, character, doc);
      let errors = Object.fromEntries(
        interactions.map((i, index) => [index, i.error(currentBuildData)]),
      );
      let numErrors = Object.values(errors).reduce(
        (n, b) => n + (b === undefined ? 0 : 1),
        0,
      );

      let showPreview = false;

      if (interactions.length > numErrors)
        interactions = interactions.filter((_, index) => !errors[index]);
      else showPreview = true;

      showPreview ||= interactions.length > 1;
      showPreview ||= interactions[0]?.forcePreview?.(buildData);

      if (!showPreview) {
        let actions = (
          typeof interactions[0].actions == "function"
            ? interactions[0].actions(currentBuildData)
            : interactions[0].actions
        ).filter(a => a.condition(currentBuildData));
        if (actions.length > 1) showPreview = true;
        else if (actions.length == 1) {
          if (!currentAction.current) {
            currentAction.current =
              typeof actions[0].name == "function"
                ? actions[0].name(
                  currentBuildData,
                  interactions[0].initialize(currentBuildData),
                )
                : actions[0].name;
            startUpdate(currentAction.current);
          }
          actions[0]
            .execute(
              currentBuildData,
              mutators,
              interactions[0].initialize(currentBuildData),
            )
            .forEach(a =>
              "interaction" in a
                ? enqueueInteractions(a.interaction, a.character)
                : enqueueInteractions([a]),
            );
        }
      }

      if (showPreview) {
        setCurrentInteractions(interactions);
      }
    }

    removeInteractions(j);
  });

  useEffect(() => {
    if (!currentInteractions.length || !buildData) return;
    if (!currentAction.current) {
      currentAction.current = "JumpDoc interaction";
      startUpdate(currentAction.current);
    }

    MySwal.close();
    MySwal.fire({
      html: (
        <InteractionDialog
          interactions={currentInteractions}
          build={buildData}
          mutators={mutators}
          onClose={() => MySwal.close()}
        />
      ),
      showConfirmButton: false,
      showCancelButton: false,
      allowOutsideClick: true,
      allowEscapeKey: true,
      padding: 0,
      background: "transparent",
      backdrop: true,
      didDestroy: () => setCurrentInteractions([]),
      customClass: {
        popup:
          "!bg-transparent !shadow-none !border-0 !p-0 !overflow-visible !w-auto !max-w-none",
        htmlContainer: "!m-0 !p-0 !overflow-visible",
        container: "!p-4",
      },
    });
  }, [currentInteractions, !!buildData]);

  return null;
}
