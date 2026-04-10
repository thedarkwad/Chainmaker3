import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useContext, useEffect, useRef } from "react";
import { toast } from "react-toastify";

import { loadJumpDoc } from "@/api/jumpdocs";
import { useCurrentUser } from "@/app/state/auth";
import type { JumpDoc } from "@/chain/data/JumpDoc";
import { useAddJumpFromDoc, useChain } from "@/chain/state/hooks";
import { useChainStore } from "@/chain/state/Store";
import { ChainSaveCtx } from "@/routes/chain/$chainId";

export const Route = createFileRoute("/chain/$chainId/add-doc")({
  component: AddDocToChain,
  validateSearch: (search: Record<string, unknown>) => ({
    doc: typeof search.doc === "string" ? search.doc : "",
  }),
});

// System-initiated — waits for the chain to be loaded by the parent layout,
// adds the specified JumpDoc, saves immediately, then redirects to the new jump.
function AddDocToChain() {
  const { chainId } = Route.useParams();
  const { doc: docPublicUid } = Route.useSearch();
  const chain = useChain();
  const addJumpFromDoc = useAddJumpFromDoc();
  const save = useContext(ChainSaveCtx);
  const navigate = useNavigate();
  const { firebaseUser, loading: authLoading } = useCurrentUser();
  const hasRun = useRef(false);

  useEffect(() => {
    if (!chain || authLoading || !docPublicUid || hasRun.current) return;
    hasRun.current = true;

    (async () => {
      try {
        const idToken = firebaseUser ? await firebaseUser.getIdToken() : undefined;
        const docResult = await loadJumpDoc({ data: { publicUid: docPublicUid, idToken } });

        const jumpId = addJumpFromDoc(docResult.contents as JumpDoc, docPublicUid);
        await save();

        const chainState = useChainStore.getState().chain!;
        const firstPrimaryCharId = chainState.characterList
          .map((id) => chainState.characters.O[id])
          .find((c) => c?.primary)?.id;

        if (firstPrimaryCharId != null) {
          navigate({
            to: "/chain/$chainId/char/$charId/jump/$jumpId/",
            params: { chainId, charId: String(firstPrimaryCharId), jumpId: String(jumpId) },
            replace: true,
          });
        } else {
          navigate({ to: "/chain/$chainId", params: { chainId }, replace: true });
        }
      } catch {
        toast.error("Failed to add jumpdoc to chain.");
        navigate({ to: "/chain/$chainId", params: { chainId }, replace: true });
      }
    })();
  }, [chain, authLoading]);

  return (
    <div className="flex h-full items-center justify-center gap-2 text-muted">
      <Loader2 size={16} className="animate-spin" />
      <span className="text-sm">Adding jump…</span>
    </div>
  );
}
