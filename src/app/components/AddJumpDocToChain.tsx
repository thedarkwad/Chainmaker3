/**
 * AddJumpDocToChain — lets the user identify an existing chain to add a JumpDoc to.
 *
 * Logged-in users see two tabs:
 *   "My Chains"  — searchable list of their chains; click one to confirm.
 *   "Enter URL"  — paste any /chain/<id> URL, or type a bare chain ID.
 *
 * Guests see only the URL/ID tab.
 *
 * Calls onSelect(chainPublicUid) when confirmed; the parent handles navigation.
 */

import { useEffect, useState } from "react";
import { ChevronRight, Loader2, Search } from "lucide-react";
import { useCurrentUser } from "@/app/state/auth";
import { listChains, type ChainSummary } from "@/api/chains";
import type { JumpDocSummary } from "@/api/jumpdocs";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Extracts a chain public UID from a full URL, relative path, or bare ID. */
function extractChainId(input: string): string | null {
  const trimmed = input.trim();
  const match = trimmed.match(/\/chain\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed;
  return null;
}

// ── types ─────────────────────────────────────────────────────────────────────

export type AddJumpDocToChainProps = {
  /** The JumpDoc being added. Currently informational; passed through to onSelect. */
  doc?: JumpDocSummary;
  /** Called with the chosen chain's publicUid. Parent handles navigation. */
  onSelect: (chainPublicUid: string) => void;
  onCancel?: () => void;
};

type Tab = "list" | "url";

// ── subcomponents ─────────────────────────────────────────────────────────────

function ChainListTab({
  onSelect,
}: {
  onSelect: (chainPublicUid: string) => void;
}) {
  const { firebaseUser } = useCurrentUser();
  const [chains, setChains] = useState<ChainSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser
      .getIdToken()
      .then((token) => listChains({ data: token }))
      .then(setChains)
      .catch(() => setError("Failed to load chains."))
      .finally(() => setLoading(false));
  }, [firebaseUser]);

  const filtered = chains.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ghost pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search chains…"
          className="w-full rounded border border-edge bg-tint pl-7 pr-3 py-1.5 text-xs text-ink placeholder:text-ghost focus:border-accent focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-ghost">
          <Loader2 size={13} className="animate-spin" />
          Loading…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-xs text-danger">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="py-4 text-center text-xs italic text-ghost">
          {chains.length === 0 ? "No chains yet." : "No chains match your search."}
        </p>
      ) : (
        <div className="flex max-h-56 flex-col overflow-y-auto">
          {filtered.map((chain) => (
            <button
              key={chain.publicUid}
              type="button"
              onClick={() => onSelect(chain.publicUid)}
              className="group flex items-center gap-2 rounded px-3 py-2 text-left transition-colors hover:bg-tint"
            >
              <span className="flex-1 truncate text-sm text-ink">{chain.name}</span>
              <ChevronRight
                size={13}
                className="shrink-0 text-ghost sm:opacity-0 transition-opacity sm:group-hover:opacity-100"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UrlTab({ onSelect }: { onSelect: (chainPublicUid: string) => void }) {
  const [input, setInput] = useState("");
  const extractedId = extractChainId(input);
  const hasInput = input.trim().length > 0;
  const valid = hasInput && extractedId !== null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted">Chain URL or ID</label>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && valid) onSelect(extractedId!); }}
          placeholder="https://…/chain/abc123  or  abc123"
          className="w-full rounded border border-edge bg-tint px-3 py-1.5 text-xs text-ink placeholder:text-ghost focus:border-accent focus:outline-none"
        />
        {hasInput && !valid && (
          <p className="text-xs text-danger">Couldn't find a chain ID in that input.</p>
        )}
        {valid && (
          <p className="text-xs text-ghost">
            Chain ID:{" "}
            <span className="font-mono text-ink">{extractedId}</span>
          </p>
        )}
      </div>

      <button
        type="button"
        disabled={!valid}
        onClick={() => valid && onSelect(extractedId!)}
        className="rounded bg-accent px-4 py-2 text-xs font-medium text-surface transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Open Chain
      </button>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function AddJumpDocToChain({ onSelect, onCancel }: AddJumpDocToChainProps) {
  const { firebaseUser } = useCurrentUser();
  const [tab, setTab] = useState<Tab>(firebaseUser ? "list" : "url");

  return (
    <div className="flex flex-col gap-4 p-5">
      {/* Tab switcher — only when logged in */}
      {firebaseUser && (
        <div className="flex overflow-hidden rounded-lg border border-edge text-xs">
          <button
            type="button"
            onClick={() => setTab("list")}
            className={`flex-1 py-1.5 text-center transition-colors ${
              tab === "list" ? "bg-accent text-white" : "text-muted hover:text-ink"
            }`}
          >
            My Chains
          </button>
          <button
            type="button"
            onClick={() => setTab("url")}
            className={`flex-1 py-1.5 text-center transition-colors ${
              tab === "url" ? "bg-accent text-white" : "text-muted hover:text-ink"
            }`}
          >
            Enter URL / ID
          </button>
        </div>
      )}

      {tab === "list" && <ChainListTab onSelect={onSelect} />}
      {tab === "url" && <UrlTab onSelect={onSelect} />}

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="text-center text-xs text-ghost transition-colors hover:text-muted"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
