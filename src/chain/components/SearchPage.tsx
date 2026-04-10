import { Check, ChevronDown } from "lucide-react";
import { useMemo, useEffect, useRef, useState } from "react";

import {
  type BasicPurchase,
  type JumpPurchase,
  type SupplementPurchase,
} from "@/chain/data/Purchase";
import { type GID, type Id, type Registry } from "@/chain/data/types";
import { useChain } from "@/chain/state/hooks";
import {
  matchesPerkItem,
  parseSearchQuery,
  tagDirectlyMatches,
  type PerkSearchItem,
  type SearchToken,
} from "@/utilities/SearchUtilities";
import { PurchasePreview } from "./PurchasePreview";
import { PurchaseGroupEditor } from "./PurchaseGroupEditor";
import { CollapsibleSection } from "@/ui/CollapsibleSection";
import { Pagination } from "@/ui/Pagination";
import { SearchBar } from "@/ui/SearchBar";

// ─────────────────────────────────────────────────────────────────────────────

const CHRONO_PAGE_SIZE = 20;
const TAG_ITEMS_PAGE_SIZE = 12;
const TAG_LIST_PAGE_SIZE = 20;

type ViewMode = "chronological" | "tag";

type SearchResult =
  | { kind: "purchase"; id: Id<GID.Purchase> }
  | { kind: "group"; groupId: Id<GID.PurchaseGroup> };

export type SupplementSource = {
  id: Id<GID.Supplement>;
  name: string;
  /** All purchase IDs from this supplement for the relevant character. */
  ids: Id<GID.Purchase>[];
};

type SearchPageProps = {
  /** Core purchase IDs (always shown regardless of supplement toggles). */
  coreIds: Id<GID.Purchase>[];
  /**
   * Optional supplement sources. One toggle button per source;
   * all are enabled by default.
   */
  supplementSources?: SupplementSource[];
  chainId: string;
  charId: string;
  charGid?: Id<GID.Character>;
  /** Singular item label for result counts, e.g. "perk". Defaults to "item". */
  itemLabel?: string;
  defaultView?: ViewMode;
  defaultSearch?: string;
  /** Tag name to auto-expand when the page first loads in tag view. */
  autoExpandTag?: string;
  /**
   * Category registry for the category filter dropdown.
   * When provided (and non-empty), a multiselect category filter appears in the header.
   */
  categories?: Registry<GID.PurchaseCategory, string>;
};

// ─────────────────────────────────────────────────────────────────────────────

export function SearchPage({
  coreIds,
  supplementSources = [],
  chainId,
  charId,
  charGid,
  itemLabel = "item",
  defaultView = "chronological",
  defaultSearch = "",
  autoExpandTag,
  categories,
}: SearchPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // On mount, scroll the nearest scrollable ancestor to the top.
  // Because perks.tsx uses key={urlTag} to force a remount on every tag
  // navigation, this naturally fires each time the user follows a tag link.
  useEffect(() => {
    let node: HTMLElement | null = containerRef.current?.parentElement ?? null;
    while (node) {
      const { overflowY } = window.getComputedStyle(node);
      if (
        (overflowY === "auto" || overflowY === "scroll") &&
        node.scrollHeight > node.clientHeight
      ) {
        node.scrollTo({ top: 0, behavior: "smooth" });
        break;
      }
      node = node.parentElement;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [viewMode, setViewMode] = useState<ViewMode>(defaultView);
  const [searchTerm, setSearchTerm] = useState(defaultSearch);
  const [page, setPage] = useState(1);
  // Excluded supplement IDs — empty set means all supplements are included.
  const [excludedSupplements, setExcludedSupplements] = useState<Set<number>>(() => new Set());
  // Selected category IDs — empty set means all categories pass through.
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(() => new Set());

  const chain = useChain();

  const groupsEnabled =
    charGid != null &&
    (itemLabel === "perk"
      ? (chain?.chainSettings.allowPerkGroups ?? false)
      : (chain?.chainSettings.allowItemGroups ?? false));

  // Flatten category registry into stable [idStr, name][] for rendering.
  const categoryEntries = useMemo(
    () => (categories ? (Object.entries(categories.O) as [string, string][]) : []),
    [categories],
  );

  // ── Merge IDs in chronological jump order ─────────────────────────────────
  const allIds = useMemo(() => {
    if (!chain) return [];
    const enabled = new Set<Id<GID.Purchase>>();
    for (const id of coreIds) enabled.add(id);
    for (const src of supplementSources) {
      if (!excludedSupplements.has(src.id as number)) {
        for (const id of src.ids) enabled.add(id);
      }
    }
    // Group enabled purchases by their jump, then collect in jumpList order.
    const byJump = new Map<Id<GID.Jump>, Id<GID.Purchase>[]>();
    for (const id of enabled) {
      const p = chain.purchases.O[id] as JumpPurchase | undefined;
      if (!p) continue;
      const bucket = byJump.get(p.jumpId);
      if (bucket) bucket.push(id);
      else byJump.set(p.jumpId, [id]);
    }
    const result: Id<GID.Purchase>[] = [];
    for (const jumpId of chain.jumpList) {
      const bucket = byJump.get(jumpId);
      if (bucket) result.push(...bucket);
    }
    return result;
  }, [coreIds, supplementSources, excludedSupplements, chain]);

  // ── Search + filter ───────────────────────────────────────────────────────
  const tokens = useMemo(() => parseSearchQuery(searchTerm), [searchTerm]);

  // When a category filter is active, supplement purchases are excluded entirely
  // because supplement categories are independent of the core category registry.
  const supplementIdSet = useMemo(() => {
    if (selectedCategoryIds.size === 0) return null;
    const s = new Set<number>();
    for (const src of supplementSources) {
      for (const id of src.ids) s.add(id as number);
    }
    return s;
  }, [selectedCategoryIds.size, supplementSources]);

  const allResults = useMemo((): SearchResult[] => {
    if (!chain || !groupsEnabled || charGid == null) {
      return allIds.map((id) => ({ kind: "purchase" as const, id }));
    }
    const results: SearchResult[] = [];
    const seenGroups = new Set<number>();
    for (const id of allIds) {
      const p = chain.purchases.O[id] as BasicPurchase | undefined;
      if (p?.purchaseGroup != null) {
        const gNum = p.purchaseGroup as number;
        if (!seenGroups.has(gNum)) {
          seenGroups.add(gNum);
          results.push({ kind: "group", groupId: p.purchaseGroup });
        }
      } else {
        results.push({ kind: "purchase", id });
      }
    }
    return results;
  }, [allIds, chain, groupsEnabled, charGid]);

  const filteredResults = useMemo((): SearchResult[] => {
    if (!chain) return [];
    return allResults.filter((result) => {
      if (result.kind === "purchase") {
        const p = chain.purchases.O[result.id];
        if (!p) return false;
        if (p.duration) return false;
        if (selectedCategoryIds.size > 0) {
          if (supplementIdSet?.has(result.id as number)) return false;
          const cats = (p as BasicPurchase | SupplementPurchase).categories ?? [];
          if (!cats.some((cId) => selectedCategoryIds.has(cId as number))) return false;
        }
        if ((p as SupplementPurchase).obsolete) return false;
        if (tokens.length === 0) return true;
        const subNames: string[] = [];
        const subDescs: string[] = [];
        const subList = (p as BasicPurchase).subpurchases?.list;
        if (subList) {
          for (const subId of subList) {
            const sub = chain.purchases.O[subId];
            if (sub) {
              subNames.push(sub.name);
              subDescs.push(sub.description);
            }
          }
        }
        const item: PerkSearchItem = {
          name: p.name,
          description: p.description,
          tags: "tags" in p ? (p as BasicPurchase | SupplementPurchase).tags : [],
          subpurchaseNames: subNames,
          subpurchaseDescriptions: subDescs,
        };
        return matchesPerkItem(item, tokens);
      } else {
        if (charGid == null) return false;
        const group = chain.purchaseGroups[charGid]?.O[result.groupId];
        if (!group) return false;
        if (selectedCategoryIds.size > 0) {
          const hasCategory = group.components.some((purchId) => {
            const p = chain.purchases.O[purchId] as BasicPurchase | undefined;
            return p?.categories?.some((cId) => selectedCategoryIds.has(cId as number));
          });
          if (!hasCategory) return false;
        }
        if (tokens.length === 0) return true;
        const allNames: string[] = [group.name];
        const allDescs: string[] = [group.description];
        const allTags: string[] = [];
        for (const purchId of group.components) {
          const p = chain.purchases.O[purchId] as BasicPurchase | undefined;
          if (!p) continue;
          allNames.push(p.name);
          allDescs.push(p.description);
          for (const t of p.tags ?? []) allTags.push(t);
          if (p.subpurchases?.list) {
            for (const subId of p.subpurchases.list) {
              const sub = chain.purchases.O[subId];
              if (sub) {
                allNames.push(sub.name);
                allDescs.push(sub.description);
              }
            }
          }
        }
        return matchesPerkItem(
          {
            name: group.name,
            description: group.description,
            tags: allTags,
            subpurchaseNames: allNames,
            subpurchaseDescriptions: allDescs,
          },
          tokens,
        );
      }
    });
  }, [allResults, tokens, chain, selectedCategoryIds, supplementIdSet, charGid]);

  // ── Tag grouping + smart ordering ─────────────────────────────────────────
  const { tagEntries, untagged } = useMemo(() => {
    if (!chain) {
      return {
        tagEntries: [] as [string, SearchResult[]][],
        untagged: [] as SearchResult[],
      };
    }
    const byTag = new Map<string, SearchResult[]>();
    const untaggedList: SearchResult[] = [];
    for (const result of filteredResults) {
      let tags: string[] = [];
      if (result.kind === "purchase") {
        const p = chain.purchases.O[result.id];
        tags = p && "tags" in p ? (p as BasicPurchase | SupplementPurchase).tags : [];
      } else if (charGid != null) {
        const group = chain.purchaseGroups[charGid]?.O[result.groupId];
        if (group) {
          const tagSet = new Set<string>();
          for (const purchId of group.components) {
            const p = chain.purchases.O[purchId] as BasicPurchase | undefined;
            for (const t of p?.tags ?? []) tagSet.add(t);
          }
          tags = [...tagSet];
        }
      }
      if (tags.length === 0) {
        untaggedList.push(result);
      } else {
        for (const tag of tags) {
          if (!byTag.has(tag)) byTag.set(tag, []);
          byTag.get(tag)!.push(result);
        }
      }
    }

    const idOrder = new Map<SearchResult, number>();
    filteredResults.forEach((r, idx) => idOrder.set(r, idx));

    const sorted = [...byTag.entries()]
      .map(([tag, results]) => ({
        tag,
        results,
        directMatch: tagDirectlyMatches(tag, tokens),
        earliestIdx: Math.min(...results.map((r) => idOrder.get(r) ?? Infinity)),
      }))
      .sort((a, b) => {
        if (a.directMatch !== b.directMatch) return a.directMatch ? -1 : 1;
        return a.earliestIdx - b.earliestIdx;
      })
      .map(({ tag, results }) => [tag, results] as [string, SearchResult[]]);

    return { tagEntries: sorted, untagged: untaggedList };
  }, [filteredResults, chain, tokens, charGid]);

  // ── Chronological pagination ───────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredResults.length / CHRONO_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedResults = filteredResults.slice(
    (currentPage - 1) * CHRONO_PAGE_SIZE,
    currentPage * CHRONO_PAGE_SIZE,
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const handleCategoryChange = (next: Set<number>) => {
    setSelectedCategoryIds(next);
    setPage(1);
  };

  const toggleSupplement = (suppNum: number) => {
    setExcludedSupplements((prev) => {
      const next = new Set(prev);
      if (next.has(suppNum)) next.delete(suppNum);
      else next.add(suppNum);
      return next;
    });
    setPage(1);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      {/* Styled header — matches the jump-name banner in the jump layout */}
      <div className="bg-accent-ring rounded-md px-4 py-3 flex flex-col gap-2.5">
        {/* Search bar + category filter + view toggle */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <SearchBar
            className="grow-2"
            inverted
            autoFocus
            value={searchTerm}
            onChange={handleSearch}
            placeholder={`Search ${itemLabel}s…`}
          />
          <div className="flex min-w-fit items-center gap-x-2 flex-1 grow justify-end">
            {categoryEntries.length > 0 && (
              <CategoryDropdown
                entries={categoryEntries}
                selected={selectedCategoryIds}
                onChange={handleCategoryChange}
              />
            )}
            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>
        </div>

        {/* Supplement toggles */}
        {supplementSources.length > 0 && (
          <div className="flex flex-wrap justify-end items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-surface/60 shrink-0">
              Supplements
            </span>
            {supplementSources.map((src) => {
              const included = !excludedSupplements.has(src.id as number);
              return (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => toggleSupplement(src.id as number)}
                  className={`text-xs px-2.5 py-0.5 rounded-full font-medium transition-colors ${
                    included
                      ? "bg-surface text-accent-ring"
                      : "bg-surface/10 outline outline-surface/25 text-surface/70 hover:bg-surface/20 hover:text-surface"
                  }`}
                >
                  {src.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Result count */}
      {filteredResults.length > 0 && (
        <p className="text-xs text-ghost text-right">
          {filteredResults.length} {filteredResults.length === 1 ? itemLabel : `${itemLabel}s`}
        </p>
      )}

      {/* Active view */}
      {viewMode === "chronological" ? (
        <div className="flex flex-col gap-0.5">
          {filteredResults.length === 0 ? (
            <p className="text-xs text-ghost text-center py-8 italic">No {itemLabel}s found.</p>
          ) : (
            <>
              {pagedResults.map((result) =>
                result.kind === "purchase" ? (
                  <PurchasePreview
                    key={result.id as number}
                    id={result.id}
                    chainId={chainId}
                    charId={charId}
                  />
                ) : (
                  <PurchaseGroupEditor
                    key={result.groupId as number}
                    groupId={result.groupId}
                    charId={charGid!}
                    chainId={chainId}
                    charIdStr={charId}
                  />
                ),
              )}
              <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
        </div>
      ) : (
        <TagView
          tagEntries={tagEntries}
          untagged={untagged}
          chainId={chainId}
          charId={charId}
          charGid={charGid}
          autoExpandTag={autoExpandTag}
          itemLabel={itemLabel}
          tokens={tokens}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal sub-components
// ─────────────────────────────────────────────────────────────────────────────

function CategoryDropdown({
  entries,
  selected,
  onChange,
}: {
  entries: [string, string][];
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (n: number) => {
    const next = new Set(selected);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    onChange(next);
  };

  const activeCount = selected.size;
  const allSelected = activeCount === 0 || activeCount === entries.length;
  const label =
    activeCount === 0 || allSelected
      ? "All Categories"
      : activeCount === 1
        ? (entries.find(([id]) => selected.has(+id))?.[1] ?? "1 category")
        : `${activeCount} categories`;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-surface/30 transition-colors ${
          !allSelected
            ? "bg-surface/20 text-surface"
            : "text-surface/70 hover:bg-surface/15 hover:text-surface"
        }`}
      >
        {label}
        <ChevronDown size={10} className="shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 z-20 bg-surface border border-edge rounded-lg shadow-lg py-1 min-w-40">
          {entries.map(([idStr, name]) => {
            const n = +idStr;
            const on = selected.has(n);
            return (
              <button
                key={idStr}
                type="button"
                onClick={() => toggle(n)}
                className={`w-full text-left text-xs px-3 py-1.5 flex items-center gap-2 transition-colors ${
                  on ? "bg-accent-tint text-accent" : "text-ink hover:bg-tint"
                }`}
              >
                <span
                  className={`w-3 h-3 rounded-sm border shrink-0 flex items-center justify-center ${
                    on ? "bg-accent border-accent" : "border-edge"
                  }`}
                >
                  {on && <Check size={8} className="text-surface" />}
                </span>
                {name}
              </button>
            );
          })}
          {!allSelected && (
            <div className="border-t border-line mt-1 pt-1 px-2">
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="w-full text-xs text-ghost hover:text-muted py-0.5 text-center transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex border border-surface/30 rounded-lg overflow-hidden shrink-0">
      <button
        type="button"
        onClick={() => onChange("chronological")}
        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
          value === "chronological"
            ? "bg-surface/20 text-surface"
            : "text-surface/70 hover:bg-surface/15 hover:text-surface"
        }`}
      >
        Chronological
      </button>
      <button
        type="button"
        onClick={() => onChange("tag")}
        className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-surface/30 ${
          value === "tag"
            ? "bg-surface/20 text-surface"
            : "text-surface/70 hover:bg-surface/15 hover:text-surface"
        }`}
      >
        By Tag
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function TagView({
  tagEntries,
  untagged,
  chainId,
  charId,
  charGid,
  autoExpandTag,
  itemLabel,
  tokens,
}: {
  tagEntries: [string, SearchResult[]][];
  untagged: SearchResult[];
  chainId: string;
  charId: string;
  charGid: Id<GID.Character> | undefined;
  autoExpandTag: string | undefined;
  itemLabel: string;
  tokens: SearchToken[];
}) {
  const [tagPage, setTagPage] = useState(1);

  // Untagged group always goes last.
  const allEntries: [string, SearchResult[]][] = [
    ...tagEntries,
    ...(untagged.length > 0 ? [["(Untagged)", untagged] as [string, SearchResult[]]] : []),
  ];

  const totalTagPages = Math.max(1, Math.ceil(allEntries.length / TAG_LIST_PAGE_SIZE));
  const currentTagPage = Math.min(tagPage, totalTagPages);
  const pagedEntries = allEntries.slice(
    (currentTagPage - 1) * TAG_LIST_PAGE_SIZE,
    currentTagPage * TAG_LIST_PAGE_SIZE,
  );

  if (allEntries.length === 0) {
    return <p className="text-xs text-ghost text-center py-8 italic">No {itemLabel}s found.</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {pagedEntries.map(([tag, results]) => (
        <TagGroup
          key={tag}
          tag={tag}
          results={results}
          chainId={chainId}
          charId={charId}
          charGid={charGid}
          defaultOpen={
            (autoExpandTag !== undefined && autoExpandTag.toLowerCase() === tag.toLowerCase()) ||
            tagDirectlyMatches(tag, tokens)
          }
          itemLabel={itemLabel}
        />
      ))}
      <Pagination page={currentTagPage} totalPages={totalTagPages} onPageChange={setTagPage} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function TagGroup({
  tag,
  results,
  chainId,
  charId,
  charGid,
  defaultOpen,
  itemLabel,
}: {
  tag: string;
  results: SearchResult[];
  chainId: string;
  charId: string;
  charGid: Id<GID.Character> | undefined;
  defaultOpen: boolean;
  itemLabel: string;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(results.length / TAG_ITEMS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedResults = results.slice(
    (currentPage - 1) * TAG_ITEMS_PAGE_SIZE,
    currentPage * TAG_ITEMS_PAGE_SIZE,
  );
  const label = results.length === 1 ? itemLabel : `${itemLabel}s`;

  return (
    <CollapsibleSection
      title={`${tag} (${results.length} ${label})`}
      styled
      defaultOpen={defaultOpen}
    >
      {pagedResults.map((result) =>
        result.kind === "purchase" ? (
          <PurchasePreview
            key={result.id as number}
            id={result.id}
            chainId={chainId}
            charId={charId}
            subdued
          />
        ) : (
          <PurchaseGroupEditor
            key={result.groupId as number}
            groupId={result.groupId}
            charId={charGid!}
            chainId={chainId}
            charIdStr={charId}
          />
        ),
      )}
      <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
    </CollapsibleSection>
  );
}
