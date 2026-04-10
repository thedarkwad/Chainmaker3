import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";

import { synchronizeJumpAccess } from "@/chain/state/calculations";
import { createId, GID } from "@/chain/data/types";

export const Route = createFileRoute("/chain/$chainId/char/$charId")({
  component: CharLayout,
});

function CharLayout() {
  const charId = createId<GID.Character>(+Route.useParams().charId);

  useEffect(() => synchronizeJumpAccess(charId), [charId]);

  return <Outlet />;
}
