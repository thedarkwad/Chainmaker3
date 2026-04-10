import { Link, useLocation } from "@tanstack/react-router";
import { Share } from "lucide-react";
import { navButtonClass } from "@/app/components/AppHeader";
import { useFirstNavIds } from "@/chain/state/hooks";

export function ElectronChainNav({
  chainId,
  charId: propCharId,
  jumpId: propJumpId,
}: {
  chainId: string;
  charId?: string | null;
  jumpId?: string | null;
}) {
  const { charId: firstCharId, jumpId: firstJumpId } = useFirstNavIds();
  const charId = propCharId ?? firstCharId;
  const jumpId = propJumpId ?? firstJumpId;

  const { pathname } = useLocation();
  const inJump = pathname.includes("/jump/");
  const inSummary = pathname.includes("/summary");
  const inCache = pathname.includes("/items");
  const inConfig = pathname.includes("/config") && !inJump;
  const inShare = pathname.includes("/share");

  return (
    <div className="shrink-0 flex items-center gap-0.5 h-9 bg-accent/60 px-2 overflow-x-auto">
      {charId && jumpId ? (
        <Link
          to="/chain/$chainId/char/$charId/jump/$jumpId"
          params={{ chainId, charId, jumpId }}
          className={navButtonClass(inJump)}
        >
          Jump Itinerary
        </Link>
      ) : (
        <span className={navButtonClass(inJump)}>Jump Itinerary</span>
      )}

      {charId ? (
        <Link
          to="/chain/$chainId/char/$charId/summary"
          params={{ chainId, charId }}
          className={navButtonClass(inSummary)}
        >
          Traveler Manifest
        </Link>
      ) : (
        <span className={navButtonClass(inSummary)}>Traveler Manifest</span>
      )}

      {charId ? (
        <Link
          to="/chain/$chainId/char/$charId/items"
          params={{ chainId, charId }}
          className={navButtonClass(inCache)}
        >
          Cosmic Cache
        </Link>
      ) : (
        <span className={navButtonClass(inCache)}>Cosmic Cache</span>
      )}

      <Link
        to="/chain/$chainId/config"
        params={{ chainId }}
        className={navButtonClass(inConfig)}
      >
        Chain Settings
      </Link>

      <Link
        to="/chain/$chainId/share"
        params={{ chainId }}
        title="Share Chain"
        className={navButtonClass(inShare, true)}
      >
        <Share size={20} />
      </Link>
    </div>
  );
}
