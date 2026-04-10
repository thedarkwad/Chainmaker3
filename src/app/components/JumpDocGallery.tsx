/**
 * JumpDocGallery — a sortable, searchable, self-contained grid of JumpDoc cards.
 *
 * The component owns all state: search query, sort, pagination, and data fetching.
 * It calls `listPublishedJumpDocs` directly and debounces search input before
 * sending it to the server. Advanced search (genre/medium/element buttons) injects
 * field-specific tokens into the search bar, which the server interprets.
 *
 * Parents need only pass display/behavior props: linkPrefix, onSelect, columns, etc.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSnappedGridColumns } from "@/ui/useSnappedGridColumns";

import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, FileText, Loader2, SlidersHorizontal, X } from "lucide-react";
import { SearchBar } from "@/ui/SearchBar";
import { Pagination } from "@/ui/Pagination";
import { listPublishedJumpDocs, type JumpDocSummary } from "@/api/jumpdocs";
import { parseJumpDocQuery } from "@/utilities/SearchUtilities";
import {
  GENRE_OPTIONS,
  MEDIUM_OPTIONS,
  SUPERNATURAL_ELEMENTS_OPTIONS,
} from "@/jumpdoc/data/jumpDocAttributeOptions";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type SortKey = "name" | "updatedAt" | "createdAt";
export type SortDir = "asc" | "desc";

export type JumpDocGalleryProps = {
  /** Called when a card is clicked (picker mode). If omitted, cards are links. */
  onSelect?: (doc: JumpDocSummary) => void;
  /** If provided (and `onSelect` is not), cards render as router links. */
  linkPrefix?: string;
  /** Number of items per page. Defaults to 24. */
  pageSize?: number;
  /** Explicit number of grid columns. Omit to use responsive auto-fill. */
  columns?: number;
  /** Minimum card width in px for auto-fill columns (default 160). */
  minCardWidth?: number;
  /** Applied to the outermost wrapper div. */
  className?: string;
  /** Controlled search query. When provided, external changes sync into the gallery. */
  searchQuery?: string;
  /** Called whenever the search query changes (controlled or user-typed). */
  onSearchChange?: (s: string) => void;
  /** If provided, called before each fetch to get a Firebase ID token for ownership info. */
  getIdToken?: () => Promise<string | null>;
};

const DEFAULT_PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 350;
const NSFW_STORAGE_KEY = "cm:showNsfwGallery";

// ─────────────────────────────────────────────────────────────────────────────
// Search token helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeToken(field: string, value: string): string {
  return `${field}:"${value}"`;
}

function toggleToken(search: string, field: string, value: string): string {
  const token = makeToken(field, value);
  if (search.includes(token)) {
    return search
      .replace(token, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  return search.trim() ? `${search.trim()} ${token}` : token;
}

function isTokenActive(search: string, field: string, value: string): boolean {
  return search.includes(makeToken(field, value));
}

// ─────────────────────────────────────────────────────────────────────────────
// Search tip
// ─────────────────────────────────────────────────────────────────────────────

const SEARCH_TIP = (
  <>
    <p className="font-semibold text-ink mb-1.5">Search syntax</p>
    <div className="flex flex-col gap-1 leading-relaxed">
      <p>
        <code className="font-mono bg-tint px-1 rounded">word</code>
        {" — "}
        name or franchise (any word matches)
      </p>
      <p>
        <code className="font-mono bg-tint px-1 rounded">"exact phrase"</code>
        {" — "}
        name or franchise phrase
      </p>
      <p>
        <code className="font-mono bg-tint px-1 rounded">author:word</code>
        {" — "}
        author contains word
      </p>
      <p>
        <code className="font-mono bg-tint px-1 rounded">franchise:word</code>
        {" — "}
        franchise only
      </p>
      <p>
        <code className="font-mono bg-tint px-1 rounded">genre:"Fantasy"</code>
        {" — "}
        exact genre match
      </p>
      <p>
        <code className="font-mono bg-tint px-1 rounded">medium:word</code>
        {" — "}
        medium contains word
      </p>
      {/* <p>
        <code className="font-mono bg-tint px-1 rounded">element:word</code>
        {" — "}
        supernatural element contains word
      </p> */}
      <p className="mt-1 text-ghost">Bare words are ORed; field filters are ANDed.</p>
    </div>
  </>
);

// ─────────────────────────────────────────────────────────────────────────────
// Sort bar
// ─────────────────────────────────────────────────────────────────────────────

const SORT_KEYS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "updatedAt", label: "Updated" },
  { key: "createdAt", label: "Created" },
];

function GallerySortBar({
  sortKey,
  sortDir,
  onSort,
}: {
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      {SORT_KEYS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSort(key)}
          className={`flex items-center gap-0.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
            key === sortKey
              ? "bg-surface/20 text-surface border-surface/30"
              : "text-surface/60 border-transparent hover:bg-surface/10 hover:text-surface"
          }`}
        >
          {label}
          {key === sortKey &&
            (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Advanced search panel
// ─────────────────────────────────────────────────────────────────────────────

const FILTER_SECTIONS = [
  { label: "Genre", field: "genre", options: GENRE_OPTIONS },
  { label: "Medium", field: "medium", options: MEDIUM_OPTIONS },
  // { label: "Supernatural Elements", field: "element", options: SUPERNATURAL_ELEMENTS_OPTIONS },
];

function AdvancedSearch({
  search,
  onSearchChange,
  showNsfw,
  onToggleNsfw,
}: {
  search: string;
  onSearchChange: (s: string) => void;
  showNsfw: boolean;
  onToggleNsfw: () => void;
}) {
  const tokens = parseJumpDocQuery(search);
  const activeFieldTokens = tokens.filter((t) => t.field !== "any" && t.field !== "name");

  return (
    <div className="flex flex-col gap-3 pt-2">
      {FILTER_SECTIONS.map(({ label, field, options }) => (
        <div key={field} className="flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-surface/60">
            {label}
          </p>
          <div className="flex flex-wrap gap-1">
            {options.map((opt) => {
              const active = isTokenActive(search, field, opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onSearchChange(toggleToken(search, field, opt))}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-colors ${
                    active
                      ? "bg-surface/25 text-surface border-surface/50 font-medium"
                      : "text-surface/60 border-surface/20 hover:bg-surface/10 hover:text-surface hover:border-surface/30"
                  }`}
                >
                  {opt}
                  {active && <X size={9} strokeWidth={2.5} />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {activeFieldTokens.length > 0 && (
        <button
          type="button"
          onClick={() => {
            const anyTerms = tokens
              .filter((t) => t.field === "any")
              .map((t) => (t.exact ? `"${t.term}"` : t.term));
            onSearchChange(anyTerms.join(" "));
          }}
          className="self-start text-[10px] text-surface/50 hover:text-surface underline underline-offset-2 transition-colors"
        >
          Clear filters
        </button>
      )}

      {/* NSFW toggle */}
      <div className="border-t border-surface/20 pt-2">
        <button
          key={"lewd"}
          type="button"
          onClick={onToggleNsfw}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-colors ${
            showNsfw
              ? "bg-surface/25 text-surface border-surface/50 font-medium"
              : "text-surface/60 border-surface/20 hover:bg-surface/10 hover:text-surface hover:border-surface/30"
          }`}
        >
          Show NSFW content
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────────────────────────────────────

function DocCard({
  doc,
  linkPrefix,
  onSelect,
}: {
  doc: JumpDocSummary;
  linkPrefix?: string;
  onSelect?: (doc: JumpDocSummary) => void;
}) {
  const cover = doc.imageUrl ? (
    <img src={doc.imageUrl} alt="" className="w-full h-full object-cover" draggable={false} />
  ) : (
    <div className="w-full h-full flex items-center justify-center bg-accent2-tint">
      <FileText size={28} className="text-accent2/50" />
    </div>
  );

  const inner = (
    <>
      <div className="w-full relative aspect-square rounded-t overflow-hidden bg-tint">
        {cover}
        {doc.author.length > 0 && (
          <span className="whitespace-nowrap absolute top-0 right-0 truncate max-w-7/12 bg-black rounded-bl text-white opacity-70 p-0.5 text-xs">
            By {doc.author.join(", ")}
          </span>
        )}
      </div>
      <div className="px-2 py-1.5 flex flex-col gap-0.5">
        <p className="text-xs font-medium text-ink leading-snug" title={doc.name}>
          {doc.name}
        </p>
        <p className="text-[10px] text-ghost flex flex-wrap">Updated {timeAgo(doc.updatedAt)}</p>
      </div>
    </>
  );

  const cardCls =
    "flex flex-col rounded border border-edge bg-surface shadow-sm hover:border-accent2/50 hover:shadow-md transition-all cursor-pointer overflow-hidden";

  if (onSelect) {
    return (
      <button type="button" onClick={() => onSelect(doc)} className={`${cardCls} text-left`}>
        {inner}
      </button>
    );
  }
  if (linkPrefix) {
    return (
      <Link to={`${linkPrefix}${doc.publicUid}` as never} className={cardCls}>
        {inner}
      </Link>
    );
  }
  return <div className={cardCls}>{inner}</div>;
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gallery
// ─────────────────────────────────────────────────────────────────────────────

export function JumpDocGallery({
  onSelect,
  linkPrefix,
  pageSize = DEFAULT_PAGE_SIZE,
  columns,
  minCardWidth = 160,
  className,
  searchQuery,
  onSearchChange,
  getIdToken,
}: JumpDocGalleryProps) {
  const [docs, setDocs] = useState<JumpDocSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState(searchQuery ?? "");
  const [committedSearch, setCommittedSearch] = useState(searchQuery ?? "");
  const [showNsfw, setShowNsfw] = useState<boolean>(() => {
    try {
      return localStorage.getItem(NSFW_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [pendingNsfwConfirm, setPendingNsfwConfirm] = useState(false);

  // Sync when searchQuery prop changes externally (e.g. sidebar attribute tag click).
  const lastExternalSearch = useRef(searchQuery ?? "");
  useEffect(() => {
    if (searchQuery !== undefined && searchQuery !== lastExternalSearch.current) {
      lastExternalSearch.current = searchQuery;
      setSearch(searchQuery);
      setCommittedSearch(searchQuery);
      setPage(1);
    }
  }, [searchQuery]);
  const [loading, setLoading] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const tokens = useMemo(() => parseJumpDocQuery(search), [search]);
  const activeFilterCount = tokens.filter((t) => t.field !== "any" && t.field !== "name").length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(
    (p: number, sk: SortKey, sd: SortDir, s: string, nsfw: boolean) => {
      setLoading(true);
      (getIdToken ? getIdToken() : Promise.resolve(null))
        .then((idToken) =>
          listPublishedJumpDocs({
            data: {
              page: p,
              pageSize,
              sortKey: sk,
              sortDir: sd,
              search: s,
              idToken: idToken ?? undefined,
              showNsfw: nsfw,
            },
          }),
        )
        .then((result) => {
          setDocs(result.docs);
          setTotal(result.total);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    },
    [pageSize, getIdToken],
  );

  // Fetch on sort/page change (immediately) or search change (debounced).
  useEffect(() => {
    load(page, sortKey, sortDir, committedSearch, showNsfw);
  }, [load, page, sortKey, sortDir, committedSearch, showNsfw]);

  // Debounce search → committedSearch (resets page to 1).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(s: string) {
    setSearch(s);
    lastExternalSearch.current = s;
    onSearchChange?.(s);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setCommittedSearch(s);
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleSort(k: SortKey) {
    const newDir =
      k === sortKey ? (sortDir === "asc" ? "desc" : "asc") : k === "name" ? "asc" : "desc";
    setSortKey(k);
    setSortDir(newDir);
    setPage(1);
  }

  function handleToggleNsfw() {
    if (showNsfw) {
      setShowNsfw(false);
      setPendingNsfwConfirm(false);
      try {
        localStorage.setItem(NSFW_STORAGE_KEY, "false");
      } catch {}
      setPage(1);
    } else {
      setPendingNsfwConfirm(true);
    }
  }

  function handleConfirmNsfw() {
    setShowNsfw(true);
    setPendingNsfwConfirm(false);
    try {
      localStorage.setItem(NSFW_STORAGE_KEY, "true");
    } catch {}
    setPage(1);
  }

  function handleCancelNsfw() {
    setPendingNsfwConfirm(false);
  }

  const { gridRef, gridStyle } = useSnappedGridColumns({ pageSize, minCardWidth, columns });

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      {/* Header bar */}
      <div className="bg-accent-ring rounded-md px-4 py-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBar
            className="flex-1 min-w-40"
            inverted
            value={search}
            onChange={handleSearchChange}
            placeholder="Search jumpdocs…"
            tip={SEARCH_TIP}
          />
          <GallerySortBar sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              advancedOpen || activeFilterCount > 0
                ? "bg-surface/20 text-surface border-surface/30"
                : "text-surface/60 border-surface/20 hover:bg-surface/10 hover:text-surface hover:border-surface/30"
            }`}
            title="Advanced search"
          >
            <SlidersHorizontal size={12} />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-surface/30 text-surface text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
            {advancedOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        </div>

        {advancedOpen && (
          <AdvancedSearch
            search={search}
            onSearchChange={handleSearchChange}
            showNsfw={showNsfw}
            onToggleNsfw={handleToggleNsfw}
          />
        )}
      </div>

      {/* Result count */}
      {total > 0 && !loading && (
        <p className="text-xs text-ghost text-right">
          {total} {total === 1 ? "jumpdoc" : "jumpdocs"}
        </p>
      )}

      {/* Grid / searching / empty */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">{committedSearch ? "Searching…" : "Loading…"}</span>
        </div>
      ) : docs.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-ghost italic">
          {committedSearch ? (
            <>
              <span className="text-sm">No results for</span>
              <code className="text-xs bg-tint px-1.5 py-0.5 rounded">{committedSearch}</code>
            </>
          ) : (
            <span className="text-sm">No jumpdocs found.</span>
          )}
        </div>
      ) : (
        <div ref={gridRef} className="grid gap-3" style={gridStyle}>
          {docs.map((doc) => (
            <DocCard key={doc._id} doc={doc} linkPrefix={linkPrefix} onSelect={onSelect} />
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {/* Age confirmation modal */}
      {pendingNsfwConfirm &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/60 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) handleCancelNsfw();
            }}
          >
            <div className="flex flex-col gap-4 bg-canvas border border-red-500/40 rounded-lg shadow-xl w-80 p-5">
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-semibold text-ink">Age confirmation required</p>
                <p className="text-xs text-muted leading-relaxed">
                  This will show jumpdocs marked as adult content. Please confirm you are 18 or
                  older.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCancelNsfw}
                  className="px-3 py-1.5 text-sm text-muted hover:text-ink border border-edge rounded hover:border-trim transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmNsfw}
                  className="px-4 py-1.5 text-sm rounded bg-red-500/15 text-red-400 border border-red-500/40 hover:bg-red-500/25 transition-colors font-medium"
                >
                  I am 18+
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
