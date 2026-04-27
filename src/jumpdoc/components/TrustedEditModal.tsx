import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Send } from "lucide-react";

type Props = {
  onClose: () => void;
  onSubmit: (what: string, why: string, how: string) => Promise<void>;
  saving: boolean;
};

/**
 * TrustedEditModal — portals into #jumpdoc-editor-outer.
 * Prompts a trusted editor to explain their change before it is saved.
 */
export function TrustedEditModal({ onClose, onSubmit, saving }: Props) {
  const [what, setWhat] = useState("");
  const [why, setWhy] = useState("");
  const [how, setHow] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = what.trim().length > 0 && why.trim().length > 0 && !saving;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await onSubmit(what.trim(), why.trim(), how.trim());
    } catch {
      setError("Failed to save. Please try again.");
    }
  }

  const panel = document.getElementById("jumpdoc-editor-outer");
  if (!panel) return null;

  return createPortal(
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-canvas/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="flex flex-col bg-canvas border border-edge rounded-lg shadow-xl w-96 max-h-[85%]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge shrink-0">
          <span className="text-sm font-semibold text-ink">Explain your change</span>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-ghost hover:text-ink transition-colors p-1 disabled:opacity-40"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-ghost uppercase tracking-wider">
              What did you change? <span className="text-danger">*</span>
            </label>
            <textarea
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              rows={3}
              className="w-full rounded border border-edge bg-tint px-3 py-2 text-sm text-ink resize-none focus:outline-none focus:border-trim placeholder:text-ghost"
              placeholder="Describe the change you made…"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-ghost uppercase tracking-wider">
              Why did you make this change? <span className="text-danger">*</span>
            </label>
            <textarea
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              rows={3}
              className="w-full rounded border border-edge bg-tint px-3 py-2 text-sm text-ink resize-none focus:outline-none focus:border-trim placeholder:text-ghost"
              placeholder="Explain your reasoning…"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-ghost uppercase tracking-wider">
              How can the owner replicate it?{" "}
              <span className="text-ghost font-normal normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              value={how}
              onChange={(e) => setHow(e.target.value)}
              rows={3}
              className="w-full rounded border border-edge bg-tint px-3 py-2 text-sm text-ink resize-none focus:outline-none focus:border-trim placeholder:text-ghost"
              placeholder="Steps the owner could follow to apply the same change themselves…"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end gap-2 px-4 py-3 border-t border-edge">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 text-sm text-muted hover:text-ink border border-edge rounded hover:border-trim transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded bg-accent-tint text-accent border border-accent/40 hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          >
            <Send size={13} />
            {saving ? "Saving…" : "Save & Send"}
          </button>
        </div>
      </div>
    </div>,
    panel,
  );
}
