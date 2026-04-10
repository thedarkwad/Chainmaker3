import { Chain } from "@/chain/data/Chain";
import { produce, produceWithPatches } from "immer";
import { ChainState } from "./Store";
import { objMap } from "@/utilities/miscUtilities";

export type ChainAction = (s: ChainState) => Partial<ChainState>;
export type ChainSetter = (a: ChainAction) => void;
export type ChainUpdate = (state: Chain) => void;

type TransformFunctions<R, T extends Record<PropertyKey, (...args: any[]) => R>, NR> = {
  [K in keyof T]: T[K] extends (...args: infer A) => R ? (...args: A) => NR : never;
};

/** Transforms a map of ChainAction-returning functions into Zustand setter functions.
 *  Each transformed function calls `set(original(...args))` instead of returning an action. */
export const applySetters = <T extends Record<PropertyKey, (...args: any[]) => ChainAction>>(
  obj: T
) => {
  return (set: ChainSetter) =>
    objMap(
      obj,
      (f) =>
        (...args: any[]) =>
          set(f(...args))  // fixed: was f(args), which passed the whole array as the first argument
    ) as TransformFunctions<ChainAction, T, void>;
};

/** Low-level: records Immer patches into an already-open UpdateStack batch.
 *  Must be preceded by `startUpdate` and followed by `endUpdate`.
 *  Prefer `createTrackedAction` for simple single-mutation updates. */
export const createPatch = (f: ChainUpdate) => (s: ChainState): Partial<ChainState> => {
  if (!s.chain) return {};
  const [newChain, patches, inversePatches] = produceWithPatches(s.chain, f);
  const newUpdates = produce(s.updates, (u) => {
    u.pushPatches(patches, inversePatches);
  });
  return { chain: newChain, updates: newUpdates };
};

/** High-level: creates a browser undo entry, records Immer patches, and finalizes
 *  the batch — all in one call. Use this for the vast majority of mutations.
 *
 *  For compound updates (multiple mutations under a single undo entry), use the
 *  explicit `startUpdate` + `createPatch` + `endUpdate` sequence instead. */
export const createTrackedAction = (name: string, f: ChainUpdate) => (s: ChainState): Partial<ChainState> => {
  if (!s.chain) return {};
  const [d1, d2] = s.dummyElements;
  d1?.focus();
  document.execCommand("insertText", false, "0");
  d1?.blur();
  const path = window.location.pathname + window.location.search;
  const [newChain, patches, inversePatches] = produceWithPatches(s.chain, f);
  const newUpdates = produce(s.updates, (u) => {
    u.startUpdate(name, path);
    u.pushPatches(patches, inversePatches);
    u.finalizeUpdate(name);
  });
  return {
    chain: newChain,
    updates: newUpdates,
    dummyElements: [d2, d1] as ChainState["dummyElements"],
  };
};
