/**
 * createDocStore — generic factory for document-based Zustand stores.
 *
 * Creates a fully-typed Zustand store for any document type `T`, bundled with:
 *   - `createTrackedAction(name, f)` — single-mutation undo/redo helper
 *   - `createPatch(f)` — low-level patch recorder (use inside startUpdate/endUpdate)
 *
 * This is the shared infrastructure used by both the Chain store and the
 * JumpDoc store. Each store gets its own independent instance.
 *
 * The store shape uses `doc` as the document field (contrast with the legacy
 * Chain store which uses `chain`). All UpdateStack actions are inlined here
 * so the factory is fully self-contained.
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { produce, produceWithPatches } from "immer";
import UpdateStack from "./UpdateStack";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type BaseDocState<T extends object> = {
  doc?: T;
  updates: UpdateStack<T>;
  dummyElements: [HTMLDivElement?, HTMLDivElement?];
};

export type BaseDocActions<T extends object> = {
  setDoc: (d: T) => void;
  setDummyElement: (d: [HTMLDivElement, HTMLDivElement]) => void;
  undo: () => void;
  redo: () => void;
  addActionUpdate: (
    name: string,
    doFn: () => void,
    undoFn: () => void,
    uiBinding?: symbol,
  ) => void;
  addMergeableActionUpdate: (
    mergeKey: string,
    name: string,
    doFn: () => void,
    undoFn: () => void,
  ) => void;
  closeUIBinding: (key: symbol) => void;
  declareSynched: () => void;
};

export type DocStore<T extends object> = BaseDocState<T> & BaseDocActions<T>;

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createDocStore<T extends object>() {
  type S = DocStore<T>;

  const useStore = create<S>()(
    subscribeWithSelector((set) => ({
      doc: undefined,
      updates: new UpdateStack<T>(),
      dummyElements: [undefined, undefined] as unknown as S["dummyElements"],

      setDoc: (d) => set({ doc: d }),
      setDummyElement: (d) => set({ dummyElements: d }),

      undo: () =>
        set((s) => {
          if (!s.doc) return {};
          return produce(s, (t: Required<S>) => t.updates.undo(t.doc));
        }),

      redo: () =>
        set((s) => {
          if (!s.doc) return {};
          return produce(s, (t: Required<S>) => t.updates.redo(t.doc));
        }),

      addActionUpdate: (name, doFn, undoFn, uiBinding) =>
        set((s) => {
          if (!s.dummyElements[0]) return {};
          const [d1, d2] = s.dummyElements;
          d1!.focus();
          document.execCommand("insertText", false, "0");
          d1!.blur();
          const newUpdates = produce(s.updates, (u) => {
            u.commitActionUpdate(name, doFn, undoFn, uiBinding);
          });
          return { updates: newUpdates, dummyElements: [d2, d1] as S["dummyElements"] };
        }),

      addMergeableActionUpdate: (mergeKey, name, doFn, undoFn) =>
        set((s) => {
          if (s.updates.canMerge(mergeKey)) {
            const newUpdates = produce(s.updates, (u) => u.mergeLastAction(name, doFn));
            return { updates: newUpdates };
          }
          if (!s.dummyElements[0]) return {};
          const [d1, d2] = s.dummyElements;
          d1!.focus();
          document.execCommand("insertText", false, "0");
          d1!.blur();
          const newUpdates = produce(s.updates, (u) => {
            u.commitActionUpdate(name, doFn, undoFn, undefined, mergeKey);
          });
          return { updates: newUpdates, dummyElements: [d2, d1] as S["dummyElements"] };
        }),

      closeUIBinding: (key) =>
        set((s) => {
          const newUpdates = produce(s.updates, (u) => u.closeUIBinding(key));
          return { updates: newUpdates };
        }),

      declareSynched: () =>
        set((s) => {
          const newUpdates = produce(s.updates, (u) => u.declareSynched());
          return { updates: newUpdates };
        }),
    })),
  );

  /** Records Immer patches into an open UpdateStack batch.
   *  Must be preceded by store.getState().updates.startUpdate and followed by endUpdate. */
  const createPatch = (f: (doc: T) => void) => (s: S): Partial<S> => {
    if (!s.doc) return {};
    const [newDoc, patches, inversePatches] = produceWithPatches(s.doc, f);
    const newUpdates = produce(s.updates, (u) => u.pushPatches(patches, inversePatches));
    return { doc: newDoc as T, updates: newUpdates };
  };

  /** Creates a browser undo slot, records Immer patches, and finalizes — all in one call.
   *  Use this for the vast majority of document mutations. */
  const createTrackedAction = (name: string, f: (doc: T) => void) => (s: S): Partial<S> => {
    if (!s.doc) return {};
    const [d1, d2] = s.dummyElements;
    d1?.focus();
    document.execCommand("insertText", false, "0");
    d1?.blur();
    const [newDoc, patches, inversePatches] = produceWithPatches(s.doc, f);
    const newUpdates = produce(s.updates, (u) => {
      u.startUpdate(name);
      u.pushPatches(patches, inversePatches);
      u.finalizeUpdate(name);
    });
    return {
      doc: newDoc as T,
      updates: newUpdates,
      dummyElements: [d2, d1] as S["dummyElements"],
    };
  };

  return { useStore, createTrackedAction, createPatch };
}
