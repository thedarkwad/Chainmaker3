import { Images, Trash2, User, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { ImgData } from "@/chain/data/AltForm";
import type { GID, Id } from "@/chain/data/types";
import { useCreateCompanion } from "@/chain/state/hooks";
import { useImageUrlCache } from "@/chain/state/ImageUrlCache";
import { useCurrentUser } from "@/app/state/auth";
import { ImageGallery } from "@/app/components/ImageGallery";
import type { ImageSummary } from "@/api/images";

const isElectron = import.meta.env.VITE_PLATFORM === "electron";

// ─────────────────────────────────────────────────────────────────────────────

export function NewCompanionModal({
  onDone,
  onCancel,
}: {
  /** Called with the newly created character's id after the user submits. */
  onDone: (charId: Id<GID.Character>) => void;
  onCancel: () => void;
}) {
  const createCompanion = useCreateCompanion();
  const { firebaseUser } = useCurrentUser();

  // True when the most recent mousedown landed directly on the backdrop (not inside the card).
  const mouseDownOnBackdrop = useRef(false);

  // ── Draft fields ───────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState(Math.floor(Math.random() * 20 + 17));
  const [species, setSpecies] = useState("Human");
  const [backgroundSummary, setBackgroundSummary] = useState("");
  const [backgroundDescription, setBackgroundDescription] = useState("");
  const [personality, setPersonality] = useState("");

  // ── Image draft ────────────────────────────────────────────────────────────
  const [imageMode, setImageMode] = useState<"none" | "external" | "internal">(
    "none",
  );
  const [externalUrl, setExternalUrl] = useState("");
  const [internalImg, setInternalImg] = useState<{
    imgId: string;
    previewUrl: string;
  } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerStyle, setPickerStyle] = useState<React.CSSProperties>({});
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);

  const previewUrl =
    imageMode === "external"
      ? externalUrl
      : imageMode === "internal"
        ? (internalImg?.previewUrl ?? "")
        : "";

  // ── Picker position ────────────────────────────────────────────────────────
  function calcPickerStyle(): React.CSSProperties {
    const btn = pickerTriggerRef.current;
    if (!btn) return {};
    const rect = btn.getBoundingClientRect();
    const width = 300;
    const maxHeight = 360;
    const style: React.CSSProperties = {
      position: "fixed",
      width,
      maxHeight,
      zIndex: 10000,
    };
    if (window.innerWidth - rect.left >= rect.right) {
      style.left = rect.left;
    } else {
      style.right = window.innerWidth - rect.right;
    }
    if (
      window.innerHeight - rect.bottom >= maxHeight ||
      window.innerHeight - rect.bottom >= rect.top
    ) {
      style.top = rect.bottom + 6;
    } else {
      style.bottom = window.innerHeight - rect.top + 6;
    }
    return style;
  }

  useEffect(() => {
    if (!pickerOpen) return;
    function handleResize() {
      setPickerStyle(calcPickerStyle());
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [pickerOpen]);

  function openPicker() {
    setPickerStyle(calcPickerStyle());
    setPickerOpen(true);
  }

  function handlePickImage(image: ImageSummary) {
    useImageUrlCache.getState().setUrl(image._id, image.path);
    setInternalImg({ imgId: image._id, previewUrl: image.path });
    setImageMode("internal");
    setPickerOpen(false);
  }

  async function handleElectronUpload() {
    const api = window.electronAPI;
    if (!api) return;
    const result = await api.images.uploadImage();
    if (!result) return;
    useImageUrlCache.getState().setUrl(result.id, result.url);
    setInternalImg({ imgId: result.id, previewUrl: result.url });
    setImageMode("internal");
  }

  function clearImage() {
    setImageMode("none");
    setExternalUrl("");
    setInternalImg(null);
    setPickerOpen(false);
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  function handleSubmit() {
    const image: ImgData | undefined =
      imageMode === "external" && externalUrl.trim()
        ? { type: "external", URL: externalUrl.trim() }
        : imageMode === "internal" && internalImg
          ? { type: "internal", imgId: internalImg.imgId }
          : undefined;

    const newCharId = createCompanion({
      name: name.trim(),
      gender: gender.trim(),
      species: species.trim(),
      age,
      backgroundSummary: backgroundSummary.trim(),
      backgroundDescription: backgroundDescription.trim(),
      personality: personality.trim(),
      image,
    });
    onDone(newCharId);
  }

  // ── Input classes ──────────────────────────────────────────────────────────
  const inputCls =
    "w-full text-sm text-ink bg-canvas border border-edge rounded px-2 py-1.5 focus:outline-none focus:border-accent-ring placeholder:text-ghost";

  return (
    <>
      {createPortal(
        <div
          className="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-black/50"
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => {
            e.stopPropagation();
            mouseDownOnBackdrop.current = e.target === e.currentTarget;
          }}
          onClick={() => {
            if (mouseDownOnBackdrop.current) onCancel();
          }}
        >
          <div
            className="bg-tint border border-edge rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === "Escape") onCancel();
            }}
          >
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-edge">
              <p className="flex-1 text-sm font-semibold text-ink">
                New Companion
              </p>
              <button
                type="button"
                onClick={onCancel}
                className="p-1 rounded text-ghost hover:text-ink transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* ── Body ────────────────────────────────────────────────────── */}
            <div className="p-4 flex gap-4">
              {/* Left: image */}
              <div className="shrink-0 flex flex-col items-center gap-2">
                {/* Image display */}
                <div className="w-28 h-28 border border-edge rounded-lg overflow-hidden bg-tint flex items-center justify-center shrink-0">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User size={36} className="text-ghost" />
                  )}
                </div>

                {/* Image controls */}
                {imageMode === "none" && (
                  <div className="flex flex-col gap-1 w-full">
                    <button
                      type="button"
                      onClick={() => setImageMode("external")}
                      className="px-2 py-1 text-xs font-medium rounded border border-edge text-muted hover:text-ink hover:border-trim transition-colors w-full"
                    >
                      Link
                    </button>
                    {isElectron ? (
                      <button
                        type="button"
                        onClick={handleElectronUpload}
                        className="flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium rounded border border-edge text-muted hover:text-ink hover:border-trim transition-colors w-full"
                      >
                        <Images size={11} />
                        Upload
                      </button>
                    ) : (
                      <button
                        ref={pickerTriggerRef}
                        type="button"
                        onClick={() => {
                          setImageMode("internal");
                          openPicker();
                        }}
                        disabled={!firebaseUser}
                        title={
                          !firebaseUser ? "Sign in to upload images" : undefined
                        }
                        className="flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium rounded border border-edge text-muted hover:text-ink hover:border-trim transition-colors w-full disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Images size={11} />
                        Upload
                      </button>
                    )}
                  </div>
                )}

                {imageMode === "internal" && (
                  <button
                    ref={isElectron ? undefined : pickerTriggerRef}
                    type="button"
                    onClick={() =>
                      isElectron ? handleElectronUpload() : openPicker()
                    }
                    className="flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium rounded border border-edge text-muted hover:text-ink hover:border-trim transition-colors w-full"
                  >
                    <Images size={11} />
                    Change
                  </button>
                )}

                {imageMode !== "none" && (
                  <button
                    type="button"
                    onClick={clearImage}
                    className="flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium rounded border border-edge text-muted hover:text-red-500 hover:border-red-400 transition-colors w-full"
                  >
                    <Trash2 size={11} />
                    Remove
                  </button>
                )}
              </div>

              {/* Right: fields */}
              <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                {/* External URL input — shown inline when in external mode */}
                {imageMode === "external" && (
                  <div>
                    <label className="text-xs text-muted font-medium">
                      Image URL
                    </label>
                    <input
                      type="url"
                      value={externalUrl}
                      onChange={e => setExternalUrl(e.target.value)}
                      placeholder="https://…"
                      autoFocus
                      className={inputCls}
                    />
                  </div>
                )}

                {/* Name */}
                <div>
                  <label className="text-xs text-muted font-medium">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Companion name"
                    className={inputCls}
                    autoFocus={imageMode !== "external"}
                  />
                </div>

                {/* Species */}
                <div>
                  <label className="text-xs text-muted font-medium">Species</label>
                  <input
                    type="text"
                    value={species}
                    onChange={e => setSpecies(e.target.value)}
                    placeholder="Species"
                    className={inputCls}
                  />
                </div>

                {/* Age + Gender */}
                <div className="grid grid-cols-[5rem_1fr] gap-2">
                  <div>
                    <label className="text-xs text-muted font-medium">
                      Age
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={age}
                      onChange={e => setAge(Math.max(0, +e.target.value))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted font-medium">
                      Gender
                    </label>
                    <input
                      type="text"
                      value={gender}
                      onChange={e => setGender(e.target.value)}
                      placeholder="e.g. Female"
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Background summary */}
                <div>
                  <label className="text-xs text-muted font-medium">
                    Background
                  </label>
                  <input
                    type="text"
                    value={backgroundSummary}
                    onChange={e => setBackgroundSummary(e.target.value)}
                    placeholder="Background"
                    className={inputCls}
                  />
                  <textarea
                    value={backgroundDescription}
                    onChange={e => setBackgroundDescription(e.target.value)}
                    placeholder="Longer background description (optional)..."
                    rows={2}
                    className={`${inputCls} resize-none mt-1`}
                  />
                </div>

                {/* Personality */}
                <div>
                  <label className="text-xs text-muted font-medium">
                    Personality
                  </label>
                  <textarea
                    value={personality}
                    onChange={e => setPersonality(e.target.value)}
                    placeholder="Personality summary"
                    rows={2}
                    className={`${inputCls} resize-none`}
                  />
                </div>
              </div>
            </div>

            {/* ── Footer ──────────────────────────────────────────────────── */}
            <div className="shrink-0 flex items-center justify-end gap-2 px-4 py-3 border-t border-edge">
              <button
                type="button"
                onClick={onCancel}
                className="text-xs px-3 py-1.5 rounded border border-edge text-muted hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="text-xs px-3 py-1.5 rounded bg-accent text-surface hover:opacity-80 transition-opacity font-medium"
              >
                Create Companion
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Image picker portal */}
      {pickerOpen &&
        createPortal(
          <>
            <div
              className="fixed inset-0"
              style={{ zIndex: 9999 }}
              onClick={() => setPickerOpen(false)}
            />
            <div
              className="bg-canvas border border-edge rounded-lg shadow-xl overflow-y-auto p-3"
              style={pickerStyle}
            >
              <ImageGallery
                pageSize={9}
                onSelect={handlePickImage}
                minCardWidth={80}
              />
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
