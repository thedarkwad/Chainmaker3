import { createFileRoute } from "@tanstack/react-router";
import { SharePage } from "@/chain/export/components/SharePage";
import { ElectronChainNav } from "@/chain/components/ElectronChainNav";

export const Route = createFileRoute("/chain/$chainId/share")({
  component: ShareRoute,
});

function ShareRoute() {
  const { chainId } = Route.useParams();
  return (
    <div className="flex flex-col h-full">
      {import.meta.env.VITE_PLATFORM === "electron" && (
        <ElectronChainNav chainId={chainId} />
      )}
      <div className="flex-1 min-h-0">
        <SharePage />
      </div>
    </div>
  );
}
