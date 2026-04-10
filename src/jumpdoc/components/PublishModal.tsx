import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ImagePlus, Globe, Lock } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { TagField } from "@/ui/TagField";
import { useJumpDocMetaStore, type JumpDocAttributes } from "@/jumpdoc/state/JumpDocMetaStore";
import { publishJumpDoc } from "@/api/jumpdocs";
import {
  GENRE_OPTIONS,
  MEDIUM_OPTIONS,
  SUPERNATURAL_ELEMENTS_OPTIONS,
} from "@/jumpdoc/data/jumpDocAttributeOptions";
import { Tip } from "@/ui/Tip";
import { ImageGallery } from "@/app/components/ImageGallery";
import type { ImageSummary } from "@/api/images";

type Props = {
  firebaseUser: { getIdToken: () => Promise<string> } | null;
  onClose: () => void;
};

/**
 * PublishModal — portals into #jumpdoc-editor-outer.
 * Lets the user set metadata attributes and publish (or update) the JumpDoc.
 */
export function PublishModal({ firebaseUser, onClose }: Props) {
  const { docMongoId, published, nsfw: storeNsfw, attributes, imageId: storeImageId, imageUrl: storeImageUrl } =
    useJumpDocMetaStore(
      useShallow((s) => ({
        docMongoId: s.docMongoId,
        published: s.published,
        nsfw: s.nsfw,
        attributes: s.attributes,
        imageId: s.imageId,
        imageUrl: s.imageUrl,
      })),
    );
  const setPublished = useJumpDocMetaStore((s) => s.setPublished);
  const setNsfw = useJumpDocMetaStore((s) => s.setNsfw);
  const setAttributes = useJumpDocMetaStore((s) => s.setAttributes);
  const setCoverImage = useJumpDocMetaStore((s) => s.setCoverImage);

  // Local draft state — only committed to the store on save
  const [draft, setDraft] = useState<JumpDocAttributes>({ ...attributes });
  const [draftNsfw, setDraftNsfw] = useState<boolean>(storeNsfw);
  const [draftImageId, setDraftImageId] = useState<string | null>(storeImageId);
  const [draftImageUrl, setDraftImageUrl] = useState<string | null>(storeImageUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isElectron = import.meta.env.VITE_PLATFORM === "electron";

  // Image picker dropdown state (web only)
  const [pickerOpen, setPickerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pickerStyle, setPickerStyle] = useState<React.CSSProperties>({});

  function openPicker() {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPickerStyle({
        position: "fixed",
        top: rect.bottom + 6,
        left: rect.left,
        width: Math.max(rect.width, 300),
        maxHeight: 420,
        zIndex: 200,
      });
    }
    setPickerOpen(true);
  }

  function handleSelectImage(image: ImageSummary) {
    setDraftImageId(image._id);
    setDraftImageUrl(image.path);
    setPickerOpen(false);
  }

  async function handleElectronImageUpload() {
    const result = await window.electronAPI?.jumpdocs.uploadJumpdocThumb(docMongoId);
    if (result?.url) {
      setDraftImageUrl(result.url);
    }
  }

  function addTag(field: keyof JumpDocAttributes, val: string) {
    setDraft((d) => ({ ...d, [field]: [...d[field], val] }));
  }
  function removeTag(field: keyof JumpDocAttributes, val: string) {
    setDraft((d) => ({ ...d, [field]: d[field].filter((v) => v !== val) }));
  }

  async function handlePublish() {
    if (!firebaseUser || !docMongoId) return;
    setSaving(true);
    setError(null);
    try {
      const idToken = await firebaseUser.getIdToken();
      const result = await publishJumpDoc({
        data: { docMongoId, idToken, published: true, nsfw: draftNsfw, attributes: draft, imageId: draftImageId },
      });
      if (result.status === "ok") {
        setAttributes(draft);
        setPublished(true);
        setNsfw(draftNsfw);
        setCoverImage(draftImageId, draftImageUrl);
        onClose();
      } else {
        setError(
          result.status === "unauthorized"
            ? "You don't have permission to publish this jumpdoc."
            : "Jumpdoc not found.",
        );
      }
    } catch {
      setError("Failed to publish. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const panel = document.getElementById("jumpdoc-editor-outer");

  // Prevent the inner scroll panel from scrolling while the modal is open.
  useEffect(() => {
    const inner = document.getElementById("jumpdoc-editor-panel");
    if (!inner) return;
    const prev = inner.style.overflow;
    inner.style.overflow = "hidden";
    return () => {
      inner.style.overflow = prev;
    };
  }, []);

  if (!panel) return null;

  const isEditMode = published;

  return createPortal(
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-canvas/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex flex-col bg-canvas border border-edge rounded-lg shadow-xl w-80 max-h-[85%]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge shrink-0">
          <div className="flex items-center gap-2">
            {isEditMode ? (
              <Globe size={15} className="text-accent2" />
            ) : (
              <Lock size={15} className="text-ghost" />
            )}
            <span className="text-sm font-semibold text-ink">
              {isEditMode ? "Edit Metadata" : "Publish Jumpdoc"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ghost hover:text-ink transition-colors p-1"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
          {/* Cover image */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold text-ghost uppercase tracking-wider">
              Cover Image
            </p>
            <button
              ref={triggerRef}
              type="button"
              onClick={isElectron ? handleElectronImageUpload : openPicker}
              className="relative flex items-center gap-2 w-full border border-dashed border-edge rounded-lg overflow-hidden transition-colors hover:border-trim group"
              style={{ minHeight: 56 }}
            >
              {draftImageUrl ? (
                <>
                  <img
                    src={draftImageUrl}
                    alt="Cover"
                    className="w-14 h-14 object-cover shrink-0"
                  />
                  <span className="text-xs text-muted group-hover:text-ink transition-colors">
                    Change cover image…
                  </span>
                </>
              ) : (
                <span className="flex items-center gap-2 px-4 py-4 text-ghost group-hover:text-muted transition-colors">
                  <ImagePlus size={18} />
                  <span className="text-sm">Select cover image…</span>
                </span>
              )}
            </button>
          </div>

          {/* Genre */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold text-ghost uppercase tracking-wider">Genre</p>
            <TagField
              values={draft.genre}
              onAdd={(v) => addTag("genre", v)}
              onRemove={(v) => removeTag("genre", v)}
              suggestions={GENRE_OPTIONS}
              placeholder="Add genre…"
            />
          </div>

          {/* Medium */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold text-ghost uppercase tracking-wider">Medium</p>
            <TagField
              values={draft.medium}
              onAdd={(v) => addTag("medium", v)}
              onRemove={(v) => removeTag("medium", v)}
              suggestions={MEDIUM_OPTIONS}
              placeholder="Add medium…"
            />
          </div>

          {/* Franchise — free entry */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold text-ghost uppercase tracking-wider">
              Franchise <Tip>Admins may adjust this slightly to ensure consistency within the franchise (e.g. "Lupin the Third" → "Lupin III")</Tip>
            </p>
            <TagField
              values={draft.franchise}
              onAdd={(v) => addTag("franchise", v)}
              onRemove={(v) => removeTag("franchise", v)}
              placeholder="Add franchise…"
            />
          </div>

          {/* Supernatural elements
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold text-ghost uppercase tracking-wider">
              Supernatural Elements
            </p>
            <TagField
              values={draft.supernaturalElements}
              onAdd={(v) => addTag("supernaturalElements", v)}
              onRemove={(v) => removeTag("supernaturalElements", v)}
              suggestions={SUPERNATURAL_ELEMENTS_OPTIONS}
              placeholder="Add element…"
            />
          </div> */}

          {/* NSFW flag */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold text-ghost uppercase tracking-wider">Content</p>
            <button
              type="button"
              onClick={() => setDraftNsfw((v) => !v)}
              className={`flex items-center justify-between w-full px-3 py-2 rounded border transition-colors ${
                draftNsfw
                  ? "bg-danger/10 border-danger/40 text-danger"
                  : "bg-tint border-edge text-muted hover:border-trim hover:text-ink"
              }`}
            >
              <span className="text-xs font-medium">NSFW — adult content</span>
              {/* pill toggle */}
              <span
                className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border transition-colors ${
                  draftNsfw ? "bg-danger/70 border-danger/60" : "bg-edge border-edge"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-surface shadow transition-transform ${
                    draftNsfw ? "translate-x-3" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end gap-2 px-4 py-3 border-t border-edge">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-muted hover:text-ink border border-edge rounded hover:border-trim transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={saving || (!firebaseUser && import.meta.env.VITE_PLATFORM !== "electron")}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded bg-accent2-tint text-accent2 border border-accent2/40 hover:bg-accent2/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          >
            <Globe size={13} />
            {saving ? "Publishing…" : isEditMode ? "Save" : "Publish"}
          </button>
        </div>
      </div>

      {/* Image picker dropdown — portaled to document.body to avoid clipping (web only) */}
      {!isElectron && pickerOpen &&
        createPortal(
          <>
            {/* Invisible backdrop to close on outside click */}
            <div
              className="fixed inset-0"
              style={{ zIndex: 199 }}
              onClick={() => setPickerOpen(false)}
            />
            <div
              className="bg-canvas border border-edge rounded-lg shadow-xl overflow-y-auto p-3"
              style={pickerStyle}
            >
              <ImageGallery
                onSelect={handleSelectImage}
                minCardWidth={80}
                pageSize={9}
                note="Images are cropped to a square in the gallery thumbnail."
              />
            </div>
          </>,
          document.body,
        )}
    </div>,
    panel,
  );
}
