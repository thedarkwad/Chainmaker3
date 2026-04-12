import { FileText, Pencil, X, Download } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { type JumpDocSummary, getJumpDocPdfUrl, buildJumpDocZip } from "@/api/jumpdocs";

export const ATTR_FIELDS: {
  key: keyof JumpDocSummary["attributes"];
  label: string;
  field: string;
}[] = [
  { key: "genre", label: "Genre", field: "genre" },
  { key: "medium", label: "Medium", field: "medium" },
  { key: "franchise", label: "Franchise", field: "franchise" },
  // { key: "supernaturalElements", label: "Elements", field: "element" },
];

export function addToken(search: string, field: string, value: string): string {
  const token = `${field}:"${value}"`;
  if (search.includes(token)) return search;
  return search.trim() ? `${search.trim()} ${token}` : token;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function JumpDocSidebar({
  doc,
  isOwner,
  onClose,
  onSearchChange,
  onNewChain,
  onExistingChain,
}: {
  doc: JumpDocSummary;
  isOwner?: boolean;
  onClose: () => void;
  onSearchChange?: (s: string) => void;
  onNewChain?: () => void;
  onExistingChain?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "zip" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isElectron = import.meta.env.VITE_PLATFORM === "electron";

  async function handleDownloadPdf() {
    setMenuOpen(false);
    setDownloading("pdf");
    try {
      const { pdfUrl, name } = await getJumpDocPdfUrl({ data: { publicUid: doc.publicUid } });
      if (!pdfUrl) return;
      const res = await fetch(pdfUrl);
      const blob = await res.blob();
      triggerDownload(blob, `${name}.pdf`);
    } finally {
      setDownloading(null);
    }
  }

  async function handleDownloadZip() {
    setMenuOpen(false);
    setDownloading("zip");
    try {
      const { zipBase64, name } = await buildJumpDocZip({ data: { publicUid: doc.publicUid } });
      const bytes = Uint8Array.from(atob(zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      triggerDownload(blob, `${name}.jumpdoc`);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-sm font-semibold text-ink leading-snug">
            {doc.name}
            {doc.version && <span className="ml-1.5 text-xs font-normal text-ghost">v{doc.version}</span>}
          </h2>
          {doc.author.length > 0 && (
            <div className="flex flex-wrap gap-x-1 gap-y-0.5">
              {doc.author.map((a) =>
                onSearchChange ? (
                  <button
                    key={a}
                    type="button"
                    onClick={() => onSearchChange(addToken("", "author", a))}
                    className="text-xs text-muted transition-colors hover:text-accent"
                  >
                    {a}
                  </button>
                ) : (
                  <span key={a} className="text-xs text-muted">
                    {a}
                  </span>
                ),
              )}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded p-0.5 text-ghost transition-colors hover:bg-tint hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>

      {/* NSFW warning */}
      {doc.nsfw && (
        <div className="flex items-center gap-1.5 rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1.5">
          <span className="text-xs font-bold text-red-400 uppercase tracking-wide">NSFW</span>
          <span className="text-[10px] text-red-400/80">Adult content</span>
        </div>
      )}

      {/* Cover image */}
      <div className="w-full aspect-square overflow-hidden rounded bg-tint">
        {doc.imageUrl ? (
          <img src={doc.imageUrl} alt={doc.name} className="w-full h-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileText size={36} className="text-ghost" />
          </div>
        )}
      </div>

      {/* Attributes */}
      {ATTR_FIELDS.map(({ key, label, field }) => {
        const values = doc.attributes[key];
        if (!values?.length) return null;
        return (
          <div key={key} className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ghost">{label}</p>
            <div className="flex flex-wrap gap-1">
              {values.map((v) =>
                onSearchChange ? (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onSearchChange(addToken("", field, v))}
                    className="rounded border border-edge bg-canvas px-2 py-0.5 text-xs text-muted transition-colors hover:border-accent/50 hover:bg-accent-tint hover:text-accent"
                  >
                    {v}
                  </button>
                ) : (
                  <span
                    key={v}
                    className="rounded border border-edge bg-canvas px-2 py-0.5 text-xs text-muted"
                  >
                    {v}
                  </span>
                ),
              )}
            </div>
          </div>
        );
      })}

      {/* Actions */}
      {(onNewChain || onExistingChain || isOwner || !isElectron) && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          {onNewChain && (
            <button
              type="button"
              onClick={onNewChain}
              className="w-full rounded bg-accent2 px-3 py-2 text-xs font-medium text-surface shadow-sm transition-colors hover:bg-accent2/90"
            >
              Add to New Chain
            </button>
          )}
          {onExistingChain && (
            <button
              type="button"
              onClick={onExistingChain}
              className="w-full rounded border border-edge px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent/50 bg-surface hover:text-ink"
            >
              Add to Existing Chain
            </button>
          )}
          {!isElectron && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                disabled={downloading !== null}
                onClick={() => setMenuOpen((o) => !o)}
                className="flex w-full bg-surface items-center justify-center gap-1.5 rounded border border-edge px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent/50 bg-canvas hover:text-ink disabled:opacity-50"
              >
                <Download size={11} />
                {downloading !== null
                  ? downloading === "pdf"
                    ? "Downloading…"
                    : "Building…"
                  : "Download"}
              </button>
              {menuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded border border-edge bg-surface shadow-md">
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted transition-colors hover:bg-tint hover:text-ink"
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadZip}
                    className="flex flex-col w-full justify-center items-baseline gap-2 px-3 py-2 text-xs text-muted transition-colors hover:bg-tint hover:text-ink"
                  >
                    .jumpdoc
                    <div className="text-xs text-ghost">For use with desktop ChainMaker app.</div>
                  </button>
                </div>
              )}
            </div>
          )}
          {(isOwner || isElectron) && (
            <Link
              to="/jumpdoc/$docId"
              params={{ docId: doc.publicUid }}
              className="flex w-full bg-surface items-center justify-center gap-1.5 rounded border border-edge px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-ink"
            >
              <Pencil size={11} />
              Edit JumpDoc
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
