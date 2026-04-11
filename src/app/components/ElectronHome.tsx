import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, FileText, FolderOpen, Plus } from "lucide-react";
import { NewChainForm } from "@/app/components/NewChainForm";

export function ElectronHome() {
  const navigate = useNavigate();
  const [showNewChain, setShowNewChain] = useState(false);

  async function handleOpenChain() {
    const result = await window.electronAPI?.chains.openFilePicker();
    if (result) navigate({ to: "/chain/$chainId", params: { chainId: result.id } });
  }

  function handleEditJumpdoc() {
    window.electronAPI?.jumpdocs.openAndPrepare();
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-canvas gap-10">
      {/* Wordmark */}
      <div className="flex flex-col items-center gap-3">
        {/* <img src="/GalaxyIcon4.png" alt="" aria-hidden className="w-20 h-20 select-none" /> */}
        <h1
          className="text-5xl text-ink tracking-tight"
          style={{ fontFamily: "Roboto Slab, serif" }}
        >
          ChainMaker
        </h1>
      </div>

      {/* Actions or New Chain form */}
      {showNewChain ? (
        <div className="w-full max-w-md px-6">
          <NewChainForm
            firebaseUser={null}
            onCreated={(publicUid) =>
              navigate({ to: "/chain/$chainId", params: { chainId: publicUid } })
            }
            onCancel={() => setShowNewChain(false)}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 w-72">
          <button
            onClick={() => setShowNewChain(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-edge bg-surface px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-accent hover:bg-accent-tint"
          >
            <Plus size={16} className="text-accent shrink-0" />
            New Chain
          </button>
          <button
            onClick={handleOpenChain}
            className="flex w-full items-center gap-3 rounded-xl border border-edge bg-surface px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-accent hover:bg-accent-tint"
          >
            <FolderOpen size={16} className="text-accent shrink-0" />
            Open Chain…
          </button>
          <button
            onClick={handleEditJumpdoc}
            className="flex w-full items-center gap-3 rounded-xl border border-edge bg-surface px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-accent hover:bg-accent-tint"
          >
            <FileText size={16} className="text-accent shrink-0" />
            Edit Jumpdoc…
          </button>
          <Link
            to="/gallery"
            className="flex w-full items-center gap-3 rounded-xl border border-edge bg-surface px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-accent hover:bg-accent-tint"
          >
            <BookOpen size={16} className="text-accent shrink-0" />
            Browse Jumpdoc Library
          </Link>
        </div>
      )}
    </div>
  );
}
