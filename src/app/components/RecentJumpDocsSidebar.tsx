/**
 * RecentJumpDocsSidebar — shows the 8 most recently published JumpDocs as
 * gallery-style cards (cover image above name). Clicking a card opens
 * JumpDocPickerModal. Includes a "Browse More" link.
 *
 * On md+ the card grid scrolls independently so the section never grows taller
 * than the rest of the portal layout. The header and "Browse More" button stay
 * pinned outside the scrollable area.
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Scrollbar } from "react-scrollbars-custom";
import { ArrowRight, FileText, Loader2 } from "lucide-react";
import { listPublishedJumpDocs, type JumpDocSummary } from "@/api/jumpdocs";
import { JumpDocPickerModal } from "@/app/components/JumpDocPickerModal";

function DocCard({ doc, onSelect }: { doc: JumpDocSummary; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex flex-col rounded border border-edge bg-surface shadow-sm hover:border-accent/50 hover:shadow-md transition-all text-left overflow-hidden"
    >
      <div className="relative w-full aspect-square overflow-hidden bg-tint">
        {doc.imageUrl ? (
          <img src={doc.imageUrl} alt="" className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-accent-tint">
            <FileText size={28} className="text-accent/40" />
          </div>
        )}
        {doc.author.length > 0 && (
          <span className="absolute top-0 right-0 max-w-[75%] truncate whitespace-nowrap bg-black/70 rounded-bl px-1 py-0.5 text-[10px] text-white">
            {doc.author.join(", ")}
          </span>
        )}
      </div>
      <div className="px-2 py-1.5">
        <p className="text-xs font-medium text-ink leading-snug line-clamp-2">{doc.name}</p>
      </div>
    </button>
  );
}

const grid = (
  docs: JumpDocSummary[],
  onSelect: (doc: JumpDocSummary) => void,
  extraCls = "",
) => (
  <div className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-2 gap-2 ${extraCls}`}>
    {docs.map((doc) => (
      <DocCard key={doc._id} doc={doc} onSelect={() => onSelect(doc)} />
    ))}
  </div>
);

export function RecentJumpDocsSidebar() {
  const [docs, setDocs] = useState<JumpDocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<JumpDocSummary | null>(null);

  useEffect(() => {
    listPublishedJumpDocs({
      data: { page: 1, pageSize: 12, sortKey: "createdAt", sortDir: "desc" },
    })
      .then((r) => setDocs(r.docs))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const body = loading ? (
    <div className="flex items-center gap-2 py-2 text-xs text-ghost">
      <Loader2 size={12} className="animate-spin" />
      Loading…
    </div>
  ) : docs.length === 0 ? (
    <p className="text-xs italic text-ghost">No JumpDocs yet.</p>
  ) : null;

  return (
    <>
      <section className="flex w-full shrink-0 flex-col gap-3 rounded-xl border border-accent/20 bg-linear-to-b from-tint to-accent-tint px-4 py-5 shadow-sm md:w-64 md:max-h-full md:min-h-0">
        <p className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted center-text">
          Recently Converted Jumpdocs
        </p>

        {body ?? (
          <>
            {/* Desktop: scrollable grid */}
            <div className="hidden md:flex md:flex-1 md:min-h-0">
              <Scrollbar
                style={{ height: "100%", width: "100%" }}
                noScrollX
                trackYProps={{ style: { width: "6px", background: "var(--color-edge)", borderRadius: "3px" } }}
                thumbYProps={{ style: { background: "var(--color-muted)", borderRadius: "3px" } }}
              >
                {grid(docs, setSelectedDoc, "pr-1")}
              </Scrollbar>
            </div>
            {/* Mobile: natural-height grid */}
            {grid(docs, setSelectedDoc, "md:hidden")}
          </>
        )}

        <Link
          to="/gallery"
          className="shrink-0 mt-auto flex items-center justify-center gap-1 rounded bg-accent px-3 py-1.5 text-xs font-medium text-surface transition-colors hover:bg-accent/90"
        >
          Browse More <ArrowRight size={11} />
        </Link>
      </section>

      {selectedDoc && (
        <JumpDocPickerModal doc={selectedDoc} onClose={() => setSelectedDoc(null)} />
      )}
    </>
  );
}
