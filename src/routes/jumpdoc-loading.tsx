import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/jumpdoc-loading")({
  component: JumpdocLoading,
});

function JumpdocLoading() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-canvas">
      <Loader2 size={28} className="animate-spin text-accent" />
      <p className="text-sm text-muted">Initializing jumpdoc...</p>
    </div>
  );
}
