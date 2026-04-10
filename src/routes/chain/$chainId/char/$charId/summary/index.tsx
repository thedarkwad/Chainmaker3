import { createFileRoute } from "@tanstack/react-router";

import { createId, type GID } from "@/chain/data/types";
import { useCharacter } from "@/chain/state/hooks";
import { AltFormEditor } from "@/chain/components/AltFormEditor";
import { BackgroundCard, BiographyCard, PersonalIdentityCard } from "@/chain/components/CharacterCards";

export const Route = createFileRoute("/chain/$chainId/char/$charId/summary/")({
  component: SummaryOverview,
});

// ─────────────────────────────────────────────────────────────────────────────

function SummaryOverview() {
  const { charId } = Route.useParams();
  const charGid = createId<GID.Character>(+charId);
  const { char, modify } = useCharacter(charGid);

  if (!char) {
    return <div className="py-6 text-sm text-muted italic text-center">Character Not Found!</div>;
  }

  return (
    <div key={charId} className="py-1">
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {/* Left: biographical facts + physical form */}
        <div className="flex flex-col gap-2">
          <BackgroundCard char={char} modify={modify} />
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide px-1">
              Original Form
            </p>
            <AltFormEditor id={char.originalForm} />
          </div>
        </div>

        {/* Right: identity + notes */}
        <div className="flex flex-col gap-2">
          <BiographyCard char={char} modify={modify} />
          <PersonalIdentityCard char={char} modify={modify} />
        </div>
      </div>
    </div>
  );
}
