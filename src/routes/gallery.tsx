import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileText, FolderOpen } from "lucide-react";
import { useTheme } from "@/providers/ThemeProvider";
import { AppHeader } from "@/app/components/AppHeader";
import { UserDropdown } from "@/app/components/UserDropdown";
import { PortalNav } from "@/app/components/PortalNav";
import { JumpDocGallery } from "@/app/components/JumpDocGallery";
import { JumpDocPickerModal } from "@/app/components/JumpDocPickerModal";
import { JumpDocSidebar } from "@/app/components/JumpDocSidebar";
import { type JumpDocSummary } from "@/api/jumpdocs";
import { useCurrentUser } from "@/app/state/auth";

export const Route = createFileRoute("/gallery")({
  component: GalleryPage,
});

// ── GalleryPage ────────────────────────────────────────────────────────────────

function GalleryPage() {
  const { settings, updateSettings } = useTheme();
  const { firebaseUser } = useCurrentUser();
  const isElectron = import.meta.env.VITE_PLATFORM === "electron";

  const [selectedDoc, setSelectedDoc] = useState<JumpDocSummary | null>(null);
  const [search, setSearch] = useState("");
  const [pickerTab, setPickerTab] = useState<"new" | "existing" | null>(null);
  const [jumpdocFolder, setJumpdocFolder] = useState<string | null | undefined>(
    isElectron ? undefined : null, // undefined = not yet loaded
  );

  // Load configured jumpdoc folder path (Electron only)
  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI?.jumpdocs
      .getJumpdocFolder()
      .then(setJumpdocFolder)
      .catch(() => setJumpdocFolder(null));
  }, [isElectron]);

  const getIdToken = useCallback(
    () => (firebaseUser ? firebaseUser.getIdToken() : Promise.resolve(null)),
    [firebaseUser],
  );

  function openPicker(tab: "new" | "existing") {
    setPickerTab(tab);
  }

  function closePicker() {
    setPickerTab(null);
  }

  function handleConfigureFolder() {
    window.electronAPI?.jumpdocs
      .setJumpdocFolder()
      .then((folder) => {
        if (folder) setJumpdocFolder(folder);
      })
      .catch(console.error);
  }

  // Electron: show a prompt when no jumpdoc folder is configured yet
  const showFolderPrompt = isElectron && jumpdocFolder === null;

  return (
    <>
      <title>Jumpdoc Gallery | ChainMaker</title>
      <div className="flex h-dvh flex-col bg-radial-[at_0%_0%] from-accent2/20 via-canvas to-canvas">
        <AppHeader
          nav={<PortalNav />}
          actions={<UserDropdown />}
          settings={settings}
          onUpdateSettings={updateSettings}
          transparent
        />

        <div className="flex flex-1 min-h-0 flex-col">
          {/* Electron: folder not configured */}
          {showFolderPrompt && (
            <div className="flex items-center gap-3 border-b border-edge bg-surface px-6 py-3">
              <FolderOpen size={16} className="shrink-0 text-muted" />
              <p className="flex-1 text-sm text-muted">
                No JumpDoc folder configured. Point ChainMaker to a folder containing{" "}
                <code>.jumpdoc</code> files.
              </p>
              <button
                onClick={handleConfigureFolder}
                className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                Choose Folder
              </button>
            </div>
          )}
          {/* Electron: folder configured, show change button */}
          {isElectron && jumpdocFolder && (
            <div className="flex items-center gap-3 border-b border-edge bg-surface px-6 py-2">
              <FolderOpen size={14} className="shrink-0 text-ghost" />
              <p className="flex-1 truncate text-xs text-muted" title={jumpdocFolder}>
                {jumpdocFolder}
              </p>
              <button
                onClick={handleConfigureFolder}
                className="shrink-0 text-xs text-accent hover:underline"
              >
                Change
              </button>
            </div>
          )}
          <div className="flex flex-1 min-h-0">
            {/* Gallery */}
            <main className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-6xl p-4">
                <JumpDocGallery
                  pageSize={24}
                  onSelect={(doc) => setSelectedDoc(doc)}
                  searchQuery={search}
                  onSearchChange={setSearch}
                  getIdToken={getIdToken}
                />
              </div>
            </main>

            {/* Sidebar — large screens */}
            <div className="hidden w-72 shrink-0 flex-col overflow-y-auto border-l border-t border-edge bg-tint lg:flex">
              {!selectedDoc && (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                  <FileText size={24} className="text-edge" />
                  <p className="text-xs text-ghost">
                    Select a jumpdoc
                    <br />
                    to see details
                  </p>
                </div>
              )}
              {selectedDoc && (
                <JumpDocSidebar
                  doc={selectedDoc}
                  isOwner={selectedDoc.isOwner ?? false}
                  onClose={() => setSelectedDoc(null)}
                  onSearchChange={(s) => setSearch(s)}
                  onNewChain={() => openPicker("new")}
                  onExistingChain={() => openPicker("existing")}
                />
              )}
            </div>
          </div>
        </div>

        {/* Sidebar — small screens: overlay drawer, closes on outside click */}
        {selectedDoc && (
          <div
            className="fixed inset-0 z-40 backdrop-blur-sm lg:hidden"
            onMouseDown={() => setSelectedDoc(null)}
          >
            <div
              className="absolute right-0 top-0 flex h-full w-72 flex-col overflow-y-auto border-l border-edge bg-surface shadow-xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <JumpDocSidebar
                doc={selectedDoc}
                isOwner={selectedDoc.isOwner ?? false}
                onClose={() => setSelectedDoc(null)}
                onSearchChange={(s) => {
                  setSearch(s);
                  setSelectedDoc(null);
                }}
                onNewChain={() => openPicker("new")}
                onExistingChain={() => openPicker("existing")}
              />
            </div>
          </div>
        )}

        {pickerTab !== null && selectedDoc && (
          <JumpDocPickerModal doc={selectedDoc} defaultTab={pickerTab} onClose={closePicker} />
        )}
      </div>
    </>
  );
}
