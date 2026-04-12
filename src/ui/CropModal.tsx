import { useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { X } from "lucide-react";

type Props = {
  src: string;
  fileName: string;
  onConfirm: (file: File) => void;
  onCancel: () => void;
};

function centerSquareCrop(width: number, height: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, 1, width, height),
    width,
    height,
  );
}

export function CropModal({ src, fileName, onConfirm, onCancel }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setCrop(centerSquareCrop(naturalWidth, naturalHeight));
  }, []);

  function handleConfirm() {
    const img = imgRef.current;
    if (!img || !completedCrop) return;

<<<<<<< HEAD
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

    const naturalW = Math.round(completedCrop.width * scaleX);
    const naturalH = Math.round(completedCrop.height * scaleY);
    const size = Math.min(naturalW, naturalH);

    const canvas = document.createElement("canvas");
=======
    const canvas = document.createElement("canvas");
    const size = Math.min(completedCrop.width, completedCrop.height);
>>>>>>> 9a3e440b7fa7286ef0af8855a7d2a00aea6bd42a
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

<<<<<<< HEAD
=======
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

>>>>>>> 9a3e440b7fa7286ef0af8855a7d2a00aea6bd42a
    ctx.drawImage(
      img,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      size,
      size,
    );

<<<<<<< HEAD
    // Output lossless PNG — the server (web) or IPC (Electron) converts to AVIF.
    const baseName = fileName.replace(/\.[^.]+$/, "");
    canvas.toBlob((blob) => {
      if (!blob) return;
      onConfirm(new File([blob], `${baseName}_cropped.png`, { type: "image/png" }));
    }, "image/png");
=======
    canvas.toBlob((blob) => {
      if (!blob) return;
      const ext = fileName.replace(/^.*\./, "");
      const mimeType = ext === "png" ? "image/png" : "image/jpeg";
      const baseName = fileName.replace(/\.[^.]+$/, "");
      onConfirm(new File([blob], `${baseName}_cropped.${ext === "png" ? "png" : "jpg"}`, { type: mimeType }));
    }, "image/jpeg", 0.95);
>>>>>>> 9a3e440b7fa7286ef0af8855a7d2a00aea6bd42a
  }

  return createPortal(
    <div
      className="fixed inset-0 z-200 flex items-center justify-center bg-canvas/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
<<<<<<< HEAD
      <div className="flex flex-col bg-surface border border-edge rounded-lg shadow-xl max-w-[90vw] w-fit">
=======
      <div className="flex flex-col bg-canvas border border-edge rounded-lg shadow-xl max-w-[90vw] max-h-[90vh] overflow-hidden">
>>>>>>> 9a3e440b7fa7286ef0af8855a7d2a00aea6bd42a
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge shrink-0">
          <span className="text-sm font-semibold text-ink">Crop Image</span>
          <button
            type="button"
            onClick={onCancel}
            className="text-ghost hover:text-ink transition-colors p-1"
          >
            <X size={14} />
          </button>
        </div>

<<<<<<< HEAD
        <div className="p-4 flex items-center justify-center">
=======
        {/* Crop area */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-0">
>>>>>>> 9a3e440b7fa7286ef0af8855a7d2a00aea6bd42a
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={1}
            minWidth={32}
            minHeight={32}
          >
            <img
              ref={imgRef}
              src={src}
              onLoad={onImageLoad}
<<<<<<< HEAD
              style={{ maxWidth: "min(70vw, 600px)", maxHeight: "calc(95vh - 9rem)" }}
=======
              className="max-w-[70vw] max-h-[60vh] object-contain"
>>>>>>> 9a3e440b7fa7286ef0af8855a7d2a00aea6bd42a
              alt="Crop preview"
            />
          </ReactCrop>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-edge shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-muted hover:text-ink border border-edge rounded hover:border-trim transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!completedCrop}
            className="px-4 py-1.5 text-sm font-medium rounded bg-accent2-tint text-accent2 border border-accent2/40 hover:bg-accent2/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Crop &amp; Upload
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
