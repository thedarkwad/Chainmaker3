import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useChain } from "@/chain/state/hooks";

export const Route = createFileRoute("/chain/$chainId/")({
  component: ChainIndex,
});

/** Redirects to the first primary character's summary page once the chain loads.
 *  Uses plain useNavigate — this is a system redirect, not user navigation. */
function ChainIndex() {
  const { chainId } = Route.useParams();
  const chain = useChain();
  // Plain navigate — this is an initial redirect, not a user action.
  const navigate = useNavigate();

  useEffect(() => {
    if (!chain) return;
    const chars = chain.characterList
      .map((id) => chain.characters.O[id])
      .filter(Boolean);
    const target = chars.find((c) => c!.primary) ?? chars[0];
    if (target) {
      navigate({
        to: "/chain/$chainId/char/$charId/summary/",
        params: { chainId, charId: String(target.id as number) },
        replace: true,
      } as never);
    }
  }, [chain]);

  return (
    <div className="flex items-center justify-center h-full text-sm text-muted">
      Loading chain…
    </div>
  );
}
