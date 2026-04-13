import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  LinkIcon,
  Plus,
  ScrollText,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Scrollbar } from "react-scrollbars-custom";
import { useCurrentUser } from "@/app/state/auth";
import { useTheme } from "@/providers/ThemeProvider";
import { AppHeader } from "@/app/components/AppHeader";
import { UserDropdown } from "@/app/components/UserDropdown";
import { PortalNav } from "@/app/components/PortalNav";
import {
  listChains,
  createChain,
  deleteChain,
  duplicateChain,
  type ChainSummary,
} from "@/api/chains";
import {
  listJumpDocs,
  createJumpDoc,
  importJumpDoc,
  deleteJumpDoc,
  JumpDocSummary,
} from "@/api/jumpdocs";
import { uploadImage } from "@/api/images";
import { convertChain } from "@/chain/conversion";
import { unzipSync } from "fflate";
import { NewChainForm } from "@/app/components/NewChainForm";
import { RecentJumpDocsSidebar } from "@/app/components/RecentJumpDocsSidebar";
import { getRecentChains, type RecentChain } from "@/app/state/recentChains";

export const Route = createFileRoute("/portal")({
  component: PortalPage,
});

// ── Types & helpers ────────────────────────────────────────────────────────────

type Entry = { id: string; name: string; created: string; updated: string; published?: boolean };

type SortKey = "name" | "created" | "updated";
type SortDir = "asc" | "desc";
type AccentColor = "accent" | "accent2";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

function summaryToEntry(s: ChainSummary | JumpDocSummary): Entry {
  return {
    id: s.publicUid,
    name: s.name,
    created: s.createdAt,
    updated: s.updatedAt,
    ...("published" in s ? { published: s.published } : {}),
  };
}

// ── WelcomeBanner ──────────────────────────────────────────────────────────────

function readAccentHueRotation(): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--theme-accent-ring")
    .trim();
  const match = raw.match(/oklch\(\s*[\d.%]+\s+[\d.]+\s+([\d.]+)/);
  const hue = match ? parseFloat(match[1]) : 278;
  return hue - 58;
}

function WelcomeBanner({
  name,
  chainCount,
  docCount,
}: {
  name: string;
  chainCount: number;
  docCount: number;
}) {
  // Read the accent-ring hue directly from the computed CSS so there are no
  // hardcoded values. We use a MutationObserver rather than useMemo because
  // ThemeProvider sets data-theme in a useEffect (after render), so reading
  // getComputedStyle during render would always see the previous theme.
  const [hueRotate, setHueRotate] = useState(() => {
    if (typeof document === "undefined") return 0;
    return readAccentHueRotation();
  });
  useEffect(() => {
    setHueRotate(readAccentHueRotation());
    const observer = new MutationObserver(() => setHueRotate(readAccentHueRotation()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-dark"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl bg-accent-ring px-6 py-5 text-surface shadow-sm">
      <div className="pointer-events-none absolute inset-0 h-full w-full bg-linear-to-r to-black/80 from-black/0">
        {/* <filter id="banner-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#banner-noise)" /> */}
      </div>

      <div className="relative">
        <div className="text-ink/70">
          <p className="text-sm">Welcome Back</p>
          <h1
            className="mt-0.5 text-2xl font-bold text-ink/90"
            style={{ fontFamily: "Roboto Slab, Sans Serif" }}
          >
            {name}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-black/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">
              <LinkIcon size={11} className="opacity-70" />
              <span className="font-semibold">{chainCount}</span>
              <span className="">{chainCount === 1 ? "chain" : "chains"}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-black/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">
              <ScrollText size={11} className="opacity-70" />
              <span className="font-semibold">{docCount}</span>
              <span className="">{docCount === 1 ? "jumpdoc" : "jumpdocs"}</span>
            </div>
          </div>
        </div>

        <img
          src="/GalaxyIcon6.jpg"
          alt=""
          aria-hidden
          className="absolute right-0 top-1/2 w-300 -translate-y-5/12 translate-x-1/4 select-none mix-blend-lighten"
          style={{
            filter: `hue-rotate(${hueRotate}deg)`,
          }}
        />
      </div>
    </div>
  );
}

// ── SortBar ────────────────────────────────────────────────────────────────────

function SortBar({
  sortKey,
  sortDir,
  onSort,
  color,
}: {
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  color: AccentColor;
}) {
  const keys: SortKey[] = ["name", "updated", "created"];
  const activeClass =
    color === "accent"
      ? "bg-accent-tint text-accent font-medium border border-accent/50"
      : "bg-accent2-tint text-accent2 font-medium border border-accent2/50";

  return (
    <div className="flex items-center justify-center gap-1">
      <span className="mr-1 text-xs text-ghost">Sort:</span>
      {keys.map((k) => (
        <button
          key={k}
          onClick={() => onSort(k)}
          className={`flex items-center gap-0.5 rounded-sm px-2 py-0.5 text-xs capitalize transition-colors ${
            k === sortKey ? activeClass : "text-muted hover:text-ink"
          }`}
        >
          {k}
          {k === sortKey &&
            (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
        </button>
      ))}
    </div>
  );
}

// ── DocCard ────────────────────────────────────────────────────────────────────

function DocRow({
  entry,
  type,
  color,
  sort,
  linkPrefix,
  onDelete,
  onDuplicate,
}: {
  entry: Entry;
  color: AccentColor;
  type: "chain" | "jumpdoc";
  sort: SortKey;
  linkPrefix?: string;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  let colorClasses =
    color == "accent"
      ? "border-accent/20 hover:bg-accent-tint"
      : "border-accent2/20 hover:bg-accent2-tint";
  let textColorClass = color == "accent" ? "group-hover:text-accent" : "group-hover:text-accent2";

  return (
    <Link
      to={`${linkPrefix}${entry.id}`}
      className={`group flex flex-row items-center gap-3 border-b ${colorClasses} px-1 py-1 last:border-0 transition-colors`}
    >
      <div className={`relative p-1 shrink-0 text-muted ${textColorClass}`}>
        {type === "chain" ? <LinkIcon size={16} /> : <FileText size={16} />}
        {type === "jumpdoc" && entry.published && (
          <CheckCircle
            size={12}
            className={`absolute -bottom-0.5 -right-0.5 text-green-500 ${textColorClass}`}
            strokeWidth={2.5}
          />
        )}
      </div>

      <div className="min-w-0 flex-1 truncate">
        <Link
          to={`${linkPrefix}${entry.id}`}
          className={`truncate text-ink text-sm ${textColorClass} transition-colors`}
        >
          {entry.name}
        </Link>
      </div>
      <span
        className={`shrink-0 text-xs text-ghost ${sort == "created" && "hidden sm:inline md:hidden lg:inline"}`}
      >
        <span className="text-ghost/60">updated </span>
        {timeAgo(entry.updated)}
      </span>
      <span
        className={`shrink-0 tabular-nums text-xs text-ghost ${sort != "created" && "hidden sm:inline md:hidden lg:inline"}`}
      >
        <span className="text-ghost/60">created </span>
        {fmtDate(entry.created)}
      </span>
      {confirming ? (
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-xs text-muted">Delete?</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setConfirming(false);
              onDelete(entry.id);
            }}
            className="rounded-sm px-1.5 py-0.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
          >
            Yes
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setConfirming(false);
            }}
            className="rounded-sm px-1.5 py-0.5 text-xs text-muted transition-colors hover:text-ink"
          >
            No
          </button>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-0.5 md:opacity-0 transition-opacity md:group-hover:opacity-100">
            {onDuplicate && (
              <button
                title="Duplicate"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onDuplicate(entry.id);
                }}
                className="rounded-sm p-1 text-ghost transition-colors hover:bg-edge hover:text-ink"
              >
                <Copy size={12} />
              </button>
            )}
            <button
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setConfirming(true);
              }}
              className="rounded-sm p-1 text-ghost transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </>
      )}
    </Link>
  );
}

// ── DocList ────────────────────────────────────────────────────────────────────

function DocList({
  entries,
  color,
  type,
  linkPrefix,
  onDelete,
  onDuplicate,
}: {
  entries: Entry[];
  color: AccentColor;
  type: "chain" | "jumpdoc";
  linkPrefix?: string;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(col: SortKey) {
    if (col === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(col);
      setSortDir("asc");
    }
  }

  const sorted = [...entries].sort((a, b) => {
    const cmp =
      sortKey === "name"
        ? a.name.localeCompare(b.name)
        : a[sortKey] < b[sortKey]
          ? -1
          : a[sortKey] > b[sortKey]
            ? 1
            : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (entries.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 py-10 text-center">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-full ${
            color === "accent" ? "bg-accent-tint" : "bg-accent2-tint"
          }`}
        >
          <FileText size={18} className={color === "accent" ? "text-accent" : "text-accent2"} />
        </div>
        <p className="text-sm text-muted">Nothing here yet.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <SortBar sortKey={sortKey} sortDir={sortDir} onSort={handleSort} color={color} />
      <Scrollbar
        noScrollX
        className="flex-1 max-h-fit md:max-h-full min-h-60"
        trackYProps={{
          style: {
            width: "6px",
            marginRight: "-3px",
            background: "var(--color-edge)",
            borderRadius: "3px",
          },
        }}
        thumbYProps={{ style: { background: "var(--color-muted)", borderRadius: "3px" } }}
      >
        {sorted.map((entry) => (
          <DocRow
            type={type}
            key={entry.id}
            entry={entry}
            color={color}
            linkPrefix={linkPrefix}
            sort={sortKey}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
          />
        ))}
      </Scrollbar>
    </div>
  );
}

// ── StorageBar ─────────────────────────────────────────────────────────────────

function StorageBar({ currentBytes, maxBytes }: { currentBytes: number; maxBytes: number }) {
  const usedMb = currentBytes / 1024 / 1024;
  const maxMb = maxBytes / 1024 / 1024;
  const pct = Math.min(100, maxBytes > 0 ? (currentBytes / maxBytes) * 100 : 0);

  const barColor = pct >= 90 ? "bg-danger" : "bg-accent2";

  return (
    <div className="pt-2 border-t border-line flex flex-col gap-1.5 shrink-0">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-ghost uppercase tracking-wider">
          PDF Storage
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

// ── ActionsCard ───────────────────────────────────────────────────────────────

function ActionsCard({
  jsonInputRef,
  pdfInputRef,
  importing,
  converting,
  importError,
  importResult,
  convertError,
  onNewChain,
  onImport,
  onConvert,
  onNavigateToChain,
}: {
  jsonInputRef: React.RefObject<HTMLInputElement | null>;
  pdfInputRef: React.RefObject<HTMLInputElement | null>;
  importing: boolean;
  converting: boolean;
  importError: string | null;
  importResult: { publicUid: string; skippedImages: string[] } | null;
  convertError: string | null;
  onNewChain: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onConvert: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNavigateToChain: (id: string) => void;
}) {
  return (
    <section className="flex w-full md:w-40 lg:w-52 shrink-0 flex-row md:flex-col items-center justify-evenly gap-5 rounded-xl border border-accent2/30 bg-linear-to-b from-tint to-accent2-tint px-5 py-8 shadow-sm md:justify-stretch">
      <input
        ref={jsonInputRef}
        type="file"
        accept=".json,.chain"
        className="hidden"
        onChange={onImport}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf,.jumpdoc"
        className="hidden"
        onChange={onConvert}
      />

      {/* New Chain */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/10">
          <Plus size={18} className="text-muted" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-ink">New Chain</p>
          <p className="mt-0.5 text-xs text-muted">from your first jump</p>
        </div>
        <button
          onClick={onNewChain}
          className="rounded bg-accent2 px-4 py-1.5 text-xs font-medium text-surface shadow-sm transition-colors hover:bg-accent"
        >
          Create
        </button>
      </div>

      {/* Import Chain */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/10">
          <Upload size={18} className="text-muted" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-ink">Import Chain</p>
          <p className="mt-0.5 text-xs text-muted">from a .json or .chain file</p>
        </div>
        <button
          onClick={() => jsonInputRef.current?.click()}
          disabled={importing}
          className="rounded bg-accent2 px-4 py-1.5 text-xs font-medium text-surface shadow-sm transition-colors hover:bg-accent disabled:opacity-50"
        >
          {importing ? "Importing…" : "Choose File"}
        </button>
        {importError && <p className="text-center text-xs text-danger">{importError}</p>}
        {importResult && (
          <div className="rounded border border-edge bg-surface p-2 text-xs text-muted">
            <p className="mb-1 font-medium text-ink">
              {importResult.skippedImages.length} image
              {importResult.skippedImages.length !== 1 ? "s" : ""} skipped (storage full):
            </p>
            <ul className="mb-2 list-inside list-disc text-ghost">
              {importResult.skippedImages.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <button
              onClick={() => onNavigateToChain(importResult.publicUid)}
              className="rounded bg-accent2 px-3 py-1 text-xs font-medium text-surface hover:bg-accent"
            >
              Open Chain
            </button>
          </div>
        )}
      </div>

      {/* Convert JumpDoc */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/10">
          <Upload size={18} className="text-muted" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-ink">Convert Jumpdoc</p>
          <p className="mt-0.5 text-xs text-muted">from a .pdf or .jumpdoc file</p>
        </div>
        <button
          onClick={() => pdfInputRef.current?.click()}
          disabled={converting}
          className="rounded bg-accent2 px-4 py-1.5 text-xs font-medium text-surface shadow-sm transition-colors hover:bg-accent disabled:opacity-50"
        >
          {converting ? "Uploading..." : "Choose File"}
        </button>
        {convertError && <p className="text-center text-xs text-danger">{convertError}</p>}
      </div>
    </section>
  );
}

// ── PortalPage ─────────────────────────────────────────────────────────────────

function PortalPage() {
  // Auth redirects are system-initiated, not user navigation, so bare
  // useNavigate is used here intentionally (no undo stack entry needed).
  const navigate = useNavigate();
  const { firebaseUser, dbUser, loading } = useCurrentUser();
  const { settings, updateSettings } = useTheme();

  const [chains, setChains] = useState<Entry[]>([]);
  const [jumpDocs, setJumpDocs] = useState<Entry[]>([]);
  const [docsNeedingImage, setDocsNeedingImage] = useState<{ publicUid: string; name: string }[]>(
    [],
  );
  const [showNewChainModal, setShowNewChainModal] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    publicUid: string;
    skippedImages: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  let [browseMode, setBrowseMode] = useState<"chain" | "jumpdoc">("chain");

  const [anonChains] = useState<RecentChain[]>(() =>
    getRecentChains().filter((c) => c.ownerUid === ""),
  );

  useEffect(() => {
    if (!loading && !firebaseUser) {
      navigate({ to: "/" });
    }
  }, [loading, firebaseUser, navigate]);

  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    firebaseUser.getIdToken().then(async (token) => {
      try {
        const [chainList, docList] = await Promise.all([
          listChains({ data: token }),
          listJumpDocs({ data: token }),
        ]);
        if (cancelled) return;
        setChains(chainList.map(summaryToEntry));
        setJumpDocs(docList.map(summaryToEntry));
        setDocsNeedingImage(
          docList
            .filter((d) => d.published && !d.imageUrl)
            .map((d) => ({ publicUid: d.publicUid, name: d.name })),
        );
        // Record whether this user has any jumpdocs, so the jumpdoc editor can
        // show a first-time guide banner when they create their very first one.
        localStorage.setItem("chainmaker_has_jumpdocs", docList.length > 0 ? "true" : "false");
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load portal data:", err);
        setListError("Failed to load your data. Please refresh.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  async function handleImportChain(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !firebaseUser) return;
    e.target.value = "";
    setImportError(null);
    setImportResult(null);
    setImporting(true);
    try {
      const isChainFile = file.name.toLowerCase().endsWith(".chain");

      if (isChainFile) {
        const uint8 = new Uint8Array(await file.arrayBuffer());
        const unzipped = unzipSync(uint8);

        const dataBytes = unzipped["data.json"];
        if (!dataBytes) throw new Error("Invalid .chain file: missing data.json");

        const raw = JSON.parse(new TextDecoder().decode(dataBytes)) as Record<string, unknown>;
        const isLegacy = raw.versionNumber !== "3.0";
        const chain = isLegacy ? convertChain(raw as object) : raw;
        const chainCopy = JSON.parse(JSON.stringify(chain)) as Record<string, unknown>;
        const altforms =
          (chainCopy.altforms as { O?: Record<string, Record<string, unknown>> } | undefined)?.O ??
          {};

        const imageFolder = isLegacy ? "user_images/" : "images/";
        const imageEntries = Object.entries(unzipped).filter(
          ([name]) => name.startsWith(imageFolder) && name.length > imageFolder.length,
        );

        const idToken = await firebaseUser.getIdToken();
        const skippedImages: string[] = [];
        const uploadedImageIds: string[] = [];

        for (const [entryName, imageData] of imageEntries) {
          const filename = entryName.slice(imageFolder.length);
          const altFormKey = filename.replace(/\.[^.]+$/, "");

          let binary = "";
          for (let i = 0; i < imageData.length; i++) binary += String.fromCharCode(imageData[i]);
          const fileData = btoa(binary);

          let newImgId: string;
          try {
            const result = await uploadImage({
              data: { idToken, fileName: filename, fileData, bytes: imageData.length },
            });
            newImgId = result._id;
          } catch {
            const afName =
              (altforms[altFormKey] as { name?: string } | undefined)?.name ?? filename;
            skippedImages.push(afName);
            continue;
          }

          uploadedImageIds.push(newImgId);

          if (isLegacy) {
            if (altforms[altFormKey]) {
              (altforms[altFormKey] as Record<string, unknown>).image = {
                type: "internal",
                imgId: newImgId,
              };
            }
          } else {
            for (const af of Object.values(altforms)) {
              const img = (af as { image?: { type?: string; imgId?: string } }).image;
              if (img?.type === "internal" && img.imgId === altFormKey) img.imgId = newImgId;
            }
          }
        }

        const { publicUid } = await createChain({
          data: { idToken, contents: chainCopy, imageIds: uploadedImageIds },
        });

        if (skippedImages.length > 0) {
          setImportResult({ publicUid, skippedImages });
        } else {
          // Navigation out of the portal into a new chain editor. The chain's
          // UpdateStack doesn't exist yet so bare useNavigate is used intentionally.
          navigate({ to: "/chain/$chainId", params: { chainId: publicUid } });
        }
      } else {
        const raw = JSON.parse(await file.text()) as Record<string, unknown>;
        const contents = raw.versionNumber === "3.0" ? raw : convertChain(raw as object);
        const idToken = await firebaseUser.getIdToken();
        const { publicUid } = await createChain({ data: { idToken, contents } });
        // Navigation out of the portal into a new chain editor. The chain's
        // UpdateStack doesn't exist yet so bare useNavigate is used intentionally.
        navigate({ to: "/chain/$chainId", params: { chainId: publicUid } });
      }
    } catch (err) {
      console.error("Chain import failed:", err);
      setImportError(
        err instanceof SyntaxError
          ? "That file doesn't look like valid JSON."
          : err instanceof Error
            ? err.message
            : "Import failed — check the console for details.",
      );
    } finally {
      setImporting(false);
    }
  }

  async function handleConvertJumpDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !firebaseUser) return;
    e.target.value = "";
    setConvertError(null);
    setConverting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = arrayBuffer.byteLength;
      // Encode as base64 for transport through the server function.
      // Use a loop instead of spread to avoid stack overflow on large files.
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < uint8.byteLength; i++) binary += String.fromCharCode(uint8[i]);
      const fileData = btoa(binary);
      const idToken = await firebaseUser.getIdToken();
      let publicUid: string;
      if (file.name.endsWith(".jumpdoc")) {
        ({ publicUid } = await importJumpDoc({ data: { idToken, zipBase64: fileData } }));
      } else {
        ({ publicUid } = await createJumpDoc({
          data: { idToken, fileName: file.name, fileData, bytes },
        }));
      }
      // Navigation out of the portal into a new jumpdoc editor.
      // No UpdateStack exists yet so bare useNavigate is used intentionally.
      navigate({ to: "/jumpdoc/$docId", params: { docId: publicUid } });
    } catch (err) {
      console.error("JumpDoc creation failed:", err);
      setConvertError(
        err instanceof Error ? err.message : "Upload failed — check the console for details.",
      );
    } finally {
      setConverting(false);
    }
  }

  async function handleDeleteChain(publicUid: string) {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    await deleteChain({ data: { publicUid, idToken } });
    setChains((prev) => prev.filter((c) => c.id !== publicUid));
  }

  async function handleDuplicateChain(publicUid: string) {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    const { publicUid: newId } = await duplicateChain({ data: { publicUid, idToken } });
    const now = new Date().toISOString();
    const src = chains.find((c) => c.id === publicUid);
    setChains((prev) => [
      ...prev,
      { id: newId, name: `${src?.name ?? "Untitled"} (copy)`, created: now, updated: now },
    ]);
  }

  function handleNewChainCreated(publicUid: string) {
    setShowNewChainModal(false);
    // Navigation into new chain editor; no UpdateStack exists yet, bare navigate is intentional.
    navigate({ to: "/chain/$chainId", params: { chainId: publicUid } });
  }

  async function handleDeleteJumpDoc(publicUid: string) {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    await deleteJumpDoc({ data: { publicUid, idToken } });
    setJumpDocs((prev) => prev.filter((d) => d.id !== publicUid));
  }

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas">
        <span className="text-sm text-muted">Loading…</span>
      </div>
    );
  }

  if (!firebaseUser) return null;

  let sharedClass = "py-1 px-3 rounded uppercase text-xs tracking-widest font-semibold";

  return (
    <div className="flex h-dvh flex-col bg-radial to-canvas from-accent2">
      <AppHeader
        nav={<PortalNav />}
        actions={<UserDropdown />}
        settings={settings}
        onUpdateSettings={updateSettings}
        transparent
      />
      <main className="flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col justify-center">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-3">
            {listError && (
              <p className="rounded border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
                {listError}
              </p>
            )}

            {docsNeedingImage.length > 0 &&
              (() => {
                const deadline = new Date("2026-04-17T00:00:00Z");
                const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
                return (
                  <div className="rounded border border-accent bg-accent-tint px-4 py-2.5 text-sm text-accent">
                    Consider adding a thumbnail image for your{" "}
                    {docsNeedingImage.map((doc, i) => (
                      <span key={doc.publicUid} className="text-muted">
                        {i > 0 && (i === docsNeedingImage.length - 1 ? " and " : ", ")}"
                        <Link
                          to="/jumpdoc/$docId"
                          params={{ docId: doc.publicUid }}
                          className="font-semibold underline hover:opacity-80"
                        >
                          {doc.name}
                        </Link>
                        "
                      </span>
                    ))}{" "}
                    {docsNeedingImage.length === 1 ? "jumpdoc" : "jumpdocs"}. If{" "}
                    {docsNeedingImage.length === 1 ? "it goes" : "they go"} too long without one,
                    one may be added for you by the site administrator.
                  </div>
                );
              })()}

            <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
              {/* Left: welcome banner + panel rows */}
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <WelcomeBanner
                  name={dbUser?.displayName || "User"}
                  chainCount={chains.length}
                  docCount={jumpDocs.length}
                />

                <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
                  {/* Section panels */}
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <section
                      className={`flex flex-col gap-1 rounded-xl border border-edge bg-surface p-3 shadow-sm h-full min-h-0`}
                    >
                      <div className="flex gap-3 justify-center pb-1">
                        <button
                          onClick={() => setBrowseMode("chain")}
                          className={`${sharedClass} ${browseMode == "chain" ? "bg-accent-tint border border-accent text-accent" : "text-ghost hover:text-muted"}`}
                        >
                          Your Chains ({chains.length})
                        </button>
                        <button
                          onClick={() => setBrowseMode("jumpdoc")}
                          className={`${sharedClass} ${browseMode == "jumpdoc" ? "bg-accent2-tint border border-accent2 text-accent2" : "text-ghost hover:text-muted"}`}
                        >
                          Your Jumpdocs ({jumpDocs.length})
                        </button>
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col">
                        <DocList
                          entries={browseMode == "chain" ? chains : jumpDocs}
                          color={browseMode == "chain" ? "accent" : "accent2"}
                          linkPrefix={browseMode == "chain" ? "/chain/" : "/jumpdoc/"}
                          type={browseMode}
                          onDelete={browseMode == "chain" ? handleDeleteChain : handleDeleteJumpDoc}
                          onDuplicate={browseMode == "chain" ? handleDuplicateChain : undefined}
                        />
                        {dbUser && browseMode == "jumpdoc" && (
                          <StorageBar
                            currentBytes={dbUser.pdfUsage.currentBytes}
                            maxBytes={dbUser.pdfUsage.maxBytes}
                          />
                        )}
                      </div>
                    </section>
                    {/* <SectionPanel
                      title="Your Jumpdocs"
                      count={jumpDocs.length}
                      color="accent2"
                      scrollable
                    >
                      <DocList
                        entries={jumpDocs}
                        color="accent2"
                        linkPrefix="/jumpdoc/"
                        type="jump"
                        onDelete={handleDeleteJumpDoc}
                      />
                      {dbUser && (
                        <StorageBar
                          currentBytes={dbUser.pdfUsage.currentBytes}
                          maxBytes={dbUser.pdfUsage.maxBytes}
                        />
                      )}
                    </SectionPanel> */}
                    {/* Anonymous recent chains */}
                    {browseMode === "chain" && anonChains.length > 0 && (
                      <section className="flex flex-col gap-1 rounded-xl border border-edge bg-surface p-3 shadow-sm shrink-0">
                        <p className="text-xs font-semibold text-muted uppercase tracking-widest pb-1">
                          Unclaimed Chains
                        </p>
                        <div className="flex flex-col gap-0.5">
                          {anonChains.map((c) => (
                            <Link
                              key={c.publicUid}
                              to="/chain/$chainId"
                              params={{ chainId: c.publicUid }}
                              className="truncate rounded px-2 py-1 text-sm text-ink hover:bg-tint transition-colors"
                            >
                              {c.name}
                            </Link>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>

                  {/* Actions card */}
                  <ActionsCard
                    jsonInputRef={fileInputRef}
                    pdfInputRef={pdfInputRef}
                    importing={importing}
                    converting={converting}
                    importError={importError}
                    importResult={importResult}
                    convertError={convertError}
                    onNewChain={() => setShowNewChainModal(true)}
                    onImport={handleImportChain}
                    onConvert={handleConvertJumpDoc}
                    onNavigateToChain={(id) =>
                      navigate({ to: "/chain/$chainId", params: { chainId: id } })
                    }
                  />
                </div>
              </div>

              <RecentJumpDocsSidebar />
            </div>
          </div>
        </div>
      </main>

      {showNewChainModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowNewChainModal(false);
          }}
        >
          <div className="w-full max-w-lg rounded-xl border border-edge bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-base font-semibold text-ink">New Chain</h2>
              <button
                onClick={() => setShowNewChainModal(false)}
                className="rounded p-1 text-ghost transition-colors hover:bg-tint hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>
            <NewChainForm
              firebaseUser={firebaseUser}
              onCreated={handleNewChainCreated}
              onCancel={() => setShowNewChainModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
