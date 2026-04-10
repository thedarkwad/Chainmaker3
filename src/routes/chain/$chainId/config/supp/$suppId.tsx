import { createFileRoute } from "@tanstack/react-router";

import { createId, type GID } from "@/chain/data/types";
import { SupplementDetail } from "../supp";

export const Route = createFileRoute("/chain/$chainId/config/supp/$suppId")({
  validateSearch: (search: Record<string, unknown>) => ({
    isNew: search.isNew === true,
  }),
  component: SuppDetailPage,
});

function SuppDetailPage() {
  const { suppId: suppIdStr } = Route.useParams();
  const { isNew } = Route.useSearch();
  const suppId = createId<GID.Supplement>(+suppIdStr);

  return <SupplementDetail key={suppIdStr} suppId={suppId} isNew={isNew} />;
}
