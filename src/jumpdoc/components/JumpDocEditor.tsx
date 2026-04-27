/**
 * JumpDocEditor — left-panel assembler for the JumpDoc editor.
 *
 * Renders one section per non-singleLine origin category and one per purchase subtype,
 * plus the static Drawbacks and Scenarios sections.
 *
 * Layout:
 *   #jumpdoc-editor-outer  — relative positioned outer column (publish modal portals here)
 *     #jumpdoc-editor-panel — scrollable content area (purchase-picker modal portals here)
 *     publish button bar    — fixed below the scroll, never scrolls
 */

import { useEffect, useRef, useState } from "react";
import { Globe, Lock, EyeOff } from "lucide-react";
import { BasicsSection } from "./BasicsSection";
import { OriginCategorySection } from "./OriginsSection";
import { PurchaseSubtypeSection } from "./PurchasesSection";
import { CompanionsSection } from "./CompanionsSection";
import { DrawbacksSection } from "./DrawbacksSection";
import { ScenariosSection } from "./ScenariosSection";
import { PublishModal } from "./PublishModal";
import { TrustedUnpublishModal } from "./TrustedUnpublishModal";
import type { SectionSharedProps } from "./sectionTypes";
import {
  useJumpDocNonSingleLineOriginCategoryIds,
  useJumpDocPurchaseSubtypeIdsSorted,
} from "@/jumpdoc/state/hooks";
import { useJumpDocMetaStore, useJumpDocMeta } from "@/jumpdoc/state/JumpDocMetaStore";
import { useJumpDoc } from "@/jumpdoc/state/hooks";
import { publishJumpDoc, sendModeratorNotification } from "@/api/jumpdocs";
import { TID } from "@/chain/data/types";

type JumpDocEditorProps = SectionSharedProps<TID> & {
  onScrollKeyConsumed: () => void;
  /** When set, forces the matching section open and all others closed. */
  activeSectionKey: string | null;
  /** Increments on every overlay click; forces the matched section open even if key didn't change. */
  activeSectionNonce: number;
  /** Firebase user for the publish action — passed from the route. */
  firebaseUser: { getIdToken: () => Promise<string> } | null;
  /** Overrides the outer div's sizing/visibility classes (default: "w-5/12 shrink-0"). */
  className?: string;
  /** When set, shows a mobile-only "Show PDF" button at the top of the panel. */
  onShowPdf?: () => void;
  /** True when the current user is a trusted editor (not the owner). */
  isTrustedEditor?: boolean;
  /** Public UID of the doc — required for moderator notifications. */
  docPublicUid?: string;
};

export function JumpDocEditor({
  onAddBoundsRequest,
  addBoundsTarget,
  registerRef,
  activeScrollKey,
  activeSectionKey,
  activeSectionNonce,
  firebaseUser,
  className,
  onShowPdf,
  isTrustedEditor,
  docPublicUid,
}: JumpDocEditorProps) {
  const shared: SectionSharedProps<TID> = {
    onAddBoundsRequest,
    addBoundsTarget,
    registerRef,
    activeScrollKey,
  };

  const originCatIds = useJumpDocNonSingleLineOriginCategoryIds();
  const subtypeIds = useJumpDocPurchaseSubtypeIdsSorted();
  const { published, nsfw, docMongoId, attributes, imageId } = useJumpDocMeta();
  const doc = useJumpDoc();
  const isElectron = import.meta.env.VITE_PLATFORM === "electron";

  const [showPublishModal, setShowPublishModal] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [showUnpublishModal, setShowUnpublishModal] = useState(false);

  const basicsSection = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (activeScrollKey == "basics")
        basicsSection.current &&
          basicsSection.current.scrollIntoView({
            behavior: "smooth",
            block: "center",
            container: "nearest",
          } as ScrollIntoViewOptions);
    });
  }, [activeSectionNonce, activeScrollKey]);

  async function handleUnpublish() {
    if (unpublishing || !firebaseUser) return;
    if (isTrustedEditor) { setShowUnpublishModal(true); return; }
    setUnpublishing(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const result = await publishJumpDoc({
        data: { docMongoId, idToken, published: false, nsfw, attributes, imageId },
      });
      if (result.status === "ok") {
        useJumpDocMetaStore.getState().setPublished(false);
      }
    } finally {
      setUnpublishing(false);
    }
  }

  async function handleTrustedUnpublish(rationale: string) {
    if (!firebaseUser || !docPublicUid) return;
    setUnpublishing(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const result = await publishJumpDoc({
        data: { docMongoId, idToken, published: false, nsfw, attributes, imageId },
      });
      if (result.status === "ok") {
        useJumpDocMetaStore.getState().setPublished(false);
        const docName = doc?.name ?? "Unknown";
        const content = `Your ${docName} jumpdoc conversion has been unpublished.\n\n**Why was it removed?**\n${rationale}`;
        await sendModeratorNotification({ data: { publicUid: docPublicUid, idToken, content } });
        setShowUnpublishModal(false);
      }
    } finally {
      setUnpublishing(false);
    }
  }

  // When activeSectionKey is set, force the matching section open and all others closed.
  const sectionOpen = (key: string) =>
    activeSectionKey !== null
      ? activeSectionKey === key || (activeSectionKey.startsWith("freeform-") && key == "basics")
      : false;

  // Per-section nonce: only the matching section sees the changing counter.
  const sectionNonce = (key: string): number | undefined =>
    activeSectionKey === key || (activeSectionKey?.startsWith("freeform-") && key == "basics")
      ? activeSectionNonce
      : undefined;

  return (
    <div
      id="jumpdoc-editor-outer"
      className={`relative flex flex-col border-r border-edge bg-canvas ${className ?? "w-5/12 shrink-0"}`}
    >
      {onShowPdf && (
        <div className="md:hidden shrink-0 flex items-center justify-end px-2 py-1 border-b border-edge bg-surface">
          <button
            type="button"
            onClick={onShowPdf}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-muted hover:text-ink transition-colors"
          >
            PDF →
          </button>
        </div>
      )}
      {/* Scrollable content */}
      <div id="jumpdoc-editor-panel" className="relative flex-1 flex flex-col overflow-y-auto">
        <div className="flex flex-col gap-2 p-2">
          <div ref={basicsSection}>
            <BasicsSection
              open={sectionOpen(`basics`)}
              forceOpenNonce={sectionNonce(`basics`)}
              originCat={
                activeSectionKey === null ? undefined : (+activeSectionKey.slice(9) as any)
              }
              onAddBoundsRequest={onAddBoundsRequest}
              addBoundsTarget={addBoundsTarget}
            />
          </div>

          {originCatIds.length > 0 && (
            <p className="text-sm font-semibold text-muted uppercase tracking-widest text-center">
              Origin & Insertation
            </p>
          )}
          {originCatIds.map((catId) => (
            <OriginCategorySection
              key={catId as number}
              catId={catId}
              open={sectionOpen(`origin-${catId}`)}
              forceOpenNonce={sectionNonce(`origin-${catId}`)}
              {...shared}
            />
          ))}

          <p className="text-sm font-semibold text-muted uppercase tracking-widest text-center">
            Perks, Items, & Companions
          </p>
          {subtypeIds.map((subtypeId) => (
            <PurchaseSubtypeSection
              key={subtypeId}
              subtypeId={subtypeId}
              open={sectionOpen(`purchase-${subtypeId}`)}
              forceOpenNonce={sectionNonce(`purchase-${subtypeId}`)}
              {...shared}
            />
          ))}
          <CompanionsSection
            open={sectionOpen("companion")}
            forceOpenNonce={sectionNonce("companion")}
            {...shared}
          />

          <p className="text-sm font-semibold text-muted uppercase tracking-widest text-center">
            Drawbacks & Scenarios
          </p>
          <DrawbacksSection
            open={sectionOpen("drawback")}
            forceOpenNonce={sectionNonce("drawback")}
            {...shared}
          />
          <ScenariosSection
            open={sectionOpen("scenario")}
            forceOpenNonce={sectionNonce("scenario")}
            {...shared}
          />
        </div>
      </div>

      {/* Overlay portal target — sits outside the scroll container so modals
          portalled here don't cause the panel to scroll. Covers the full editor
          column via absolute inset-0 on the already-relative outer wrapper. */}
      <div id="jumpdoc-editor-overlay" className="absolute inset-0 z-50 pointer-events-none" />

      {/* Fixed publish bar — never scrolls */}
      <div className="shrink-0 border-t border-edge px-3 py-2.5 bg-canvas">
        {published ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowPublishModal(true)}
              className="flex items-center justify-center gap-2 flex-1 py-1.5 rounded text-sm font-medium transition-colors border bg-accent2-tint text-accent2 border-accent2/40 hover:bg-accent2/20"
            >
              <Globe size={13} />
              Edit Metadata
            </button>
            {!isElectron && (
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={unpublishing}
                title="Unpublish"
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors border border-edge text-muted hover:text-danger hover:border-danger/40 disabled:opacity-40"
              >
                <EyeOff size={13} />
                Unpublish
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowPublishModal(true)}
            className="flex items-center justify-center gap-2 w-full py-1.5 rounded text-sm font-medium transition-colors border bg-surface text-muted border-edge hover:text-ink hover:border-trim"
          >
            <Lock size={13} />
            Publish
          </button>
        )}
      </div>

      {showPublishModal && (
        <PublishModal
          firebaseUser={firebaseUser}
          onClose={() => setShowPublishModal(false)}
          isTrustedEditor={isTrustedEditor}
          docPublicUid={docPublicUid}
        />
      )}
      {showUnpublishModal && (
        <TrustedUnpublishModal
          docName={doc?.name ?? ""}
          saving={unpublishing}
          onClose={() => setShowUnpublishModal(false)}
          onSubmit={handleTrustedUnpublish}
        />
      )}
    </div>
  );
}
