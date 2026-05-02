import {
  createFileRoute,
  Link,
  Outlet,
  useBlocker,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { ChevronDown, Download, Loader2, Save, Share } from "lucide-react";
import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { zipSync } from "fflate";
import { toast } from "react-toastify";

import { useChain } from "@/chain/state/hooks";
import { useChainStore } from "@/chain/state/Store";
import { activeDocHandlers } from "@/electron-api/activeDocHandlers";
import { AppHeader, navButtonClass } from "@/app/components/AppHeader";
import { useTheme } from "@/providers/ThemeProvider";
import { useCurrentUser } from "@/app/state/auth";
import {
  loadChain,
  saveChain,
  autosaveChain,
  forceReplaceChain,
} from "@/api/chains";
import {
  registerClipboardTab,
  deregisterClipboardTab,
} from "@/chain/state/clipboard";
import { getImagePaths } from "@/api/images";
import { useImageUrlCache } from "@/chain/state/ImageUrlCache";
import { adjustJumpOrganization } from "@/chain/state/calculations";
import { recordRecentChain } from "@/app/state/recentChains";

/** Stable save function provided to child routes (e.g. add-doc). */
export const ChainSaveCtx = createContext<() => Promise<void>>(async () => {});
/** ownerUid of the loaded chain — "" means anonymous. */
export const ChainOwnerUidCtx = createContext<string>("");

export const Route = createFileRoute("/chain/$chainId")({
  component: ChainLoader,
});

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

function ChainLoader() {
  const { chainId } = Route.useParams();
  const chain = useChain();
  const { settings, updateSettings } = useTheme();
  const { firebaseUser, loading: authLoading } = useCurrentUser();
  const [chainLoading, setChainLoading] = useState(true);
  const [chainLoadError, setChainLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // chainMongoId: internal MongoDB _id, received from loadChain, required for saveChain.
  const chainMongoIdRef = useRef<string | null>(null);
  const [chainOwnerUid, setChainOwnerUid] = useState("");
  // edits: synced count for conflict detection.
  const editsRef = useRef(0);
  // Keep a stable ref to handleSave so the autosave interval doesn't need to be re-registered.
  const handleSaveRef = useRef<() => Promise<void>>(async () => {});
  const handleAutoSaveRef = useRef<() => Promise<void>>(async () => {});
  // True until the first successful save — allows saving even with 0 patches (initial save).
  const isPendingRef = useRef(false);
  // Register this tab with the clipboard so it clears when all /chain tabs close.
  useEffect(() => {
    registerClipboardTab();
    let done = false;
    const once = () => {
      if (!done) {
        done = true;
        deregisterClipboardTab();
      }
    };
    window.addEventListener("beforeunload", once);
    return () => {
      window.removeEventListener("beforeunload", once);
      once();
    };
  }, []);

  // Load chain from DB once auth has resolved.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setChainLoading(true);
    setChainLoadError(null);
    useChainStore.getState().setChain(undefined as never);

    (async () => {
      try {
        const idToken = firebaseUser
          ? await firebaseUser.getIdToken()
          : undefined;
        // chainId in the URL is the publicUid
        const result = await loadChain({
          data: { publicUid: chainId, idToken },
        });
        if (cancelled) return;
        chainMongoIdRef.current = result.chainMongoId;
        editsRef.current = result.edits;
        setChainOwnerUid(result.ownerUid);
        isPendingRef.current =
          (result as { isPending?: boolean }).isPending ?? false;
        useChainStore.getState().setChain(result.contents);

        useChainStore.getState().declareSynched();
        recordRecentChain(
          chainId,
          (result.contents as { name?: string }).name ?? "Untitled",
          result.ownerUid,
        );

        // Batch-resolve all internal alt-form image IDs in a single call.
        const altforms =
          (result.contents as { altforms?: { O?: Record<string, unknown> } })
            .altforms?.O ?? {};
        const imgIds = Object.values(altforms).flatMap(af => {
          const img = (af as { image?: { type?: string; imgId?: string } })
            ?.image;
          return img?.type === "internal" && img.imgId ? [img.imgId] : [];
        });
        if (imgIds.length > 0) {
          getImagePaths({ data: imgIds }).then(paths => {
            useImageUrlCache.getState().setUrls(paths);
          });
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "";
        const isElectron = import.meta.env.VITE_PLATFORM === "electron";
        setChainLoadError(
          msg === "Chain not found"
            ? "This chain doesn't exist."
            : isElectron
              ? "Failed to load chain file."
              : msg === "Unauthorized"
                ? "You don't have permission to view this chain."
                : msg === "Authentication required"
                  ? "Please sign in to view this chain."
                  : "Failed to load chain.",
        );
      } finally {
        if (!cancelled) setChainLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chainId, firebaseUser, authLoading]);

  useEffect(adjustJumpOrganization, [chainId, !chain]);

  if (import.meta.env.VITE_PLATFORM !== "electron")
    useBlocker({
      shouldBlockFn: ({ next }) => {
        if (
          chainId &&
          "chainId" in next.params &&
          next.params.chainId === chainId
        )
          return false;
        if (useChainStore.getState().updates.cumulativePatches.length > 0) {
          if (
            !confirm(
              "Are you sure you want to leave? You have unsaved changes.",
            )
          )
            return true;
          useChainStore.getState().reset();
        }
        return false;
      },
    });

  async function handleSave(manual: boolean) {
    if (!chainId) return;
    if (manual && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    const patches = useChainStore.getState().updates.cumulativePatches;
    if (!patches.length && !isPendingRef.current) return;
    const chainMongoId = chainMongoIdRef.current;
    const idToken = firebaseUser ? await firebaseUser.getIdToken() : undefined;
    setSaving(true);
    try {
      const result = await saveChain({
        data: {
          chainId: chainMongoId ?? "",
          idToken,
          patches,
          edits: editsRef.current,
        },
      });
      if (result.status === "ok") {
        editsRef.current = result.edits;
        isPendingRef.current = false;
        useChainStore.getState().declareSynched();
      } else if (result.status === "bad_patches") {
        const contents = useChainStore.getState().chain;
        if (contents) {
          const r = await forceReplaceChain({
            data: { chainId: chainMongoId ?? "", idToken, contents },
          });
          if (r.status === "ok") {
            editsRef.current = r.edits;
            useChainStore.getState().declareSynched();
          }
        }
      } else {
        toast.error(
          result.status === "conflict"
            ? "Save conflict — this chain was modified elsewhere. Reload to get the latest version."
            : result.status === "unauthorized"
              ? "You don't have permission to save this chain."
              : "Chain not found on the server.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleAutoSave() {
    if (import.meta.env.VITE_PLATFORM === "electron") {
      if (!useChainStore.getState().updates.cumulativePatches.length) return;
      await autosaveChain();
    } else {
      await handleSave(false);
    }
  }

  // Keep refs in sync every render so the intervals always call the latest closures.
  handleSaveRef.current = () => handleSave(true);
  handleAutoSaveRef.current = handleAutoSave;

  // Stable save function for child routes — always calls the latest handleSave via ref.
  const stableSave = useCallback(() => handleSaveRef.current(), []);

  // Autosave: fire handleAutoSave every 60 s when autosave is enabled.
  useEffect(() => {
    if (!settings.autosave) return;
    const id = setInterval(() => {
      void handleAutoSaveRef.current();
    }, 60_000);
    return () => clearInterval(id);
  }, [settings.autosave]);
  useEffect(() => {
    if (import.meta.env.VITE_PLATFORM !== "electron") return;
    const api = window.electronAPI;
    if (!api) return;

    activeDocHandlers.save = () => void handleSaveRef.current();
    activeDocHandlers.saveAs = () => {
      api.chains
        .saveChainAs()
        .then(result => {
          if (!result.ok) return;
          toast.success("Chain saved to new location.");
        })
        .catch(console.error);
    };

    return () => {
      activeDocHandlers.save = null;
      activeDocHandlers.saveAs = null;
    };
  }, []);

  // Derive nav context from deepest matched route params + pathname.
  const matches = useRouterState({ select: s => s.matches });
  const pathname = useRouterState({ select: s => s.location.pathname });
  const deepParams = (matches.at(-1)?.params ?? {}) as Record<string, string>;
  const currentCharId = deepParams.charId ?? null;
  const currentJumpId = deepParams.jumpId ?? null;

  // Prefer the active character; fall back to the first primary character in the chain.
  const navCharId: string | null = (() => {
    if (currentCharId) return currentCharId;
    if (!chain) return null;
    const primary = chain.characterList
      .map(id => chain.characters.O[id])
      .find(c => c?.primary);
    return primary ? String(primary.id as number) : null;
  })();

  // Prefer the active jump; fall back to the first jump in the chain.
  const jumpIdForNav =
    currentJumpId ??
    (chain?.jumpList[0] != null
      ? String(+(chain.jumpList[0] as number))
      : null);

  const inJump = pathname.includes("/jump/");
  const inSummary = pathname.includes("/summary");
  const inCache = pathname.includes("/items");
  const inConfig = pathname.includes("/config") && !inJump;
  const inShare = pathname.includes("/share");

  const chainNav = (
    <>
      {navCharId && jumpIdForNav ? (
        <Link
          to={"/chain/$chainId/char/$charId/jump/$jumpId"}
          params={{ chainId: chainId, charId: navCharId, jumpId: jumpIdForNav }}
          className={navButtonClass(inJump)}
        >
          <span className="lg:hidden">Jumps</span>
          <span className="hidden lg:inline">Jump Itinerary</span>
        </Link>
      ) : (
        <span className={navButtonClass(inJump)}>
          <span className="lg:hidden">Jumps</span>
          <span className="hidden lg:inline">Jump Itinerary</span>
        </span>
      )}

      {navCharId ? (
        <Link
          to={"/chain/$chainId/char/$charId/summary"}
          params={{ chainId, charId: navCharId }}
          className={navButtonClass(inSummary)}
        >
          <span className="md:hidden">Manifest</span>
          <span className="hidden md:inline">Traveler Manifest</span>
        </Link>
      ) : (
        <span className={navButtonClass(inSummary)}>
          <span className="md:hidden">Manifest</span>
          <span className="hidden md:inline">Traveler Manifest</span>
        </span>
      )}

      {navCharId ? (
        <Link
          to={"/chain/$chainId/char/$charId/items"}
          params={{ chainId, charId: navCharId }}
          className={navButtonClass(inCache)}
        >
          <span className="lg:hidden">Items</span>
          <span className="hidden lg:inline">Cosmic Cache</span>
        </Link>
      ) : (
        <span className={navButtonClass(inCache)}>
          <span className="lg:hidden">Items</span>
          <span className="hidden lg:inline">Cosmic Cache</span>
        </span>
      )}

      <Link
        to={"/chain/$chainId/config"}
        params={{ chainId }}
        className={navButtonClass(inConfig)}
      >
        <span className="lg:hidden">Config</span>
        <span className="hidden lg:inline">Chain Settings</span>
      </Link>

      <Link
        to={"/chain/$chainId/share"}
        title="Share Chain"
        params={{ chainId }}
        className={navButtonClass(inShare, true)}
      >
        <Share size={20} />
      </Link>
    </>
  );

  function handleExportJson() {
    const { chain } = useChainStore.getState();
    if (!chain) return;
    const json = JSON.stringify(chain, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${chain.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleExportChain() {
    const { chain } = useChainStore.getState();
    if (!chain) return;
    setExporting(true);
    setExportMenuOpen(false);
    try {
      const imageUrlCache = useImageUrlCache.getState().urls;
      const altforms =
        (chain as { altforms?: { O?: Record<string, unknown> } }).altforms?.O ??
        {};

      const files: Record<string, Uint8Array> = {};
      files["data.json"] = new TextEncoder().encode(
        JSON.stringify(chain, null, 2),
      );

      for (const af of Object.values(altforms)) {
        const img = (af as { image?: { type?: string; imgId?: string } }).image;
        if (img?.type !== "internal" || !img.imgId) continue;

        let fetchUrl = imageUrlCache[img.imgId];
        if (!fetchUrl) continue;

        // For imgchest CDN, use the thumb variant to keep file sizes sane.
        if (fetchUrl.includes("cdn.imgchest.com")) {
          const parts = fetchUrl.split("/");
          parts.splice(parts.length - 1, 0, "thumb");
          fetchUrl = parts.join("/");
        }

        try {
          const resp = await fetch(fetchUrl);
          if (!resp.ok) continue;
          const buf = await resp.arrayBuffer();
          const ext = fetchUrl.split("?")[0].split(".").pop() ?? "jpg";
          files[`images/${img.imgId}.${ext}`] = new Uint8Array(buf);
        } catch (err) {
          console.error(`[export] failed to fetch image ${img.imgId}:`, err);
        }
      }

      const zipped = zipSync(files);
      const blob = new Blob([zipped.buffer as ArrayBuffer], {
        type: "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(chain as { name?: string }).name?.replace(/[^a-zA-Z0-9_-]/g, "_") ?? "chain"}.chain`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const chainActions = (
    <>
      <button
        title={saving ? "Saving…" : "Save"}
        onClick={() => handleSave(true)}
        disabled={saving || chainLoading}
        className="p-1.5 rounded text-white/70 hover:text-white transition-colors disabled:opacity-40"
      >
        {saving ? (
          <Loader2 size={17} className="animate-spin" />
        ) : (
          <Save size={17} />
        )}
      </button>
      <div className="relative">
        <button
          title="Export chain"
          onClick={() => setExportMenuOpen(v => !v)}
          disabled={chainLoading || exporting}
          className="flex items-center gap-0.5 p-1.5 rounded text-white/70 hover:text-white transition-colors disabled:opacity-40"
        >
          {exporting ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <Download size={17} />
          )}
          <ChevronDown size={11} />
        </button>
        {exportMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setExportMenuOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1 z-50 min-w-36 rounded-lg border border-edge bg-surface shadow-lg overflow-hidden">
              <button
                type="button"
                onClick={handleExportJson}
                className="w-full px-3 py-2 text-left text-xs text-ink hover:bg-tint transition-colors"
              >
                Export as .json
              </button>
              <button
                type="button"
                onClick={handleExportChain}
                className="w-full px-3 py-2 text-left text-xs text-ink hover:bg-tint transition-colors"
              >
                Export as .chain
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );

  if (chainLoadError) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-canvas">
        <p className="text-sm text-danger">{chainLoadError}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      <title>{`${chain?.name || "[unnamed chain]"} | ChainMaker`}</title>
      <AppHeader
        nav={chainNav}
        actions={chainActions}
        settings={settings}
        onUpdateSettings={updateSettings}
      />
      {/* Body — child layouts own their sidebars */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {chainLoading ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-muted">Loading chain…</span>
          </div>
        ) : (
          <ChainOwnerUidCtx.Provider value={chainOwnerUid}>
            <ChainSaveCtx.Provider value={stableSave}>
              <Outlet />
            </ChainSaveCtx.Provider>
          </ChainOwnerUidCtx.Provider>
        )}
      </div>
    </div>
  );
}
