import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useChainStore } from "@/chain/state/Store";
import { makeUndoRedoProvider } from "./makeUndoRedoProvider";

const BaseProvider = makeUndoRedoProvider(useChainStore);

export function UndoRedoProvider() {
  const pendingNavigation = useChainStore((s) => s.pendingNavigation);
  const clearPendingNavigation = useChainStore((s) => s.clearPendingNavigation);
  const navigate = useNavigate();

  useEffect(() => {
    if (!pendingNavigation) return;
    const current = window.location.pathname + window.location.search;
    if (pendingNavigation !== current) navigate({ to: pendingNavigation });
    clearPendingNavigation();
  }, [pendingNavigation]); // eslint-disable-line react-hooks/exhaustive-deps

  return <BaseProvider />;
}
