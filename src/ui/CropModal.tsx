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

    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

    const naturalW = Math.round(completedCrop.width * scaleX);
    const naturalH = Math.round(completedCrop.height * scaleY);
    const size = Math.min(naturalW, naturalH);

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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

    // Output lossless PNG — the server (web) or IPC (Electron) converts to AVIF.
    const baseName = fileName.replace(/\.[^.]+$/, "");
    canvas.toBlob((blob) => {
      if (!blob) return;
      onConfirm(new File([blob], `${baseName}_cropped.png`, { type: "image/png" }));
    }, "image/png");
  }

  return createPortal(
    <div
      className="fixed inset-0 z-200 flex items-center justify-center bg-canvas/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="flex flex-col bg-surface border border-edge rounded-lg shadow-xl max-w-[90vw] w-fit">
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

        <div className="p-4 flex items-center justify-center">
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
              style={{ maxWidth: "min(70vw, 600px)", maxHeight: "calc(95vh - 9rem)" }}
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
