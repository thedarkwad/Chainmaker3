import { HeadContent, Outlet, Scripts, createRootRoute, useNavigate } from "@tanstack/react-router";
import { ToastContainer, Zoom, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { useChainStore } from "@/chain/state/Store";
import { useJumpDocStore } from "@/jumpdoc/state/JumpDocStore";

import appCss from "../styles.css?url";
import "../styles.css";
import { UndoRedoProvider } from "@/providers/UndoRedoProvider";
import { AuthProvider, useCurrentUser } from "@/app/state/auth";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { ModalShell, friendlyError } from "@/app/components/AuthModal";
import { NewChainForm } from "@/app/components/NewChainForm";

const isElectron = import.meta.env.VITE_PLATFORM === "electron";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ChainMaker" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),

  // shellComponent is used by TanStack Start for SSR — must not be set in
  // Electron because plain TanStack Router will render it inside #root,
  // producing an <html> inside a <div> and mounting unwanted global elements.
  ...(isElectron ? {} : { shellComponent: RootDocument }),
  component: RootContent,
});

const THEME_INIT_SCRIPT = `
(function(){
  try {
    var s = window.__ELECTRON_SETTINGS__ || JSON.parse(localStorage.getItem('chainmaker_settings') || '{}');
    var h = document.documentElement;
    h.setAttribute('data-theme', s.theme || 'azure');
    if (s.dark !== false) h.setAttribute('data-dark', '');
    if (s.scale && s.scale !== 100) h.style.fontSize = s.scale + '%';
  } catch(e) {}
})();
`.trim();

function AppToastContainer() {
  return (
    <ToastContainer
      position="top-center"
      hideProgressBar
      pauseOnHover
      transition={Zoom}
      autoClose={5000}
      className={"text-sm"}
    />
  );
}

function DisplayNameModal() {
  const { needsDisplayName, resolveDisplayName } = useCurrentUser();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!needsDisplayName) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await resolveDisplayName(name.trim());
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return createPortal(
    <ModalShell onClose={() => {}}>
      <h2 className="text-base font-semibold text-ink">One last step</h2>
      <p className="text-xs text-muted">Choose a display name for your ChainMaker account.</p>
      <p className="text-xs text-muted">
        No social features are planned — this is only visible to you.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 pt-1">
        <input
          type="text"
          placeholder="Display name"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-edge bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded bg-accent px-4 py-2 text-sm text-white transition-colors hover:opacity-80 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Continue"}
        </button>
      </form>
    </ModalShell>,
    document.body,
  );
}

// ── Electron SPA root ─────────────────────────────────────────────────────────

function RootContent() {
  const navigate = useNavigate();
  const [newChainOpen, setNewChainOpen] = useState(false);

  // Electron global menu events: new chain, open chain, new/edit jumpdoc.
  // Save/Save As are handled inside the chain route component.
  useEffect(() => {
    if (!isElectron) return;
    const api = window.electronAPI;
    if (!api) return;

    function hasUnsavedChanges(): boolean {
      const chainPatches = useChainStore.getState().updates.cumulativePatches.length;
      const docPatches = useJumpDocStore.getState().updates.cumulativePatches.length;
      return chainPatches > 0 || docPatches > 0;
    }

    function confirmNavigateAway(): boolean {
      if (!hasUnsavedChanges()) return true;
      return window.confirm("You have unsaved changes. Discard them and continue?");
    }

    const onNewChain = () => {
      if (!confirmNavigateAway()) return;
      setNewChainOpen(true);
    };

    const onOpenChain = (result: unknown) => {
      if (!confirmNavigateAway()) return;
      const { id } = result as { id: string };
      navigate({ to: "/chain/$chainId", params: { chainId: id } });
    };

    const onNewJumpdoc = (result: unknown) => {
      if (!confirmNavigateAway()) return;
      const { filePath } = result as { filePath: string };
      navigate({ to: "/jumpdoc/$docId", params: { docId: filePath } });
    };

    const onEditJumpdoc = (result: unknown) => {
      if (!confirmNavigateAway()) return;
      const { filePath } = result as { filePath: string };
      navigate({ to: "/jumpdoc/$docId", params: { docId: filePath } });
    };

    const onBrowseJumpdocs = () => {
      if (!confirmNavigateAway()) return;
      navigate({ to: "/gallery" });
    };

    const onClose = () => {
      if (!confirmNavigateAway()) return;
      navigate({ to: "/" });
    };

    const onBeforeClose = () => {
      if (
        hasUnsavedChanges() &&
        !window.confirm("You have unsaved changes. Discard them and exit?")
      ) {
        return;
      }
      api.confirmClose();
    };

    api.onUpdaterEvent("update-available", (version) => {
      toast.info(`Downloading update ${version}…`, { autoClose: false, toastId: "updater" });
    });
    api.onUpdaterEvent("download-progress", (pct) => {
      toast.update("updater", { render: `Downloading update… ${pct as number}%` });
    });
    api.onUpdaterEvent("update-downloaded", () => {
      toast.dismiss("updater");
    });

    api.onMenuEvent("menu:new-chain", onNewChain);
    api.onMenuEvent("menu:open-chain", onOpenChain);
    api.onMenuEvent("menu:new-jumpdoc", onNewJumpdoc);
    api.onMenuEvent("menu:edit-jumpdoc", onEditJumpdoc);
    api.onMenuEvent("menu:browse-jumpdocs", onBrowseJumpdocs);
    api.onMenuEvent("menu:close", onClose);
    api.onBeforeClose(onBeforeClose);
    return () => {
      api.offMenuEvent("menu:new-chain", onNewChain);
      api.offMenuEvent("menu:open-chain", onOpenChain);
      api.offMenuEvent("menu:new-jumpdoc", onNewJumpdoc);
      api.offMenuEvent("menu:edit-jumpdoc", onEditJumpdoc);
      api.offMenuEvent("menu:browse-jumpdocs", onBrowseJumpdocs);
      api.offMenuEvent("menu:close", onClose);
      // onBeforeClose is registered once and cleaned up with the component
    };
  }, [navigate]);

  return (
    <>
      <UndoRedoProvider />
      <ThemeProvider>
        <AuthProvider>
          <Outlet />
          {!isElectron && <DisplayNameModal />}
          {isElectron &&
            newChainOpen &&
            createPortal(
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setNewChainOpen(false);
                }}
              >
                <div className="w-full max-w-lg rounded-xl border border-edge bg-surface shadow-xl">
                  <div className="flex items-center justify-between border-b border-line px-5 py-4">
                    <h2 className="text-base font-semibold text-ink">New Chain</h2>
                    <button
                      onClick={() => setNewChainOpen(false)}
                      className="rounded p-1 text-ghost transition-colors hover:bg-tint hover:text-ink"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <NewChainForm
                    firebaseUser={null}
                    onCreated={(publicUid) => {
                      setNewChainOpen(false);
                      navigate({ to: "/chain/$chainId", params: { chainId: publicUid } });
                    }}
                    onCancel={() => setNewChainOpen(false)}
                  />
                </div>
              </div>,
              document.body,
            )}
        </AuthProvider>
        <AppToastContainer />
      </ThemeProvider>
    </>
  );
}

// ── Web SSR/Start root ────────────────────────────────────────────────────────

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <UndoRedoProvider />
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
          <AppToastContainer />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
