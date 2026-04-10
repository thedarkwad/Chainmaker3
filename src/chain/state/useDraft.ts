import { useChainStore } from "./Store";
import { makeDraft } from "@/shared/state/makeDraft";

/** Local-draft hook for Chain edits with UIBinding-backed undo/redo.
 *  See makeDraft.ts for full API documentation. */
export const useDraft = makeDraft(() => useChainStore.getState());
