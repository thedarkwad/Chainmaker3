import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useChainSupplementIds } from "@/chain/state/hooks";

export const Route = createFileRoute("/chain/$chainId/config/supp/")({
  component: SuppIndexPage,
});

function SuppIndexPage() {
  const { chainId } = Route.useParams();
  const suppIds = useChainSupplementIds();
  const navigate = useNavigate();

  useEffect(() => {
    if (suppIds.length > 0) {
      void navigate({
        to: "/chain/$chainId/config/supp/$suppId",
        params: { chainId, suppId: String(suppIds[0] as number) },
        replace: true,
      });
    }
  }, [suppIds, chainId, navigate]);

  if (suppIds.length > 0) return null;

  return (
    <p className="text-sm text-ghost italic text-center pt-12">
      No supplements yet — use the sidebar to add one.
    </p>
  );
}
