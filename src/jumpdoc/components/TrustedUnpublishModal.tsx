import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function TrustedUnpublishModal({
  docName,
  onClose,
  onSubmit,
  saving,
}: {
  docName: string;
  onClose: () => void;
  onSubmit: (rationale: string) => Promise<void>;
  saving: boolean;
}) {
  const [rationale, setRationale] = useState("");

  const panel = document.getElementById("jumpdoc-editor-outer");
  if (!panel) return null;

  return createPortal(
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-canvas/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex flex-col bg-canvas border border-edge rounded-lg shadow-xl w-80">
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge shrink-0">
          <span className="text-sm font-semibold text-ink">Unpublish "{docName}"</span>
          <button
            type="button"
            onClick={onClose}
            className="text-ghost hover:text-ink transition-colors p-1"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">Why are you unpublishing this?</label>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={4}
              placeholder="Explain why this jumpdoc is being removed…"
              className="w-full resize-none rounded border border-edge bg-tint px-3 py-2 text-sm text-ink placeholder:text-ghost focus:outline-none focus:border-trim"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-muted hover:text-ink transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!rationale.trim() || saving}
              onClick={() => void onSubmit(rationale.trim())}
              className="px-3 py-1.5 text-xs font-medium rounded border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Unpublishing…" : "Unpublish & Notify"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    panel,
  );
}
