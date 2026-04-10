import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { createId, type GID, type Id } from "@/chain/data/types";
import { useChain, useJumpAccess, useJumpName } from "@/chain/state/hooks";
import { NarrativeCard } from "@/chain/components/NarrativeCard";

// ─────────────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/chain/$chainId/char/$charId/summary/narratives")({
  component: SummaryNarratives,
});

// ─────────────────────────────────────────────────────────────────────────────

const pillClass =
  "shrink-0 text-xs px-2 py-0.5 rounded-full bg-accent-tint text-accent border border-accent hover:bg-accent hover:text-surface transition-colors font-medium";

function NarrativeJumpCard({
  jumpId,
  chainId,
  charId,
  charGid,
}: {
  jumpId: Id<GID.Jump>;
  chainId: string;
  charId: string;
  charGid: Id<GID.Character>;
}) {
  const jumpName = useJumpName(jumpId);

  const jumpPill = (
    <Link
      to="/chain/$chainId/char/$charId/jump/$jumpId"
      params={{ chainId, charId, jumpId: String(jumpId) }}
      className={pillClass}
    >
      {jumpName || "Jump"}
    </Link>
  );

  return (
    <NarrativeCard
      jumpId={jumpId}
      charId={charGid}
      title={jumpName || "[unnamed jump]"}
      action={jumpPill}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SummaryNarratives() {
  const { chainId, charId } = Route.useParams();
  const charGid = createId<GID.Character>(+charId);
  const chain = useChain();
  const jumpAccess = useJumpAccess(charGid);

  // Collect jump IDs that have non-empty narratives for this character,
  // in chain order.
  const jumpIds = useMemo((): Id<GID.Jump>[] => {
    if (!chain) return [];
    const result: Id<GID.Jump>[] = [];

    for (const jumpId of chain.jumpList) {
      const jump = chain.jumps.O[jumpId];
      if (!jump?.useNarrative) continue;
      if (!jumpAccess?.has(jumpId as number)) continue;

      result.push(jumpId);
    }

    return result;
  }, [chain, charGid, jumpAccess]);

  if (jumpIds.length === 0) {
    return (
      <p className="text-sm text-ghost italic py-8 text-center">No narratives recorded.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {jumpIds.map((jumpId) => (
        <NarrativeJumpCard
          key={jumpId as number}
          jumpId={jumpId}
          chainId={chainId}
          charId={charId}
          charGid={charGid}
        />
      ))}
    </div>
  );
}
