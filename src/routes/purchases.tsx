import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileText, Loader2 } from "lucide-react";
import { useTheme } from "@/providers/ThemeProvider";
import { AppHeader } from "@/app/components/AppHeader";
import { UserDropdown } from "@/app/components/UserDropdown";
import { PortalNav } from "@/app/components/PortalNav";
import { JumpDocSidebar } from "@/app/components/JumpDocSidebar";
import { JumpDocPickerModal } from "@/app/components/JumpDocPickerModal";
import { SearchBar } from "@/ui/SearchBar";
import { Pagination } from "@/ui/Pagination";
import { useNsfwToggle, NsfwToggleButton } from "@/ui/NsfwToggleButton";
import {
  searchPurchases,
  type PurchaseSearchResult,
  type PurchaseSearchPage,
} from "@/api/purchases";
import { getPublishedJumpDocSummary, type JumpDocSummary } from "@/api/jumpdocs";
import { useCurrentUser } from "@/app/state/auth";
import { convertWhitespace } from "@/utilities/miscUtilities";

export const Route = createFileRoute("/purchases")({
  component: PurchasesPage,
});

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

const SEARCH_TIP = (
  <>
    <p className="font-semibold text-ink mb-1.5">Search syntax</p>
    <div className="flex flex-col gap-1 leading-relaxed">
      <p>
        <code className="font-mono bg-tint px-1 rounded">word</code>
        {" — "}name or description
      </p>
      <p>
        <code className="font-mono bg-tint px-1 rounded">name:word</code>
        {" — "}name only
      </p>
      <p>
        <code className="font-mono bg-tint px-1 rounded">description:word</code>
        {" — "}description only
      </p>
      <p>
        <code className="font-mono bg-tint px-1 rounded">{'"exact phrase"'}</code>
        {" — "}exact phrase match
      </p>
      <p className="mt-1 text-ghost">Multiple terms are ANDed.</p>
    </div>
  </>
);

function CostDisplay({
  cost,
  isScenarioReward,
}: {
  cost: PurchaseSearchResult["cost"];
  isScenarioReward: boolean;
}) {
  if (isScenarioReward) {
    if (cost.kind === "cp" && cost.amount > 0)
      return (
        <span className="text-xs text-ink tabular-nums">{cost.amount} CP or Scenario Reward</span>
      );
    return <span className="text-xs text-ink">Scenario Reward</span>;
  }
  if (cost.kind === "custom") return <span className="text-xs text-ghost italic">custom</span>;
  return <span className="text-xs text-ink tabular-nums">{cost.amount} CP</span>;
}

function extractTags(name: string, description: string): string[] {
  const seen = new Set<string>();
  for (const m of [...(name + " " + description).matchAll(/\$\{([^}]+)\}/g)]) {
    seen.add(m[1]);
  }
  return [...seen];
}

function choiceLabel(count: number): string {
  return count > 1 ? "Jumper Choices" : "Jumper Choice";
}

function PurchaseRow({
  r,
  selected,
  onSelect,
  onDocNameClick,
}: {
  r: PurchaseSearchResult;
  selected: boolean;
  onSelect: () => void;
  onDocNameClick: () => void;
}) {
  const isPerk = r.purchaseType === "perk";
  const accentBorder = !selected
    ? isPerk
      ? "border-l-2 border-l-accent"
      : "border-l-2 border-l-accent2"
    : isPerk
      ? "border border-accent bg-accent-tint"
      : "border border-accent2 bg-accent2-tint";
  const accentText = isPerk ? "text-accent" : "text-accent2";
  const accentBadge = isPerk
    ? "border-accent/40 bg-accent-tint text-accent"
    : "border-accent2/40 bg-accent2-tint text-accent2";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-start gap-4 pl-3 pr-4 py-3 transition-colors text-left ${accentBorder} ${selected ? "rounded my-3" : "bg-surface hover:bg-tint/50"}`}
    >
      {/* Name + description + choice context */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <p className={`text-sm font-medium ${accentText}`}>
          {r.name}{" "}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDocNameClick();
            }}
            className={`text-[10px] truncate max-w-40 text-ghost hover:underline transition-colors text-right md:pointer-events-none ${isPerk ? "hover:text-accent" : "hover:text-accent2"}`}
          >
            {r.docName}
          </button>
        </p>
        {r.description && (
          <div className={`text-xs text-muted [&>p+p]:mt-2 ${selected ? "" : "line-clamp-2"}`}>
            {convertWhitespace(r.description)}
          </div>
        )}
        {selected &&
          r.choiceContext &&
          (() => {
            const tags = extractTags(r.name, r.description);
            return (
              <div className="mt-1 flex flex-col gap-0.5 bg-edge/60 py-1 px-3 max-w-100 rounded">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {choiceLabel(tags.length)} (
                  {tags.map((tag, i, arr) => (
                    <span key={tag}>
                      {i > 0 &&
                        (i === arr.length - 1 ? (arr.length > 2 ? ", and " : " and ") : ", ")}
                      {tag}
                    </span>
                  ))}
                  )
                </p>
                <div className="text-xs text-muted [&>p+p]:mt-2">
                  {convertWhitespace(r.choiceContext)}
                </div>
              </div>
            );
          })()}
      </div>

      {/* Meta column */}
      <div className="shrink-0 flex flex-col items-end gap-1.5">
        <CostDisplay cost={r.cost} isScenarioReward={r.isScenarioReward} />
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${accentBadge}`}
        >
          {r.purchaseType}
        </span>
      </div>
    </button>
  );
}

function PurchasesPage() {
  const { settings, updateSettings } = useTheme();
  const { firebaseUser } = useCurrentUser();

  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [minCost, setMinCost] = useState<number | undefined>(undefined);
  const [maxCost, setMaxCost] = useState<number | undefined>(undefined);
  const [purchaseType, setPurchaseType] = useState<"perk" | "item">("perk");
  const [showNsfw, setShowNsfw] = useNsfwToggle();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PurchaseSearchPage | null>(null);
  const [loading, setLoading] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarDoc, setSidebarDoc] = useState<JumpDocSummary | null>(null);
  const [pickerTab, setPickerTab] = useState<"new" | "existing" | null>(null);

  // Fetch sidebar doc when selected purchase changes
  useEffect(() => {
    if (!selectedId) {
      setSidebarDoc(null);
      return;
    }
    const selected = data?.results.find((r) => r._id === selectedId);
    if (!selected) return;
    const fetchSummary = async () => {
      const idToken = await firebaseUser?.getIdToken();
      const doc = await getPublishedJumpDocSummary({
        data: { publicUid: selected.docId, idToken },
      });
      if (doc) setSidebarDoc(doc);
    };
    fetchSummary();
  }, [selectedId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setCommittedSearch(search);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    searchPurchases({
      data: { search: committedSearch, page, pageSize: PAGE_SIZE, minCost, maxCost, purchaseType, showNsfw },
    })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [committedSearch, page, minCost, maxCost, purchaseType, showNsfw]);

  const handleMinCost = (v: string) => {
    setMinCost(v === "" ? undefined : Number(v));
    setPage(1);
  };

  const handleMaxCost = (v: string) => {
    setMaxCost(v === "" ? undefined : Number(v));
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="flex h-dvh flex-col bg-radial">
      <title>Perks & Items | ChainMaker</title>
      <AppHeader
        nav={<PortalNav />}
        actions={<UserDropdown />}
        settings={settings}
        onUpdateSettings={updateSettings}
        transparent
      />
      <div className="flex flex-1 min-h-0">
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl flex flex-col gap-3 p-4">
            <div className="bg-accent-ring rounded-md px-4 py-3 flex flex-wrap items-center gap-2">
              <SearchBar
                inverted
                className="grow-2"
                value={search}
                onChange={setSearch}
                placeholder="Search purchases…"
                tip={SEARCH_TIP}
              />
              <div className="flex min-w-fit items-center gap-x-2 flex-1 grow justify-end">
                <div className="flex shrink-0 rounded overflow-hidden border border-surface/30 text-xs">
                  {(["perk", "item"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        setPurchaseType(v);
                        setPage(1);
                      }}
                      className={`px-2 py-1 capitalize transition-colors ${purchaseType === v ? "bg-surface/30 text-surface" : "text-surface/50 hover:text-surface/80"}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <NsfwToggleButton showNsfw={showNsfw} onToggle={(v) => { setShowNsfw(v); setPage(1); }} />
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-surface/60 shrink-0">Cost:</span>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    placeholder="min"
                    value={minCost ?? ""}
                    onChange={(e) => handleMinCost(e.target.value)}
                    className="w-16 border border-surface/30 rounded px-2 py-1 text-xs bg-surface/10 text-surface placeholder:text-surface/40 focus:outline-none focus:border-surface/60"
                  />
                  <span className="text-xs text-surface/60">–</span>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    placeholder="max"
                    value={maxCost ?? ""}
                    onChange={(e) => handleMaxCost(e.target.value)}
                    className="w-16 border border-surface/30 rounded px-2 py-1 text-xs bg-surface/10 text-surface placeholder:text-surface/40 focus:outline-none focus:border-surface/60"
                  />
                </div>
              </div>
            </div>

            {/* Result count */}
            {data && !loading && (
              <p className="text-xs text-ghost text-right">
                {data.total.toLocaleString()} {data.total === 1 ? "purchase" : "purchases"}
              </p>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center gap-2 py-16 text-muted">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">{committedSearch ? "Searching…" : "Loading…"}</span>
              </div>
            )}

            {/* Empty */}
            {!loading && data && data.results.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-16 text-ghost italic">
                {committedSearch ? (
                  <>
                    <span className="text-sm">No results for</span>
                    <code className="text-xs bg-tint px-1.5 py-0.5 rounded">{committedSearch}</code>
                  </>
                ) : (
                  <span className="text-sm">No purchases found.</span>
                )}
              </div>
            )}

            {/* Results */}
            {!loading && data && data.results.length > 0 && (
              <>
                <div
                  className={`flex flex-col divide-y divide-line rounded-lg border-edge overflow-hidden ${data.results[0]._id != selectedId ? "border-t" : "-mt-3"} ${data.results[data.results.length - 1]._id != selectedId ? "border-b" : "-mb-3"}`}
                >
                  {data.results.map((r) => (
                    <PurchaseRow
                      key={r._id}
                      r={r}
                      selected={r._id === selectedId}
                      onSelect={() => setSelectedId(r._id === selectedId ? null : r._id)}
                      onDocNameClick={() => {
                        setSelectedId(r._id);
                        setMobileSidebarOpen(true);
                      }}
                    />
                  ))}
                </div>
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
              </>
            )}
          </div>
        </main>

        {/* Sidebar — large screens */}
        <div className="hidden w-72 shrink-0 flex-col bg-tint border-t overflow-y-auto border-l border-edge md:flex">
          {!sidebarDoc ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <FileText size={24} className="text-edge" />
              <p className="text-xs text-ghost">
                Select a purchase
                <br />
                to see jumpdoc details
              </p>
            </div>
          ) : (
            <JumpDocSidebar
              doc={sidebarDoc}
              isOwner={sidebarDoc.isOwner ?? false}
              onClose={() => setSidebarDoc(null)}
              onNewChain={() => setPickerTab("new")}
              onExistingChain={() => setPickerTab("existing")}
            />
          )}
        </div>
      </div>

      {/* Sidebar — small screens: overlay drawer */}
      {sidebarDoc && mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 backdrop-blur-sm md:hidden"
          onMouseDown={() => setMobileSidebarOpen(false)}
        >
          <div
            className="absolute right-0 top-0 flex h-full w-72 flex-col overflow-y-auto border-l border-edge bg-surface shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <JumpDocSidebar
              doc={sidebarDoc}
              isOwner={sidebarDoc.isOwner ?? false}
              onClose={() => setMobileSidebarOpen(false)}
              onNewChain={() => setPickerTab("new")}
              onExistingChain={() => setPickerTab("existing")}
            />
          </div>
        </div>
      )}

      {pickerTab !== null && sidebarDoc && (
        <JumpDocPickerModal
          doc={sidebarDoc}
          defaultTab={pickerTab}
          onClose={() => setPickerTab(null)}
        />
      )}
    </div>
  );
}
