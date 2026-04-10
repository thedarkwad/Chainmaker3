import { useJumpDocStore } from "./JumpDocStore";
import { makeDraft } from "@/shared/state/makeDraft";

/** Local-draft hook for JumpDoc edits with UIBinding-backed undo/redo.
 *  See makeDraft.ts for full API documentation. */
export const useJumpDocDraft = makeDraft(() => useJumpDocStore.getState());
