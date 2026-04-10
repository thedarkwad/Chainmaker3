import { create } from "zustand";
import { type GID, type Id } from "@/chain/data/types";

export type ClipboardEntry = {
  id: Id<GID.Purchase>;
  key: string;
  /** Full purchase tree snapshot (root + all subpurchases) for cross-chain paste. */
  snapshot: Record<number, unknown>;
};

const STORAGE_KEY = "chainmaker-clipboard";
const TAB_COUNT_KEY = "chainmaker-clipboard-tabs";

function readFromStorage(): ClipboardEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ClipboardEntry[]) : [];
  } catch {
    return [];
  }
}

function persist(entries: ClipboardEntry[]) {
  try {
    if (entries.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// BroadcastChannel for real-time cross-tab sync (sender never receives its own messages).
const channel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("chainmaker-clipboard") : null;

interface ClipboardStore {
  entries: ClipboardEntry[];
  set: (entries: ClipboardEntry[]) => void;
  append: (entry: ClipboardEntry) => void;
  clear: () => void;
}

export const useClipboard = create<ClipboardStore>((setState, get) => {
  if (channel) {
    channel.onmessage = (e: MessageEvent<ClipboardEntry[]>) => {
      setState({ entries: e.data });
    };
  }
  return {
    entries: readFromStorage(),
    set: (entries) => {
      persist(entries);
      channel?.postMessage(entries);
      setState({ entries });
    },
    append: (entry) => {
      const entries = [...get().entries, entry];
      persist(entries);
      channel?.postMessage(entries);
      setState({ entries });
    },
    clear: () => {
      persist([]);
      channel?.postMessage([]);
      setState({ entries: [] });
    },
  };
});

/**
 * Call on mount of any /chain route. Increments a cross-tab counter in localStorage
 * so the clipboard knows when all chain tabs have closed.
 */
export function registerClipboardTab() {
  try {
    const count = parseInt(localStorage.getItem(TAB_COUNT_KEY) ?? "0", 10);
    const next = count + 1;
    localStorage.setItem(TAB_COUNT_KEY, String(next));
  } catch {}
}

/**
 * Call on unmount of any /chain route or on beforeunload.
 * Decrements the counter; clears clipboard when it reaches zero.
 */
export function deregisterClipboardTab() {
  try {
    const count = parseInt(localStorage.getItem(TAB_COUNT_KEY) ?? "1", 10);
    const next = Math.max(0, count - 1);
    if (next === 0) {
      localStorage.removeItem(TAB_COUNT_KEY);
      useClipboard.getState().clear();
    } else {
      localStorage.setItem(TAB_COUNT_KEY, String(next));
    }
  } catch {}
}
