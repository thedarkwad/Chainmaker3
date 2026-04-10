import { produce } from "immer";
import { ChainState } from "./Store";
import { applySetters, ChainAction } from "./StoreUtilities";

const undo: () => ChainAction = () => (s) => {
  if (!s.chain) return {};
  const pendingNavigation = s.updates.getUndoPath();
  return {
    ...produce(s, (t: Required<ChainState>) => t.updates.undo(t.chain)),
    pendingNavigation,
  };
};

const redo: () => ChainAction = () => (s) => {
  if (!s.chain) return {};
  const pendingNavigation = s.updates.getRedoPath();
  return {
    ...produce(s, (t: Required<ChainState>) => t.updates.redo(t.chain)),
    pendingNavigation,
  };
};

/** Opens a compound batch: creates a browser undo entry and starts an UpdateStack
 *  batch. Follow with one or more `createPatch` calls, then `endUpdate`.
 *  For single mutations, prefer `createTrackedAction` over this + endUpdate. */
const startUpdate: (name: string) => ChainAction = (name) => (s) => {
  if (!s.chain || !s.dummyElements[0]) return {};
  const [d1, d2] = s.dummyElements;
  d1!.focus();
  document.execCommand("insertText", false, "0");
  d1!.blur();
  const path = window.location.pathname + window.location.search;
  return {
    ...produce(s, (t: ChainState) => { t.updates.startUpdate(name, path); }),
    dummyElements: [d2, d1] as ChainState["dummyElements"],
  };
};

/** Finalizes a compound batch opened by `startUpdate`. */
const endUpdate: (name: string) => ChainAction = (name) => (s) => {
  if (!s.chain) return {};
  return produce(s, (t: Required<ChainState>) => t.updates.finalizeUpdate(name));
};

/** Records a non-patch (action) update with an optional UIBinding key. Use this
 *  for local UI state changes (e.g. draft edits) that live outside the chain.
 *
 *  - `doFn` is called on redo; `undoFn` is called on undo.
 *  - Tag with a `uiBinding` Symbol to be able to bulk-remove these entries later
 *    (e.g. when a draft is submitted or cancelled) via `closeUIBinding`. */
const addActionUpdate: (
  name: string,
  doFn: () => void,
  undoFn: () => void,
  uiBinding?: Symbol,
) => ChainAction = (name, doFn, undoFn, uiBinding) => (s) => {
  if (!s.dummyElements[0]) return {};
  const [d1, d2] = s.dummyElements;
  d1!.focus();
  document.execCommand("insertText", false, "0");
  d1!.blur();
  const path = window.location.pathname + window.location.search;
  const newUpdates = produce(s.updates, (u) => {
    u.commitActionUpdate(name, doFn, undoFn, uiBinding, undefined, path);
  });
  return {
    updates: newUpdates,
    dummyElements: [d2, d1] as ChainState["dummyElements"],
  };
};

/** Removes all action updates tagged with the given UIBinding key and adjusts
 *  the undo cursor accordingly. Call this when a draft is submitted (before
 *  committing the patch) or cancelled (after resetting local state). */
const closeUIBinding: (key: Symbol) => ChainAction = (key) => (s) => {
  const newUpdates = produce(s.updates, (u) => { u.closeUIBinding(key); });
  return { updates: newUpdates };
};

/** Like `addActionUpdate` but supports merging consecutive actions with the same key.
 *  When the last stack entry has the same `mergeKey` and no redo history exists,
 *  the existing entry is updated in-place (name + do) with no new browser undo slot.
 *  The original undo function is preserved so one Ctrl+Z reverts the entire sequence. */
const addMergeableActionUpdate: (
  mergeKey: string,
  name: string,
  doFn: () => void,
  undoFn: () => void,
) => ChainAction = (mergeKey, name, doFn, undoFn) => (s) => {
  if (s.updates.canMerge(mergeKey)) {
    const newUpdates = produce(s.updates, (u) => { u.mergeLastAction(name, doFn); });
    return { updates: newUpdates };
  }
  if (!s.dummyElements[0]) return {};
  const [d1, d2] = s.dummyElements;
  d1!.focus();
  document.execCommand("insertText", false, "0");
  d1!.blur();
  const path = window.location.pathname + window.location.search;
  const newUpdates = produce(s.updates, (u) => {
    u.commitActionUpdate(name, doFn, undoFn, undefined, mergeKey, path);
  });
  return { updates: newUpdates, dummyElements: [d2, d1] as ChainState["dummyElements"] };
};

const declareSynched: () => ChainAction = () => (s) => {
  const newUpdates = produce(s.updates, (u) => { u.declareSynched(); });
  return { updates: newUpdates };
};

export const UpdateStackActions = applySetters({
  undo,
  redo,
  startUpdate,
  endUpdate,
  addActionUpdate,
  addMergeableActionUpdate,
  closeUIBinding,
  declareSynched,
});
