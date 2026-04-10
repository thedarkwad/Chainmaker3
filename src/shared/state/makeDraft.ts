/**
 * makeDraft — generic factory for the useDraft hook.
 *
 * Accepts a `getStore()` function that returns an object with
 * `addActionUpdate` and `closeUIBinding`. Returns a typed `useDraft<T>` hook
 * bound to that store's undo stack.
 *
 * Usage:
 *   // Chain:
 *   export const useDraft = makeDraft(() => useChainStore.getState());
 *   // JumpDoc:
 *   export const useJumpDocDraft = makeDraft(() => useJumpDocStore.getState());
 */

import { produce } from "immer";
import { useCallback, useEffect, useRef, useState } from "react";

export type DraftStoreHandle = {
  addActionUpdate: (name: string, doFn: () => void, undoFn: () => void, uiBinding?: symbol) => void;
  closeUIBinding: (key: symbol) => void;
};

export function makeDraft(getStore: () => DraftStoreHandle) {
  return function useDraft<T>(initial: T) {
    const keyRef = useRef<symbol>(Symbol("draft"));
    const baselineRef = useRef<T>(initial);
    const [state, setState] = useState<T>(initial);
    const stateRef = useRef<T>(initial);
    stateRef.current = state;

    /** Tracked change — creates an undo/redo pair in the UpdateStack. */
    const set = useCallback((name: string, updater: (d: T) => void) => {
      const before = stateRef.current;
      const after = produce(before, updater) as T;
      setState(after);
      stateRef.current = after;
      getStore().addActionUpdate(
        name,
        () => setState(after),
        () => setState(before),
        keyRef.current,
      );
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /** Untracked change — no undo entry. For text fields with native undo. */
    const sync = useCallback((updater: (d: T) => void) => {
      setState((prev) => produce(prev, updater) as T);
    }, []);

    /** Begin a new edit session. Closes the previous UIBinding and resets
     *  the baseline. Pass `name` to also record the open in the undo stack. */
    const restart = useCallback(
      (value: T, name?: string, onUndo?: () => void, onRedo?: () => void) => {
        getStore().closeUIBinding(keyRef.current);
        keyRef.current = Symbol("draft");
        baselineRef.current = value;
        stateRef.current = value;
        setState(value);
        if (name) {
          getStore().addActionUpdate(
            name,
            onRedo ?? (() => {}),
            onUndo ?? (() => {}),
            keyRef.current,
          );
        }
      },
      [], // eslint-disable-line react-hooks/exhaustive-deps
    );

    /** Commit: close UIBinding (phantom absorption) without reverting state. */
    const close = useCallback(() => {
      getStore().closeUIBinding(keyRef.current);
      keyRef.current = Symbol("draft");
      baselineRef.current = stateRef.current;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /** Discard: close UIBinding and revert state to the last baseline. */
    const cancel = useCallback(() => {
      getStore().closeUIBinding(keyRef.current);
      keyRef.current = Symbol("draft");
      stateRef.current = baselineRef.current;
      setState(baselineRef.current);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-close UIBinding on unmount to avoid dangling entries.
    useEffect(() => {
      return () => {
        getStore().closeUIBinding(keyRef.current);
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return { state, set, sync, restart, close, cancel, key: keyRef.current };
  };
}
