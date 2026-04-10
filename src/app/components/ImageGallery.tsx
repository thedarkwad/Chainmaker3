/**
 * ImageGallery — a self-contained image browser / picker.
 *
 * Loads all images owned by the current user, displays them in a responsive
 * square-cropped grid. Supports:
 *  - Selecting an image (accent2 highlight; fires `onSelect` if provided)
 *  - Native file upload (JPEG, PNG, GIF, WebP up to 10 MB)
 *  - Image Chest upload (button greyed out when no imgChest API key is stored)
 *  - Deleting the selected image
 *  - Usage bar showing imageUsage against quota
 *
 * Requires `useCurrentUser()` — must be rendered inside `<AuthProvider>`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSnappedGridColumns } from "@/ui/useSnappedGridColumns";
import { Check, ImagePlus, Loader2, Trash2, Unlink, Upload } from "lucide-react";
import { useCurrentUser } from "@/app/state/auth";
import {
  listUserImages,
  uploadImage,
  uploadImgChestImage,
  deleteImage,
  unlinkImage,
  type ImageSummary,
} from "@/api/images";
import { Pagination } from "@/ui/Pagination";
import { Tip } from "@/ui/Tip";

// ─────────────────────────────────────────────────────────────────────────────
// StorageBar (image quota)
// ─────────────────────────────────────────────────────────────────────────────

function StorageBar({ currentBytes, maxBytes }: { currentBytes: number; maxBytes: number }) {
  const usedMb = currentBytes / 1024 / 1024;
  const maxMb = maxBytes / 1024 / 1024;
  const pct = Math.min(100, maxBytes > 0 ? (currentBytes / maxBytes) * 100 : 0);
  const barColor = pct >= 90 ? "bg-danger" : "bg-accent2";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-ghost uppercase tracking-wider">
          Image Storage
        </span>
        <span className="text-[10px] text-ghost tabular-nums">
          {usedMb.toFixed(1)} / {maxMb.toFixed(0)} MB
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-edge overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ImageCard
// ─────────────────────────────────────────────────────────────────────────────

function ImageCard({
  image,
  selected,
  onSelect,
}: {
  image: ImageSummary;
  selected: boolean;
  onSelect: (image: ImageSummary) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(image)}
      className={`relative aspect-square overflow-hidden rounded border-2 transition-all ${
        selected
          ? "border-accent2 shadow-md shadow-accent2/20"
          : "border-edge hover:border-accent2/40"
      }`}
      title={`${(image.bytes / 1024).toFixed(0)} KB`}
    >
      <img src={image.path} alt="" draggable={false} className="w-full h-full object-cover" />
      {selected && (
        <div className="absolute bottom-1 right-1 flex items-center justify-center w-5 h-5 rounded-full bg-accent2 shadow">
          <Check size={11} strokeWidth={3} className="text-surface" />
        </div>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type ImageGalleryProps = {
  /** Called when the user clicks an image. Turns the gallery into a picker. */
  onSelect?: (image: ImageSummary) => void;
  /** Minimum card width in px for the auto-fill grid (default 100). */
  minCardWidth?: number;
  /** Applied to the outermost wrapper div. */
  className?: string;
  /** Optional informational message shown below the toolbar. */
  note?: React.ReactNode;
  /**
   * If set, the image grid scrolls independently and its max-height is capped
   * to this many rows. No scrollbar appears when the content fits within the cap.
   */
  maxRows?: number;
  /** Number of images per page. If omitted, all images are shown. */
  pageSize?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Gallery
// ─────────────────────────────────────────────────────────────────────────────

export function ImageGallery({
  onSelect,
  minCardWidth = 100,
  className,
  note,
  maxRows,
  pageSize,
}: ImageGalleryProps) {
  const { firebaseUser, dbUser } = useCurrentUser();

  const [images, setImages] = useState<ImageSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgChestFileInputRef = useRef<HTMLInputElement>(null);

  // Track imageUsage locally so the bar updates after upload/delete without a full reload
  const [usageBytes, setUsageBytes] = useState(dbUser?.imageUsage.currentBytes ?? 0);
  const maxBytes = dbUser?.imageUsage.maxBytes ?? 100 * 1024 * 1024;
  // Keep usageBytes in sync if dbUser changes (e.g. after re-auth)
  useEffect(() => {
    if (dbUser) setUsageBytes(dbUser.imageUsage.currentBytes);
  }, [dbUser]);

  const hasImgChest = dbUser?.apiKeyNames.includes("imgChest") ?? false;

  const reload = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    setError(null);
    try {
      const token = await firebaseUser.getIdToken();
      setImages(await listUserImages({ data: token }));
    } catch {
      setError("Failed to load images.");
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !firebaseUser) return;
    e.target.value = "";
    setError(null);
    setUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = arrayBuffer.byteLength;
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < uint8.byteLength; i++) binary += String.fromCharCode(uint8[i]);
      const fileData = btoa(binary);
      const token = await firebaseUser.getIdToken();
      const newImage = await uploadImage({
        data: { idToken: token, fileName: file.name, fileData, bytes },
      });
      setImages((prev) => [newImage, ...prev]);
      setUsageBytes((prev) => prev + bytes);
      setSelectedId(newImage._id);
      setPage(1);
      onSelect?.(newImage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleImgChestFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !firebaseUser) return;
    e.target.value = "";
    setError(null);
    setUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = arrayBuffer.byteLength;
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < uint8.byteLength; i++) binary += String.fromCharCode(uint8[i]);
      const fileData = btoa(binary);
      const token = await firebaseUser.getIdToken();
      const newImage = await uploadImgChestImage({
        data: { idToken: token, fileName: file.name, fileData, bytes },
      });
      setImages((prev) => [newImage, ...prev]);
      setSelectedId(newImage._id);
      setPage(1);
      onSelect?.(newImage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ImgChest upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!selectedId || !firebaseUser) return;
    setDeleting(true);
    setError(null);
    try {
      const token = await firebaseUser.getIdToken();
      const result = await deleteImage({ data: { idToken: token, imageId: selectedId } });
      if (result.status === "ok") {
        const deleted = images.find((img) => img._id === selectedId);
        setImages((prev) => prev.filter((img) => img._id !== selectedId));
        // Only deduct from the usage bar for native images (ImgChest images are hosted externally)
        if (deleted?.uploadType === "native") {
          setUsageBytes((prev) => prev - (deleted.bytes ?? 0));
        }
        setSelectedId(null);
      } else {
        setError(result.status === "unauthorized" ? "Not authorized." : "Image not found.");
      }
    } catch {
      setError("Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleUnlink() {
    if (!selectedId || !firebaseUser) return;
    setUnlinking(true);
    setError(null);
    try {
      const token = await firebaseUser.getIdToken();
      const result = await unlinkImage({ data: { idToken: token, imageId: selectedId } });
      if (result.status === "ok") {
        setImages((prev) => prev.filter((img) => img._id !== selectedId));
        setSelectedId(null);
      } else {
        setError(result.status === "unauthorized" ? "Not authorized." : "Image not found.");
      }
    } catch {
      setError("Unlink failed.");
    } finally {
      setUnlinking(false);
    }
  }

  function handleSelect(image: ImageSummary) {
    const newId = selectedId === image._id ? null : image._id;
    setSelectedId(newId);
    if (newId) onSelect?.(image);
  }

  const selectedImage = images.find((img) => img._id === selectedId);

  const totalPages = pageSize != null ? Math.max(1, Math.ceil(images.length / pageSize)) : 1;
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const visibleImages =
    pageSize != null ? images.slice((clampedPage - 1) * pageSize, clampedPage * pageSize) : images;

  const effectivePageSize = pageSize ?? (visibleImages.length || 1);
  const { gridRef, gridStyle } = useSnappedGridColumns({
    pageSize: effectivePageSize,
    minCardWidth,
  });

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-accent2 text-surface hover:bg-accent2/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploading ? "Uploading…" : "Upload"}
        </button>

        <input
          ref={imgChestFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
          className="hidden"
          onChange={handleImgChestFileChange}
        />
        <button
          type="button"
          onClick={() => imgChestFileInputRef.current?.click()}
          disabled={!hasImgChest || uploading}
          title={
            hasImgChest
              ? "Upload via Image Chest (hosted externally, no quota)"
              : "No Image Chest API key configured — add one in your account settings"
          }
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-edge text-muted hover:text-ink hover:border-trim disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ImagePlus size={12} />
          ImgChest
        </button>

        {selectedImage && (
          <div className="flex items-center gap-2 ml-auto">
            {selectedImage.uploadType === "imagechest" && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleUnlink}
                  disabled={unlinking}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-warn/40 text-warn hover:bg-warn/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {unlinking ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Unlink size={12} />
                  )}
                  Unlink
                </button>
                <Tip>
                  Removes this image from ChainMaker's records without deleting the file on
                  ImgChest.
                </Tip>
              </div>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete
            </button>
          </div>
        )}
      </div>

      {note && <p className="text-xs text-ghost italic">{note}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}

      {/* Grid */}
      <div
        className="overflow-y-auto"
        style={
          maxRows != null ? { maxHeight: maxRows * minCardWidth + (maxRows - 1) * 8 } : undefined
        }
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-ghost">
            <ImagePlus size={24} className="opacity-40" />
            <span className="text-sm italic">No images yet.</span>
          </div>
        ) : (
          <div ref={gridRef} className="grid gap-2" style={gridStyle}>
            {visibleImages.map((img) => (
              <ImageCard
                key={img._id}
                image={img}
                selected={img._id === selectedId}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pageSize != null && (
        <Pagination page={clampedPage} totalPages={totalPages} onPageChange={setPage} />
      )}

      {/* Usage bar */}
      <StorageBar currentBytes={usageBytes} maxBytes={maxBytes} />
    </div>
  );
}
