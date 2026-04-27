import { useState } from "react";
import { createPortal } from "react-dom";

export const NSFW_STORAGE_KEY = "cm:showNsfwGallery";

export function useNsfwToggle(): [boolean, (v: boolean) => void] {
  const [showNsfw, _set] = useState<boolean>(() => {
    try {
      return localStorage.getItem(NSFW_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  function setShowNsfw(v: boolean) {
    _set(v);
    try {
      localStorage.setItem(NSFW_STORAGE_KEY, String(v));
    } catch {}
  }

  return [showNsfw, setShowNsfw];
}

export function NsfwToggleButton({
  showNsfw,
  onToggle,
}: {
  showNsfw: boolean;
  onToggle: (v: boolean) => void;
}) {
  const [pendingConfirm, setPendingConfirm] = useState(false);

  function handleClick() {
    if (showNsfw) {
      onToggle(false);
    } else {
      setPendingConfirm(true);
    }
  }

  function handleConfirm() {
    setPendingConfirm(false);
    onToggle(true);
  }

  function handleCancel() {
    setPendingConfirm(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-colors ${
          showNsfw
            ? "bg-surface/25 text-surface border-surface/50 font-medium"
            : "text-surface/60 border-surface/20 hover:bg-surface/10 hover:text-surface hover:border-surface/30"
        }`}
      >
        Show NSFW content
      </button>

      {pendingConfirm &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/60 backdrop-blur-sm"
            onClick={e => {
              if (e.target === e.currentTarget) handleCancel();
            }}
          >
            <div className="flex flex-col gap-4 bg-canvas border border-red-500/40 rounded-lg shadow-xl w-80 p-5">
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-semibold text-ink">
                  Age Confirmation Required
                </p>
                <p className="text-xs text-muted leading-relaxed">
                  This will show content marked as adult content. Please confirm
                  you are 18 or older.
                </p>
                <p className="text-xs text-muted leading-relaxed">
                  Note that NSFW jumpdocs sometimes feature fetishizion of
                  non-consensual sexual situations, either implicity or
                  explicitly. If you would be uncomfortable seeing content of
                  this sort, you may want to leave these jumpdocs hidden.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-3 py-1.5 text-sm text-muted hover:text-ink border border-edge rounded hover:border-trim transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="px-4 py-1.5 text-sm rounded bg-red-500/15 text-red-400 border border-red-500/40 hover:bg-red-500/25 transition-colors font-medium"
                >
                  I am 18+
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
