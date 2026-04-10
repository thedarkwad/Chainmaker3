import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { User } from "lucide-react";

import { createId, type GID, type Id } from "@/chain/data/types";
import { useAltForm, useChain, useJumpName } from "@/chain/state/hooks";
import { useImageUrl } from "@/chain/state/ImageUrlCache";
import { AltFormEditor } from "@/chain/components/AltFormEditor";

// ─────────────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/chain/$chainId/char/$charId/summary/altforms")({
  component: SummaryAltForms,
});

// ─────────────────────────────────────────────────────────────────────────────

type AltFormEntry = {
  id: Id<GID.AltForm>;
  jumpId?: Id<GID.Jump>;
};

// Aspect ratio used before an image loads or when there is no image.
// No-image alt-forms use 1:1 (square placeholder).
const PLACEHOLDER_ASPECT_RATIO = 1;
// Aspect ratio used as an optimistic guess while an image is still loading.
const LOADING_ASPECT_RATIO = 4 / 3;
const MAX_ROW_HEIGHT = 260; // px — rows taller than this get cropped
const IMG_GAP = 8; // px — horizontal gap between cards in a row
const ROW_GAP = 8; // px — vertical gap between rows

const pillClass =
  "shrink-0 text-xs px-2 py-0.5 rounded-full bg-accent2-tint text-accent2 border border-accent2-ring hover:bg-accent2 hover:text-surface transition-colors font-medium";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function calcRowLayout(
  aspectRatios: number[],
  containerWidth: number,
): { height: number; cropped: boolean; widths: number[] } {
  const n = aspectRatios.length;
  const totalGap = (n - 1) * IMG_GAP;
  const available = Math.max(containerWidth - totalGap, 0);
  const sumRatios = aspectRatios.reduce((s, r) => s + r, 0);
  const rawHeight = sumRatios > 0 ? available / sumRatios : MAX_ROW_HEIGHT;
  const cropped = rawHeight > MAX_ROW_HEIGHT;
  const height = Math.min(rawHeight, MAX_ROW_HEIGHT);
  // When cropping, widths are derived from rawHeight so the row still fills the
  // full container width. The vertical overflow is handled by object-fit: cover.
  const widthHeight = cropped ? rawHeight : height;
  return { height, cropped, widths: aspectRatios.map((r) => widthHeight * r) };
}

// ─────────────────────────────────────────────────────────────────────────────
// JumpPill
// ─────────────────────────────────────────────────────────────────────────────

function JumpPill({
  jumpId,
  chainId,
  charId,
}: {
  jumpId: Id<GID.Jump>;
  chainId: string;
  charId: string;
}) {
  const jumpName = useJumpName(jumpId);
  return (
    <Link
      to="/chain/$chainId/char/$charId/jump/$jumpId"
      params={{ chainId, charId, jumpId: String(jumpId) }}
      className={pillClass}
    >
      {jumpName || "Jump"}
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AltFormThumbnail
// ─────────────────────────────────────────────────────────────────────────────

function AltFormThumbnail({
  entry,
  imgHeight,
  imgWidth,
  cropped,
  hasImage,
  onAspectRatio,
  onSelect,
  isSelected,
}: {
  entry: AltFormEntry;
  imgHeight: number;
  imgWidth: number;
  cropped: boolean;
  /** Whether this entry is expected to have an image (used to choose placeholder vs loading ratio). */
  hasImage: boolean;
  onAspectRatio: (id: Id<GID.AltForm>, ratio: number) => void;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const { altForm } = useAltForm(entry.id);
  const internalImgId = altForm?.image?.type === "internal" ? altForm.image.imgId : undefined;
  const cachedUrl = useImageUrl(internalImgId);
  const imgUrl = altForm?.image?.type === "external" ? altForm.image.URL : cachedUrl;

  // Load image and report its natural aspect ratio to the parent.
  useEffect(() => {
    if (!imgUrl) {
      onAspectRatio(entry.id, PLACEHOLDER_ASPECT_RATIO);
      return;
    }
    const img = new Image();
    let cancelled = false;
    img.onload = () => {
      if (!cancelled && img.naturalWidth && img.naturalHeight) {
        onAspectRatio(entry.id, img.naturalWidth / img.naturalHeight);
      }
    };
    img.onerror = () => {
      if (!cancelled) onAspectRatio(entry.id, PLACEHOLDER_ASPECT_RATIO);
    };
    img.src = imgUrl;
    return () => {
      cancelled = true;
    };
  }, [imgUrl, entry.id, onAspectRatio]);

  if (!altForm) return null;

  const name = altForm.name.trim() || "Unnamed Form";
  const descriptor = [altForm.sex.trim(), altForm.species.trim()].filter(Boolean).join(" ");

  return (
    <div
      style={{ width: imgWidth, flexShrink: 0 }}
      className={`cursor-pointer rounded overflow-hidden transition-all ${
        isSelected
          ? "ring-2 ring-accent-ring"
          : "hover:ring-2 hover:ring-accent-ring/50"
      }`}
      onClick={onSelect}
    >
      {/* Image / placeholder area */}
      <div
        style={{ height: imgHeight, width: imgWidth }}
        className="overflow-hidden bg-tint"
      >
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: cropped ? "cover" : "contain",
              objectPosition: "center top",
            }}
          />
        ) : (
          // Square placeholder — shown for alt-forms with no image or a broken URL.
          // hasImage=true means the URL is still loading; show a subtle pulse.
          <div
            className={`w-full h-full flex items-center justify-center text-ghost ${
              hasImage ? "animate-pulse" : ""
            }`}
          >
            <User size={28} />
          </div>
        )}
      </div>
      {/* Name + descriptor */}
      <div className="px-1.5 py-1 bg-surface">
        <p className="text-xs font-semibold text-ink truncate leading-tight">{name}</p>
        {descriptor && (
          <p className="text-xs text-muted truncate leading-tight">{descriptor}</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SummaryAltForms
// ─────────────────────────────────────────────────────────────────────────────

function SummaryAltForms() {
  const { chainId, charId } = Route.useParams();
  const charGid = createId<GID.Character>(+charId);
  const chain = useChain();

  const [selectedId, setSelectedId] = useState<Id<GID.AltForm> | null>(null);
  // Maps alt-form id → resolved aspect ratio (set once image loads).
  const [aspectRatios, setAspectRatios] = useState<Record<number, number>>({});
  const [containerWidth, setContainerWidth] = useState(600);
  const gridRef = useRef<HTMLDivElement>(null);

  // Keep container width in sync with layout changes.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setContainerWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  // Collect all alt-form entries in chronological order.
  const entries = useMemo((): AltFormEntry[] => {
    if (!chain) return [];
    const char = chain.characters.O[charGid];
    if (!char) return [];
    const result: AltFormEntry[] = [];
    if (char.originalForm != null) result.push({ id: char.originalForm });
    for (const jumpId of chain.jumpList) {
      const jump = chain.jumps.O[jumpId];
      if (!jump?.useAltForms) continue;
      for (const id of jump.altForms[charGid] ?? []) {
        result.push({ id, jumpId });
      }
    }
    return result;
  }, [chain, charGid]);

  // Determine columns from grid width: 3 cols above 450 px, else 2.
  const cols = containerWidth >= 450 ? 3 : 2;

  const rows = useMemo((): AltFormEntry[][] => {
    const result: AltFormEntry[][] = [];
    for (let i = 0; i < entries.length; i += cols) {
      result.push(entries.slice(i, i + cols));
    }
    return result;
  }, [entries, cols]);

  // Per-row layout: computed from resolved aspect ratios and container width.
  // For entries whose ratio isn't known yet, fall back to LOADING_ASPECT_RATIO
  // (images expected) or PLACEHOLDER_ASPECT_RATIO (no image).
  // Partial rows (fewer items than cols) use a proportionally reduced width so
  // items don't stretch beyond their natural share of the grid.
  const rowLayouts = useMemo(
    () =>
      rows.map((row) => {
        const effectiveWidth =
          row.length < cols ? (containerWidth * row.length) / cols : containerWidth;
        return calcRowLayout(
          row.map((e) => aspectRatios[e.id as number] ?? LOADING_ASPECT_RATIO),
          effectiveWidth,
        );
      }),
    [rows, aspectRatios, containerWidth, cols],
  );

  const handleAspectRatio = useCallback((id: Id<GID.AltForm>, ratio: number) => {
    setAspectRatios((prev) => {
      if (prev[id as number] === ratio) return prev;
      return { ...prev, [id as number]: ratio };
    });
  }, []);

  const selectedEntry = entries.find((e) => e.id === selectedId) ?? null;

  if (entries.length === 0) {
    return (
      <p className="text-sm text-ghost italic py-8 text-center">No alt-forms recorded.</p>
    );
  }

  const sideContent = selectedId != null && (
    <AltFormEditor
      key={selectedId as number}
      id={selectedId}
      headless
      jumpPill={
        selectedEntry?.jumpId != null ? (
          <JumpPill jumpId={selectedEntry.jumpId} chainId={chainId} charId={charId} />
        ) : null
      }
      onClose={() => setSelectedId(null)}
    />
  );

  return (
    <div className="flex min-h-full">
      {/* ── Justified grid ── */}
      <div className="flex-1 min-w-0 py-3" ref={gridRef}>
        <div className="flex flex-col" style={{ gap: ROW_GAP }}>
          {rows.map((row, rowIdx) => {
            const layout = rowLayouts[rowIdx];
            return (
              <div key={rowIdx} className="flex" style={{ gap: IMG_GAP }}>
                {row.map((entry, colIdx) => {
                  const altForm = chain?.altforms.O[entry.id];
                  const hasImg = altForm?.image != null;
                  return (
                    <AltFormThumbnail
                      key={entry.id as number}
                      entry={entry}
                      imgHeight={layout.height}
                      imgWidth={layout.widths[colIdx]}
                      cropped={layout.cropped}
                      hasImage={hasImg}
                      onAspectRatio={handleAspectRatio}
                      onSelect={() =>
                        setSelectedId((prev) => (prev === entry.id ? null : entry.id))
                      }
                      isSelected={entry.id === selectedId}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Sidebar — large screens (permanent) ── */}
      <div className="hidden lg:flex w-72 shrink-0 sticky top-0 self-start max-h-screen flex-col overflow-y-auto ml-4">
        {!selectedId ? (
          <div className="flex h-32 flex-col items-center justify-center p-4 text-center">
            <User size={20} className="text-edge mb-1" />
            <p className="text-xs text-ghost">
              Select an alt-form
              <br />
              to view details
            </p>
          </div>
        ) : (
          <div className="bg-tint">{sideContent}</div>
        )}
      </div>

      {/* ── Overlay drawer — small screens ── */}
      {selectedId != null && (
        <div
          className="fixed inset-0 z-40 backdrop-blur-sm lg:hidden"
          onMouseDown={() => setSelectedId(null)}
        >
          <div
            className="absolute right-0 top-0 flex h-full w-72 flex-col overflow-y-auto border-l border-edge bg-surface shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {sideContent}
          </div>
        </div>
      )}
    </div>
  );
}
