// Electron replacement for @/api/chains.
// The IPC layer owns the open chain state. The renderer never passes IDs for save/load.

import type { Patch } from "immer";

export type { SaveResult, SaveStatus } from "@/api/types";

export type ChainSummary = {
  _id: string;
  publicUid: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

function getAPI() {
  const api = window.electronAPI;
  if (!api) throw new Error("Electron API not available");
  return api;
}

/** Loads the currently open chain (set by openFilePicker or initNewChain). */
export async function loadChain(
  _params: { data: { publicUid: string; idToken?: string } } | { publicUid: string },
) {
  const api = getAPI();
  const result = await api.chains.loadChain();
  // Populate image URL cache immediately so alt-form images display on load.
  if (Object.keys(result.imagePaths).length > 0) {
    const { useImageUrlCache } = await import("@/chain/state/ImageUrlCache");
    useImageUrlCache.getState().setUrls(result.imagePaths);
  }
  return {
    contents: result.chain,
    edits: 0,
    chainMongoId: "local",
    ownerUid: "local",
  };
}

/** Saves the open chain by applying patches. The IPC resolves the file path. */
export async function saveChain(
  params:
    | { data: { chainId: string; idToken?: string; patches: Patch[]; edits: number } }
    | { chainId: string; patches: Patch[]; edits: number },
): Promise<{ status: "ok"; edits: number } | { status: "not_found" | "bad_patches" }> {
  const { patches } = "data" in params ? params.data : params;
  const api = getAPI();
  const result = await api.chains.saveChain(patches);
  return result.ok ? { status: "ok", edits: 1 } : { status: "bad_patches" };
}

/** Force-replaces the open chain (fallback for bad patches). */
export async function forceReplaceChain(
  params:
    | { data: { chainId: string; idToken?: string; contents: unknown } }
    | { chainId: string; contents: unknown },
): Promise<{ status: "ok"; edits: number } | { status: "not_found" }> {
  const { contents } = "data" in params ? params.data : params;
  const api = getAPI();
  const patch: Patch = { op: "replace", path: [], value: contents };
  const result = await api.chains.saveChain([patch]);
  return result.ok ? { status: "ok", edits: 1 } : { status: "not_found" };
}

/** Creates a new chain in memory. File dialog deferred to first save. */
export async function createChain(
  params:
    | { data: { idToken?: string; contents: object } }
    | { idToken?: string; contents: object },
): Promise<{ publicUid: string }> {
  const contents = "data" in params ? params.data.contents : params.contents;
  const api = getAPI();
  await api.chains.initNewChain(contents);
  return { publicUid: "local" };
}

/** Lists recent chains from the config file. */
export async function listChains(_idToken?: string): Promise<ChainSummary[]> {
  const api = getAPI();
  const files = await api.recentFiles.getRecentFiles();
  return files.map((f) => ({
    _id: f.id,
    publicUid: f.id,
    name: f.name,
    createdAt: "",
    updatedAt: "",
  }));
}

export async function deleteChain(
  _params: unknown,
): Promise<{ status: "ok" | "not_found" | "unauthorized" }> {
  return { status: "ok" };
}

export async function claimChain(
  _params: unknown,
): Promise<{ status: "ok" | "already_owned" | "not_found" }> {
  return { status: "ok" };
}

export async function duplicateChain(_params: unknown): Promise<{ publicUid: string }> {
  throw new Error("Duplicate not yet implemented");
}

// ── Re-export getImagePaths so @/api/images alias isn't needed in chainId.tsx ─
export { getImagePaths } from "@/electron-api/images";
