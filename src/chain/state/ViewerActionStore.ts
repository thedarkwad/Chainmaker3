import { create } from "zustand";
import { GID, Id, PartialIndex, TID } from "../data/types";
import { ReactNode } from "react";
import { CurrencyExchange, Origin } from "../data/Jump";
import { JumpDoc } from "../data/JumpDoc";
import { ChainMutators } from "../components/AnnotationInteractionHandler";
import { Chain } from "../data/Chain";

export type JumpDocBuildData = {
  purchases: PartialIndex<TID.Purchase, GID.Purchase>;
  drawbacks: PartialIndex<TID.Drawback, GID.Purchase>;
  scenarios: PartialIndex<TID.Scenario, GID.Purchase>;
  companionImports: PartialIndex<TID.Companion, GID.Purchase>;

  currencyExchanges: CurrencyExchange[];
  origins: Origin[];
  /** Drawbacks created for origin stipends, keyed by origin TID. Only present if the doc has origins with non-zero stipends. */
  stipend?: PartialIndex<TID.Origin, GID.Purchase>;
};

export type BuildListener = {
  action: (build: JumpDocBuildData, chain: Chain, doc: JumpDoc, mutators: ChainMutators) => void;
  condition: (build: JumpDocBuildData,chain: Chain) => boolean;
 };

export type AnnotationAction<A> = {
  name: string | ((buildData: JumpDocBuildData, state: A) => string);
  execute: (buildData: JumpDocBuildData, mutators: ChainMutators, state: A) => AnnotationInteraction<object>[] | {interaction: [AnnotationInteraction<object>], character: Id<GID.Character>}[];
  condition: (buildData: JumpDocBuildData) => boolean;
  variant?: "confirm" | "warn" | "danger";
  blocker?: string | ((buildData: JumpDocBuildData, state: A) => string | undefined);
};

export type AnnotationInteraction<A extends object> = {
  initialize: (buildData: JumpDocBuildData) => A;
  error: (buildData: JumpDocBuildData) => undefined | string;

  preview: (props: {
    buildData: JumpDocBuildData;
    state: A;
    setState: (partial: Partial<A>) => void;
  }) => ReactNode;

  typeName: string;
  name: string | ((build: JumpDocBuildData, state: A) => string);

  info?: string | ((build: JumpDocBuildData, state: A) => string | undefined);
  description?: string | ((build: JumpDocBuildData, state: A) => string | undefined);
  costStr?: string | ((build: JumpDocBuildData, state: A) => string | undefined);
  shortCostStr?: string | ((build: JumpDocBuildData, state: A) => string | undefined);
  warning?: string | ((build: JumpDocBuildData, state: A) => string | undefined);

  actions: AnnotationAction<A>[] | ((build: JumpDocBuildData) => AnnotationAction<A>[]);
  forcePreview: (buildData: JumpDocBuildData) => boolean;
};

type ViewerActionState = {
  interactionQueue: {
    interactions: AnnotationInteraction<object>[];
    /*   Defaults to currently selected character if not set. */
    character?: Id<GID.Character>;
  }[];
  enqueueInteractions: (
    interactions: AnnotationInteraction<object>[],
    character?: Id<GID.Character>,
  ) => void;
  removeInteractions: (n: number) => void;
  listeners: BuildListener[];

  addListener: (l: BuildListener) => void;
  removeListener: (l: BuildListener) => void;

  /** Current build snapshot — set by AnnotationInteractionHandler whenever chain state changes. */
  buildData: JumpDocBuildData | undefined;
  setBuildData: (data: JumpDocBuildData | undefined) => void;

  /**
   * Registered by the jump layout when a JumpDoc is active.
   * Calling it pops the JumpDocViewer into a new window (or brings it back to the panel).
   * Null when no viewer is mounted.
   */
  popOutViewer: (() => void) | null;
  setPopOutViewer: (fn: (() => void) | null) => void;
};

export const useViewerActionStore = create<ViewerActionState>((set) => ({
  interactionQueue: [],
  enqueueInteractions: (
    interactions: AnnotationInteraction<object>[],
    character?: Id<GID.Character>,
  ) =>
    set(({ interactionQueue }) => ({
      interactionQueue: interactionQueue.concat([{ interactions, character }]),
    })),
  removeInteractions: (n) =>
    set(({ interactionQueue }) => {
      return { interactionQueue: interactionQueue.slice(n + 1) };
    }),
  listeners: [],
  addListener: (l) => {
    set(({ listeners }) => ({ listeners: [...listeners, l] }));
  },
  removeListener: (l) => {
    set(({ listeners }) => ({ listeners: listeners.filter((n) => n != l) }));
  },
  buildData: undefined,
  setBuildData: (data) => set({ buildData: data }),
  popOutViewer: null,
  setPopOutViewer: (popOutViewer) => set({ popOutViewer }),
}));
