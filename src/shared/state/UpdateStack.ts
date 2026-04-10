import { applyPatches, enablePatches, immerable, Objectish, Patch } from "immer";
import { objFilter } from "@/utilities/miscUtilities";

enablePatches();

function appendPatch(cDiff: Patch[], nPatch: Patch) {
  let relevantPatches = Object.fromEntries(cDiff.map((p, i) => [i, p])) as Record<number, Patch>;
  for (let depth = 0; depth < nPatch.path.length; depth++) {
    relevantPatches = objFilter(
      relevantPatches,
      (p) => p.path[depth] == nPatch.path[depth],
    ) as Record<number, Patch>;
    let [terminalPatchIndex, terminalPatch] = Object.entries(relevantPatches).find(
      ([, p]) => p.path.length == depth + 1,
    ) || [undefined, undefined];
    if (terminalPatch) {
      if (depth + 1 == nPatch.path.length)
        switch (terminalPatch.op) {
          case "replace":
            cDiff[+terminalPatchIndex!] = nPatch;
            return;
          case "remove":
            cDiff[+terminalPatchIndex!] = { ...nPatch, op: "replace" };
            return;
          case "add":
            cDiff[+terminalPatchIndex!] = {
              ...nPatch,
              op: nPatch.op == "remove" ? "remove" : "add",
            };
            return;
        }
      else {
        console.assert(terminalPatch.op != "remove", "Attempting to modify a deleted field!");
        cDiff[+terminalPatchIndex!].value = applyPatches(cDiff[+terminalPatchIndex!].value, [
          { ...nPatch, path: nPatch.path.slice(depth + 1) },
        ]);
        return;
      }
    }
  }
  cDiff.push(nPatch);
}

function appendPatches(cDiff: Patch[], nPatches: Patch[]) {
  nPatches.forEach((p) => appendPatch(cDiff, p));
}

export type Update =
  | {
      name: string;
      type: "patch";
      path?: string;
      patches: Patch[];
      inversePatches: Patch[];
    }
  | {
      name: string;
      type: "action";
      path?: string;
      uiBinding?: Symbol;
      mergeKey?: string;
      do: () => void;
      undo: () => void;
    };

export default class UpdateStack<A extends Objectish> {
  [immerable] = true;

  private stack: Update[] = [];
  private cumulativeDiff: Patch[] = [];
  private workingChunk?: Update & { type: "patch" };

  private workingIndex: number = 0;

  startUpdate(name: string, path?: string): boolean {
    if (this.workingChunk) return false;
    if (this.workingIndex != this.stack.length) this.stack = this.stack.slice(0, this.workingIndex);
    this.workingChunk = {
      name: name,
      type: "patch",
      path,
      patches: [],
      inversePatches: [],
    };
    return true;
  }

  pushPatches(patches: Patch[], inversePatches: Patch[]) {
    console.assert(
      this.workingChunk != undefined,
      "Please start an update before pushing any patches.",
    );
    this.workingChunk!.patches = [...this.workingChunk!.patches, ...patches];
    this.workingChunk!.inversePatches = [...inversePatches, ...this.workingChunk!.inversePatches];
  }

  /** Commits a non-patch (action) update directly to the stack. Used for local
   *  UI state changes that can't be expressed as Immer patches (e.g. draft edits). */
  commitActionUpdate(
    name: string,
    doFn: () => void,
    undoFn: () => void,
    uiBinding?: Symbol,
    mergeKey?: string,
    path?: string,
  ) {
    if (this.workingIndex !== this.stack.length)
      this.stack = this.stack.slice(0, this.workingIndex);
    this.stack.push({ name, type: "action", path, uiBinding, mergeKey, do: doFn, undo: undoFn });
    this.workingIndex++;
  }

  /** Returns true if the last stack entry is a mergeable action with the same key
   *  and there is no redo history (we are at the tip of the stack). */
  canMerge(mergeKey: string): boolean {
    if (this.workingIndex !== this.stack.length) return false;
    if (this.workingIndex === 0) return false;
    const last = this.stack[this.workingIndex - 1];
    return last.type === "action" && last.mergeKey === mergeKey;
  }

  /** Updates the last action entry's name and do-function in-place.
   *  The original undo function is preserved so undoing reverts to the original origin. */
  mergeLastAction(name: string, doFn: () => void): void {
    const last = this.stack[this.workingIndex - 1] as Extract<Update, { type: "action" }>;
    last.name = name;
    last.do = doFn;
  }

  get index() {
    return this.workingIndex;
  }

  get updates() {
    return this.stack.map((u) => u.name);
  }

  finalizeUpdate(name: string) {
    if (!this.workingChunk || this.workingChunk.name != name) return;
    this.workingIndex++;
    this.stack.push(this.workingChunk);
    appendPatches(this.cumulativeDiff, this.workingChunk.patches);
    delete this.workingChunk;
  }

  length() {
    return this.stack.length;
  }

  declareSynched() {
    this.cumulativeDiff = [];
  }

  /** Removes all action updates tagged with the given UIBinding key. Inserts
   *  phantom no-op entries in place of any removed before-cursor entries so
   *  that the matching stale browser undo slots are absorbed harmlessly. */
  closeUIBinding(key: Symbol) {
    this.stack = this.stack.map((u) =>
      u.type === "action" && u.uiBinding === key
        ? {
            name: "(phantom)",
            type: "action" as const,
            do: () => {
              document.execCommand("redo");
            },
            undo: () => {
              document.execCommand("undo");
            },
          }
        : u,
    );
  }

  get cumulativePatches() {
    return this.cumulativeDiff;
  }

  /** Returns the path of the update that would be undone next, without mutating state. */
  getUndoPath(): string | undefined {
    if (this.workingIndex === 0) return undefined;
    return this.stack[this.workingIndex - 1].path;
  }

  /** Returns the path of the update that would be redone next, without mutating state. */
  getRedoPath(): string | undefined {
    if (this.workingIndex === this.stack.length) return undefined;
    return this.stack[this.workingIndex].path;
  }

  undo(state: A) {
    if (this.workingIndex == 0) return;
    let update = this.stack[this.workingIndex - 1];
    switch (update.type) {
      case "patch":
        applyPatches(state, update.inversePatches);
        appendPatches(this.cumulativeDiff, update.inversePatches);
        break;
      case "action":
        update.undo();
        break;
    }
    this.workingIndex--;
  }

  redo(state: A) {
    if (this.workingIndex == this.stack.length) return;
    let update = this.stack[this.workingIndex];
    switch (update.type) {
      case "patch":
        applyPatches(state, update.patches);
        appendPatches(this.cumulativeDiff, update.patches);
        break;
      case "action":
        update.do();
        break;
    }
    this.workingIndex++;
  }
}
