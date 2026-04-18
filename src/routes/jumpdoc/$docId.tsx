import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Loader2, Save, X } from "lucide-react";

import { useJumpDocStore } from "@/jumpdoc/state/JumpDocStore";
import { useJumpDocName } from "@/jumpdoc/state/hooks";
import { activeDocHandlers } from "@/electron-api/activeDocHandlers";
import { useJumpDocMetaStore, type JumpDocAttributes } from "@/jumpdoc/state/JumpDocMetaStore";
import { makeUndoRedoProvider } from "@/providers/makeUndoRedoProvider";
import { AppHeader } from "@/app/components/AppHeader";
import { PortalNav } from "@/app/components/PortalNav";
import { useTheme } from "@/providers/ThemeProvider";
import { useCurrentUser } from "@/app/state/auth";
import { saveJumpDoc, autosaveJumpDoc, forceReplaceJumpDoc, loadJumpDoc } from "@/api/jumpdocs";
import { type JumpDoc, preprocessJumpDoc } from "@/chain/data/JumpDoc";

export const Route = createFileRoute("/jumpdoc/$docId")({
  component: JumpDocLoader,
});

const JumpDocUndoRedoProvider = makeUndoRedoProvider(useJumpDocStore as any);

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

function JumpDocLoader() {
  const { docId } = Route.useParams();
  const { settings, updateSettings } = useTheme();
  const { firebaseUser, loading: authLoading } = useCurrentUser();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Show a guide banner if this appears to be the user's first jumpdoc.
  const [showGuideBanner, setShowGuideBanner] = useState(
    () => localStorage.getItem("chainmaker_has_jumpdocs") === "false",
  );
  const name = useJumpDocName();
  // docMongoId is the MongoDB _id returned by loadJumpDoc — used for saves.
  const docMongoIdRef = useRef<string>("");
  // Tracks the edits count last synced with the server.
  const editsRef = useRef(0);
  // Keep a stable ref to handleSave so the autosave interval doesn't need to be re-registered.
  const handleSaveRef = useRef<() => Promise<void>>(async () => {});
  const handleAutoSaveRef = useRef<() => Promise<void>>(async () => {});
  // True until the first successful save — allows saving even with 0 patches (initial save).
  const isPendingRef = useRef(false);

  // Load the JumpDoc from the DB once auth is resolved.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const idToken = firebaseUser ? await firebaseUser.getIdToken() : undefined;
        const result = await loadJumpDoc({ data: { publicUid: docId, idToken } });
        if (cancelled) return;
        docMongoIdRef.current = result.docMongoId;
        editsRef.current = result.edits;
        isPendingRef.current = (result as { isPending?: boolean }).isPending ?? false;
        useJumpDocStore.getState().setDoc(preprocessJumpDoc(result.contents as JumpDoc));
        useJumpDocMetaStore.getState().setMeta({
          docMongoId: result.docMongoId,
          published: result.published,
          nsfw: (result as { nsfw?: boolean }).nsfw ?? false,
          attributes: (result.attributes as JumpDocAttributes | undefined) ?? {
            genre: [],
            medium: [],
            franchise: [],
            supernaturalElements: [],
          },
          imageId: result.imageId ?? null,
          imageUrl: result.imageUrl ?? null,
          pdfUrl: (result as { pdfUrl?: string }).pdfUrl ?? null,
        });
        setLoaded(true);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to load jumpdoc.";
        setLoadError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, firebaseUser, docId]);

  async function handleSave(manual: boolean) {
    if (manual && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const isElectron = import.meta.env.VITE_PLATFORM === "electron";
    if (saving || (!isElectron && !firebaseUser) || !docMongoIdRef.current) return;
    const { updates } = useJumpDocStore.getState();
    const patches = updates.cumulativePatches;
    if (!patches.length && !isPendingRef.current) return;

    const idToken = firebaseUser ? await firebaseUser.getIdToken() : undefined;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveJumpDoc({
        data: {
          docMongoId: docMongoIdRef.current,
          idToken: idToken ?? "",
          patches,
          edits: editsRef.current,
        },
      });
      if (result.status === "ok") {
        editsRef.current = result.edits;
        isPendingRef.current = false;
        useJumpDocStore.getState().declareSynched();
      } else if (result.status === "bad_patches") {
        // Patches are out of sync — replace the entire document to resync.
        const contents = useJumpDocStore.getState().doc;
        if (contents) {
          const replaceResult = await forceReplaceJumpDoc({
            data: { docMongoId: docMongoIdRef.current!, idToken: idToken ?? "", contents },
          });
          if (replaceResult.status === "ok") {
            editsRef.current = replaceResult.edits;
            isPendingRef.current = false;
            useJumpDocStore.getState().declareSynched();
          }
        }
      } else {
        setSaveError(
          result.status === "conflict"
            ? "Save conflict — this jumpdoc was modified elsewhere. Reload to get the latest version."
            : result.status === "unauthorized"
              ? "You don't have permission to save this jumpdoc."
              : "JumpDoc not found on the server.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleAutoSave() {
    if (import.meta.env.VITE_PLATFORM === "electron") {
      const { updates } = useJumpDocStore.getState();
      if (!updates.cumulativePatches.length) return;
      await autosaveJumpDoc();
    } else {
      await handleSave(false);
    }
  }

  // Keep refs in sync every render so the intervals always call the latest closures.
  handleSaveRef.current = () => handleSave(true);
  handleAutoSaveRef.current = handleAutoSave;

  useEffect(() => {
    if (import.meta.env.VITE_PLATFORM !== "electron") return;
    const api = window.electronAPI;
    if (!api) return;
    activeDocHandlers.save = () => void handleSaveRef.current();
    activeDocHandlers.saveAs = () => {
      api.jumpdocs
        .saveJumpdocAs(docMongoIdRef.current, useJumpDocStore.getState().doc)
        .then((result) => {
          if (result.ok) {
            isPendingRef.current = false;
            useJumpDocStore.getState().declareSynched();
          }
        })
        .catch(console.error);
    };
    return () => {
      activeDocHandlers.save = null;
      activeDocHandlers.saveAs = null;
    };
  }, []);

  // Autosave: fire handleAutoSave every 60 s when autosave is enabled.
  useEffect(() => {
    if (!settings.autosave) return;
    const id = setInterval(() => {
      void handleAutoSaveRef.current();
    }, 60_000);
    return () => clearInterval(id);
  }, [settings.autosave]);

  if (loadError) {
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas">
        <p className="text-sm text-danger">{loadError}</p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas">
        <span className="text-sm text-muted">Loading jumpdoc…</span>
      </div>
    );
  }

  const docActions = (
    <>
      <a
        href="/guide"
        target="_blank"
        rel="noopener noreferrer"
        title="Jumpdoc Conversion guide"
        className="p-1.5 rounded text-white/70 hover:text-white transition-colors"
      >
        <BookOpen size={17} />
      </a>
      <button
        title={saving ? "Saving…" : "Save"}
        onClick={() => handleSave(true)}
        disabled={saving}
        className="p-1.5 rounded text-white/70 hover:text-white transition-colors disabled:opacity-40"
      >
        {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
      </button>
    </>
  );

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      <title>{`${name || "[unnamed jumpdoc]"} | ChainMaker`}</title>
      <JumpDocUndoRedoProvider />
      {showGuideBanner && (
        <div className="shrink-0 flex items-center justify-between gap-4 bg-accent-tint border-b border-accent-ring px-4 py-2">
          <p className="text-sm text-ink">
            New to converting jumpdocs? Check out the{" "}
            <Link
              to="/guide"
              className="font-medium text-accent underline underline-offset-2 hover:opacity-80"
            >
              conversion guide
            </Link>{" "}
            to learn best practices.
          </p>
          <button
            onClick={() => {
              localStorage.setItem("chainmaker_has_jumpdocs", "true");
              setShowGuideBanner(false);
            }}
            className="shrink-0 p-1 rounded text-muted hover:text-ink transition-colors"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {saveError && (
        <div className="shrink-0 flex items-center justify-between gap-4 bg-danger/10 border-b border-danger/30 px-4 py-2">
          <p className="text-sm text-danger">{saveError}</p>
          <button
            onClick={() => setSaveError(null)}
            className="text-xs text-danger/70 hover:text-danger"
          >
            Dismiss
          </button>
        </div>
      )}
      <AppHeader
        nav={<PortalNav />}
        actions={docActions}
        settings={settings}
        onUpdateSettings={updateSettings}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
