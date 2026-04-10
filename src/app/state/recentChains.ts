const STORAGE_KEY = "chainmaker_recent_chains";
const MAX = 6;

export type RecentChain = { publicUid: string; name: string; ownerUid: string };

function load(): RecentChain[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecentChain[]) : [];
  } catch {
    return [];
  }
}

/** Push a chain to the front of the recent list, deduplicating by publicUid. */
export function recordRecentChain(publicUid: string, name: string, ownerUid: string): void {
  try {
    const prev = load().filter((c) => c.publicUid !== publicUid);
    const next = [{ publicUid, name, ownerUid }, ...prev].slice(0, MAX);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function getRecentChains(): RecentChain[] {
  return load();
}

/** Async variant — mirrors the Electron IPC version; web just wraps the sync read. */
export async function getRecentChainsAsync(): Promise<RecentChain[]> {
  return load();
}

/** Remove a single chain from the recent list by publicUid. */
export function removeRecentChain(publicUid: string): void {
  try {
    const next = load().filter((c) => c.publicUid !== publicUid);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
