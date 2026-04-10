/**
 * JumpDocPickerModal — modal for starting a chain from a JumpDoc.
 *
 * Two tabs:
 *  - "Add to New Chain"      — wraps NewChainForm with the selected doc pre-filled
 *  - "Add to Existing Chain"
 *
 * Always portals to document.body so it escapes any backdrop-filter ancestor.
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { NewChainForm } from "@/app/components/NewChainForm";
import { AddJumpDocToChain } from "@/app/components/AddJumpDocToChain";
import { useCurrentUser } from "@/app/state/auth";
import type { JumpDocSummary } from "@/api/jumpdocs";

type Tab = "new" | "existing";

export type JumpDocPickerModalProps = {
  /** The JumpDoc that was selected. If omitted, NewChainForm opens without a pre-selected doc. */
  doc?: JumpDocSummary;
  onClose: () => void;
  defaultTab?: Tab;
};

export function JumpDocPickerModal({ doc, onClose, defaultTab = "new" }: JumpDocPickerModalProps) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const { firebaseUser } = useCurrentUser();
  const navigate = useNavigate();

  function handleCreated(publicUid: string) {
    onClose();
    navigate({ to: "/chain/$chainId", params: { chainId: publicUid } });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl border border-edge bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">
            {doc ? doc.name : "New Chain"}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-ghost transition-colors hover:bg-tint hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab bar — only shown when a doc is selected (no doc = new chain only) */}
        {doc && (
          <div className="flex border-b border-line text-sm">
            <button
              onClick={() => setTab("new")}
              className={`flex-1 py-2 text-center transition-colors ${
                tab === "new" ? "bg-accent text-white" : "text-muted hover:text-ink"
              }`}
            >
              Add to New Chain
            </button>
            <button
              onClick={() => setTab("existing")}
              className={`flex-1 py-2 text-center transition-colors ${
                tab === "existing" ? "bg-accent text-white" : "text-muted hover:text-ink"
              }`}
            >
              Add to Existing Chain
            </button>
          </div>
        )}

        {/* Tab content */}
        {tab === "new" && (
          <NewChainForm
            initialJumpdoc={doc}
            firebaseUser={firebaseUser}
            onCreated={handleCreated}
            onCancel={onClose}
          />
        )}
        {tab === "existing" && (
          <AddJumpDocToChain
            doc={doc}
            onSelect={(chainPublicUid) => {
              window.location.href = doc
                ? `/chain/${chainPublicUid}/add-doc?doc=${encodeURIComponent(doc.publicUid)}`
                : `/chain/${chainPublicUid}`;
            }}
            onCancel={onClose}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
