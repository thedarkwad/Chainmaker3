/**
 * makeUndoRedoProvider — generic factory for the undo/redo contentEditable bridge.
 *
 * Accepts a Zustand store that exposes `undo`, `redo`, and `setDummyElement`,
 * and returns a React component that mounts two hidden contentEditable divs,
 * registers them with the store, and listens for browser undo/redo events.
 *
 * Each store instance gets its own pair of dummy elements, so Chain and JumpDoc
 * undo stacks are fully independent even when both providers are mounted.
 *
 * Usage:
 *   export const UndoRedoProvider = makeUndoRedoProvider(useChainStore);
 *   export const JumpDocUndoRedoProvider = makeUndoRedoProvider(useJumpDocStore);
 */

import { useShallow } from "zustand/react/shallow";
import { type FunctionComponent, useEffect, useRef } from "react";

type UndoRedoStore = {
  getState: () => { undo: () => void; redo: () => void; setDummyElement: (d: [HTMLDivElement, HTMLDivElement]) => void };
  <U>(selector: (state: { undo: () => void; redo: () => void; setDummyElement: (d: [HTMLDivElement, HTMLDivElement]) => void }) => U): U;
};

export function makeUndoRedoProvider(useStore: UndoRedoStore): FunctionComponent {
  return function UndoRedoProviderImpl() {
    const [undo, redo, setDummyElement] = useStore(
      useShallow((s) => [s.undo, s.redo, s.setDummyElement]),
    );
    const dummyDiv1 = useRef<HTMLDivElement>(null);
    const dummyDiv2 = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handler = (e: InputEvent) => {
        if (e.inputType !== "historyUndo" && e.inputType !== "historyRedo") return;
        if (e.target !== dummyDiv1.current && e.target !== dummyDiv2.current) return;
        e.inputType === "historyUndo" ? undo() : redo();
      };
      window.addEventListener("beforeinput", handler as EventListener);
      return () => window.removeEventListener("beforeinput", handler as EventListener);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      if (dummyDiv1.current && dummyDiv2.current)
        setDummyElement([dummyDiv1.current, dummyDiv2.current]);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const divClass = "h-0 w-0 overflow-hidden opacity-0 absolute";
    return (
      <>
        <div ref={dummyDiv1} className={divClass} contentEditable suppressContentEditableWarning>
          0
        </div>
        <div ref={dummyDiv2} className={divClass} contentEditable suppressContentEditableWarning>
          0
        </div>
      </>
    );
  };
}
