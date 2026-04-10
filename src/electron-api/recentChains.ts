// Electron replacement for @/app/state/recentChains.
// Reads/writes via the IPC config file instead of localStorage.
// The "publicUid" here is the routing UUID stored in recentFiles.

export type RecentChain = { publicUid: string; name: string; ownerUid: string };

function getAPI() {
  return window.electronAPI?.recentFiles;
}

/** Push a chain to the front of the recent list, deduplicating by publicUid. */
export function recordRecentChain(publicUid: string, name: string, ownerUid: string): void {
  getAPI()
    ?.addRecentFile({ id: publicUid, name, filePath: "" })
    .catch(console.error);
  // Note: filePath is not updated here since we only have the id.
  // The IPC handler deduplicates by id and preserves the stored filePath.
  void ownerUid; // Electron chains are always local; ownerUid not stored
}

export function getRecentChains(): RecentChain[] {
  // Synchronous read is not possible here; callers that need sync data
  // should use the async version. Return empty for initial render — the
  // route component re-fetches asynchronously.
  return [];
}

/** Returns a promise resolving to recent chains (async, for Electron). */
export async function getRecentChainsAsync(): Promise<RecentChain[]> {
  const files = await getAPI()?.getRecentFiles();
  return (files ?? []).map((f) => ({ publicUid: f.id, name: f.name, ownerUid: "" }));
}

/** Remove a single chain from the recent list by publicUid. */
export function removeRecentChain(publicUid: string): void {
  getAPI()?.removeRecentFile(publicUid).catch(console.error);
}
