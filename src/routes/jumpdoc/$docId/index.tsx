import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useCurrentUser } from "@/app/state/auth";
import {
  useJumpDoc,
  useAllBoundedTemplates,
  useAddBoundToOrigin,
  useAddBoundToPurchase,
  useAddBoundToDrawback,
  useAddBoundToScenario,
  useAddJumpDocOrigin,
  useAddJumpDocPurchase,
  useAddJumpDocDrawback,
  useAddJumpDocScenario,
  useJumpDocToolDefinitions,
  useAddBoundToFreeFormOption,
  useAddBoundToOriginRandom,
  useAddJumpDocCompanion,
  useAddBoundToCompanion,
  useAddBoundToExchange,
  useRemoveJumpDocOrigin,
  useRemoveJumpDocPurchase,
  useRemoveJumpDocDrawback,
  useRemoveJumpDocScenario,
  useRemoveJumpDocCompanion,
  useModifyJumpDocFreeFormOptions,
  useAddJumpDocFreeFormOption,
} from "@/jumpdoc/state/hooks";
import { PdfViewer, type PdfViewerHandle } from "@/jumpdoc/components/PdfViewer";
import { useJumpDocMeta } from "@/jumpdoc/state/JumpDocMetaStore";
import { JumpDocEditor } from "@/jumpdoc/components/JumpDocEditor";
import { OriginCategorySection } from "@/jumpdoc/components/OriginsSection";
import { PurchaseSubtypeSection } from "@/jumpdoc/components/PurchasesSection";
import { CompanionsSection } from "@/jumpdoc/components/CompanionsSection";
import { DrawbacksSection } from "@/jumpdoc/components/DrawbacksSection";
import { ScenariosSection } from "@/jumpdoc/components/ScenariosSection";
import type { ToolType } from "@/jumpdoc/components/toolTypes";
import type { PageRect } from "@/chain/data/JumpDoc";
import { createId, Id, Registry, TID } from "@/chain/data/types";
import { Currency } from "@/chain/data/Jump";

export const Route = createFileRoute("/jumpdoc/$docId/")({
  component: JumpDocPage,
});

export type ParsedEntry = {
  title: string;
  desc: string;
  currency: Id<TID.Currency>;
  amount: number;
};

const parseText: (text: string, currencies: Registry<TID.Currency, Currency>) => ParsedEntry = (
  text,
  currencies,
) => {
  // Escape abbrevs for regex
  const abbrevs = Object.entries(currencies.O).map(
    ([i, v]) => [+i, v.abbrev] as [Id<TID.Currency>, string],
  );
  const escaped = abbrevs.map(([, v]) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const abbrevGroup = escaped.length ? `(${escaped.join("|")})` : null;
  const pattern = abbrevGroup
    ? new RegExp(`(\\d+)(?:\\s*${abbrevGroup})?|\\[free\\]|\\(free\\)`, "i")
    : new RegExp(`(\\d+)|\\[free\\]|\\(free\\)`);

  let match = pattern.exec(text);

  function unwrapBrackets(matchObj: typeof match) {
    if (!matchObj) return "";

    const text = matchObj.input;
    const matchStr = matchObj[0];
    const matchStart = matchObj.index;
    const matchEnd = matchStart + matchStr.length;

    // Search backwards for the nearest opening bracket
    // We use a regex test or a simple loop to find the index
    let openIdx = -1;
    for (let i = matchStart - 1; i >= 0; i--) {
      if (["(", "[", "{"].includes(text[i])) {
        openIdx = i;
        break;
      }
    }

    // Search forwards for the nearest closing bracket
    let closeIdx = -1;
    for (let i = matchEnd; i < text.length; i++) {
      if ([")", "]", "}"].includes(text[i])) {
        closeIdx = i;
        break;
      }
    }

    // If both are found, "snipe" the brackets and everything in between
    if (openIdx !== -1 && closeIdx !== -1) {
      return text.slice(0, openIdx) + matchStr + text.slice(closeIdx + 1);
    }

    // Fallback: if no wrapping brackets were found, return original string
    return text;
  }

  if (!match || match.index > 90 || match.index <= 2) {
    let colonSplit = text.indexOf(":"),
      newLineSplit = text.indexOf("\n");
    let split =
      colonSplit < 0 || newLineSplit < 0
        ? Math.max(colonSplit, newLineSplit)
        : Math.min(colonSplit, newLineSplit);

    if (split < 0 || split > 90) split = text.slice(0, 90).lastIndexOf("- ");
    if (split < 0)
      return {
        title: "",
        desc: text.replace(/ +-|-[ ]+/g, " – ").trim(),
        currency: createId<TID.Currency>(0),
        amount: 0,
      };

    let title = text.slice(0, split).trim();
    let desc = text
      .slice(split + 1)
      .replace(/ +-|-[ ]+/g, " – ")
      .trim();
    let currency = createId<TID.Currency>(0);

    // Return early if text looks like list item
    if (match && !match[2] && +match[1] < 50 && /^\d+[\.\)]/.test(text)) {
      return {
        title: title.replace(/^\d+[\.\)]/, "").trim(),
        desc,
        currency: currency,
        amount: 0,
      };
    }

    match = pattern.exec(title);
    if (match) {
      title = unwrapBrackets(match);
      match = pattern.exec(title);
      title = title
        .slice(match!.index + match![0].length)
        .replace(/^[^a-z0-9]+/i, "")
        .trim();
      if (match![2]) {
        const found = abbrevs.find(([, v]) => v === match![2]);
        if (found) {
          currency = found[0];
        }
      }
    }
    return {
      title,
      desc,
      currency: currency,
      amount: match ? +match[1] : 0,
    };
  }

  text = unwrapBrackets(match);
  match = pattern.exec(text);

  const matchStart = match!.index;
  const matchEnd = match!.index + match![0].length;

  let title = text.slice(0, matchStart);
  let desc = text.slice(matchEnd);

  // c) strip trailing [, (, +, -, whitespace from title
  title = title
    .split("\n")
    .pop()!
    .replace(/[\[\(\+\-\s]+$/g, "")
    .trim();

  // d) strip leading non-alphanumeric from desc
  desc = desc
    .trim()
    .replace(/^[^a-zA-Z0-9]+/g, "")
    .replace(/ +-|-[ ]+/g, " – ");

  // e) find abbrev index if present
  let currency = createId<TID.Currency>(0);
  if (match![2]) {
    const found = abbrevs.find(([, v]) => v === match![2]);
    if (found) {
      currency = found[0];
    }
  }

  return {
    title,
    desc,
    currency,
    amount: Number(match?.[1] ?? 0),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

function JumpDocPage() {
  const { firebaseUser, dbUser } = useCurrentUser();
  const [activeTool, setActiveTool] = useState<ToolType | null>(null);
  const [addBoundsTarget, setAddBoundsTarget] = useState<{
    type: ToolType;
    id: number;
  } | null>(null);
  const [activeScrollKey, setActiveScrollKey] = useState<string | null>(null);
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(null);
  const [activeSectionNonce, setActiveSectionNonce] = useState(0);
  const [mobilePanel, setMobilePanel] = useState<"cards" | "pdf">("cards");
  const [mobileNewCardModal, setMobileNewCardModal] = useState<{
    type: ToolType;
    id: number;
  } | null>(null);
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse) and (max-width: 1023px)").matches);
  }, []);

  const pdfRef = useRef<PdfViewerHandle>(null);
  const editorRefs = useRef<Map<string, HTMLElement>>(new Map());

  const doc = useJumpDoc();
  const { pdfUrl, ownerUid } = useJumpDocMeta();
  const { docId } = Route.useParams();
  const isTrustedEditor = !!dbUser && ownerUid !== "" && dbUser.firebaseUid !== ownerUid && (dbUser.permissions ?? []).includes("trusted");
  const templates = useAllBoundedTemplates();
  const toolDefs = useJumpDocToolDefinitions();
  const toolColors = useMemo(() => {
    const colors: Record<string, string> = Object.fromEntries(
      toolDefs.map((t) => [t.key, t.color]),
    );
    // Freeform options share green with origins; origin-random gets violet.
    if (doc) {
      for (const [idStr, cat] of Object.entries(doc.originCategories.O)) {
        if (cat?.singleLine) colors[`freeform-${idStr}`] = "#22c55e";
      }
    }
    colors["origin-random"] = "#a78bfa";
    colors["currency-exchange"] = "#f97316";
    return colors;
  }, [toolDefs, doc?.originCategories]);

  // Bound-addition hooks
  const addBoundToOrigin = useAddBoundToOrigin();
  const addBoundToPurchase = useAddBoundToPurchase();
  const addBoundToDrawback = useAddBoundToDrawback();
  const addBoundToScenario = useAddBoundToScenario();
  const addBoundToFreeFormOption = useAddBoundToFreeFormOption();
  const addBoundToOriginRandom = useAddBoundToOriginRandom();
  const addBoundToCompanion = useAddBoundToCompanion();
  const addBoundToExchange = useAddBoundToExchange();

  // Creation hooks
  const addOrigin = useAddJumpDocOrigin();
  const addFreeFormOption = useAddJumpDocFreeFormOption();
  const addPurchase = useAddJumpDocPurchase();
  const addCompanion = useAddJumpDocCompanion();
  const addDrawback = useAddJumpDocDrawback();
  const addScenario = useAddJumpDocScenario();

  // Removal hooks (used by mobile new-card modal cancel)
  const removeOrigin = useRemoveJumpDocOrigin();
  const removePurchase = useRemoveJumpDocPurchase();
  const removeDrawback = useRemoveJumpDocDrawback();
  const removeScenario = useRemoveJumpDocScenario();
  const removeCompanion = useRemoveJumpDocCompanion();

  // ── Handle rect drawn on PDF ──────────────────────────────────────────────
  const handleDraw = useCallback(
    (rects: PageRect[], text: string) => {
      if (addBoundsTarget) {
        // Add bound to an existing template.
        const { type, id } = addBoundsTarget;
        if (type === "origin-random") addBoundToOriginRandom(id as any, rects);
        else if (type.startsWith("freeform-")) {
          const catId = Number(type.slice(9)) as any;
          addBoundToFreeFormOption(catId, id, rects);
        } else if (type.startsWith("origin-")) addBoundToOrigin(id as any, rects);
        else if (type.startsWith("purchase-")) addBoundToPurchase(id as any, rects);
        else if (type === "companion") addBoundToCompanion(id as any, rects);
        else if (type === "currency-exchange") addBoundToExchange(id, rects);
        else if (type === "drawback") addBoundToDrawback(id as any, rects);
        else if (type === "scenario") addBoundToScenario(id as any, rects);
        setAddBoundsTarget(null);
        return;
      }

      if (!activeTool) return;

      let parsed = parseText(text, doc!.currencies);

      // Create a new template with this rect as its first bound.
      let newId: number;
      if (activeTool.startsWith("origin-")) {
        const catId = Number(activeTool.slice(7)) as Id<TID.OriginCategory>;
        newId = addOrigin(rects, catId, parsed);
        setActiveScrollKey(`origin-${newId}`);
        setActiveSectionKey(activeTool);
        setActiveSectionNonce((n) => n + 1);
      } else if (activeTool.startsWith("freeform-")) {
        const catId = Number(activeTool.slice(9)) as Id<TID.OriginCategory>;
        newId = addFreeFormOption(rects, catId);
        setActiveScrollKey(`basics`);
        setActiveSectionKey(activeTool);
        setActiveSectionNonce((n) => n + 1);
      } else if (activeTool.startsWith("purchase-")) {
        const subtypeId = Number(activeTool.slice(9)) as Id<TID.PurchaseSubtype>;
        newId = addPurchase(subtypeId, rects, parsed);
        setActiveScrollKey(`purchase-${newId}`);
        setActiveSectionKey(activeTool);
        setActiveSectionNonce((n) => n + 1);
      } else if (activeTool === "companion") {
        newId = addCompanion(rects, parsed);
        setActiveScrollKey(`companion-${newId}`);
        setActiveSectionKey("companion");
        setActiveSectionNonce((n) => n + 1);
      } else if (activeTool === "drawback") {
        newId = addDrawback(rects, parsed);
        setActiveScrollKey(`drawback-${newId}`);
        setActiveSectionKey("drawback");
        setActiveSectionNonce((n) => n + 1);
      } else if (activeTool === "scenario") {
        newId = addScenario(rects, text.trim());
        setActiveScrollKey(`scenario-${newId}`);
        setActiveSectionKey("scenario");
        setActiveSectionNonce((n) => n + 1);
      } else {
        return;
      }
      if (isTouch) {
        setMobileNewCardModal({ type: activeTool, id: newId });
      } else {
        setMobilePanel("cards");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTool, addBoundsTarget, isTouch],
  );

  const handleCancelNewCard = useCallback(() => {
    if (!mobileNewCardModal) return;
    const { type, id } = mobileNewCardModal;
    if (type.startsWith("origin-")) removeOrigin(createId(id));
    else if (type.startsWith("purchase-")) removePurchase(createId(id));
    else if (type === "companion") removeCompanion(createId(id));
    else if (type === "drawback") removeDrawback(createId(id));
    else if (type === "scenario") removeScenario(createId(id));
    setMobileNewCardModal(null);
    setActiveScrollKey(null);
    setActiveSectionKey(null);
  }, [
    mobileNewCardModal,
    removeOrigin,
    removePurchase,
    removeCompanion,
    removeDrawback,
    removeScenario,
  ]);

  const handleDoneNewCard = useCallback(() => {
    setMobileNewCardModal(null);
    setActiveScrollKey(null);
    setActiveSectionKey(null);
  }, []);

  // ── Handle click on a PDF overlay rect ───────────────────────────────────

  // Ref keeps handleClickTemplate stable even as templates updates.
  const templatesRef = useRef(templates);
  templatesRef.current = templates;

  const handleClickTemplate = useCallback((type: ToolType, id: number) => {
    const baseType = type.startsWith("origin-")
      ? "origin"
      : type.startsWith("purchase-")
        ? "purchase"
        : type;
    setActiveScrollKey(`${baseType}-${id}`);
    setActiveSectionKey(type);
    setActiveSectionNonce((n) => n + 1);
    const tmpl = templatesRef.current.find((t) => t.type === type && t.id === id);
    if (tmpl && tmpl.bounds.length > 0) {
      pdfRef.current?.scrollToBound(tmpl.bounds[0]);
    }
  }, []);

  const handleShowCards = useCallback(() => setMobilePanel("cards"), []);

  // ── Register editor element refs for scroll-to ───────────────────────────

  const registerRef = useCallback((key: string, el: HTMLElement | null) => {
    if (el) editorRefs.current.set(key, el);
    else editorRefs.current.delete(key);
  }, []);

  const handleAddBoundsRequest = useCallback((type: ToolType, id: number) => {
    setAddBoundsTarget({ type, id });
  }, []);

  const handleToolChange = useCallback((tool: ToolType | null) => {
    setActiveTool(tool);
    setAddBoundsTarget(null);
  }, []);

  const handleScrollKeyConsumed = useCallback(() => {
    setActiveScrollKey(null);
    setActiveSectionKey(null);
  }, []);

  if (!doc) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">Loading…</div>
    );
  }

  const [mobileBannerDismissed, setMobileBannerDismissed] = useState(false);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {isTouch && !mobileBannerDismissed && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-amber-950/60 border-b border-amber-800/50 text-amber-200 text-xs">
          <span className="flex-1">
            The Jumpdoc editor is designed for desktop. It should function on mobile screens, but
            may be unpleasant to work with.
          </span>
          <button
            type="button"
            onClick={() => setMobileBannerDismissed(true)}
            className="shrink-0 text-amber-300 hover:text-amber-100 transition-colors px-1"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        <div
          className={`${mobilePanel === "cards" ? "flex" : "hidden"} md:flex flex-col w-full md:w-5/12 md:shrink-0 overflow-hidden`}
        >
          <JumpDocEditor
            onAddBoundsRequest={handleAddBoundsRequest}
            addBoundsTarget={addBoundsTarget}
            registerRef={registerRef}
            activeScrollKey={activeScrollKey}
            activeSectionKey={activeSectionKey}
            activeSectionNonce={activeSectionNonce}
            onScrollKeyConsumed={handleScrollKeyConsumed}
            firebaseUser={firebaseUser}
            className="flex-1 min-h-0 w-full"
            onShowPdf={() => setMobilePanel("pdf")}
            isTrustedEditor={isTrustedEditor}
            docPublicUid={docId}
          />
        </div>

        {/* Mobile new-card modal — centered overlay showing only the new card */}
        {mobileNewCardModal && (
          <div className="md:hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-h-[80vh] flex flex-col rounded-lg overflow-hidden border border-edge bg-canvas shadow-2xl">
              <div className="flex items-center px-3 py-2 border-b border-edge shrink-0">
                <button
                  type="button"
                  onClick={handleCancelNewCard}
                  className="text-sm text-muted hover:text-ink transition-colors"
                >
                  Cancel
                </button>
                <span className="flex-1 text-sm font-medium text-center text-ink">
                  New annotation
                </span>
                <button
                  type="button"
                  onClick={handleDoneNewCard}
                  className="text-sm font-medium text-accent hover:opacity-80 transition-opacity"
                >
                  Done
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {mobileNewCardModal.type.startsWith("origin-") && (
                  <OriginCategorySection
                    catId={Number(mobileNewCardModal.type.slice(7)) as any}
                    singleId={mobileNewCardModal.id}
                    onAddBoundsRequest={handleAddBoundsRequest}
                    addBoundsTarget={addBoundsTarget}
                    registerRef={registerRef}
                    activeScrollKey={activeScrollKey}
                  />
                )}
                {mobileNewCardModal.type.startsWith("purchase-") && (
                  <PurchaseSubtypeSection
                    subtypeId={Number(mobileNewCardModal.type.slice(9)) as any}
                    singleId={mobileNewCardModal.id}
                    onAddBoundsRequest={handleAddBoundsRequest}
                    addBoundsTarget={addBoundsTarget}
                    registerRef={registerRef}
                    activeScrollKey={activeScrollKey}
                  />
                )}
                {mobileNewCardModal.type === "companion" && (
                  <CompanionsSection
                    singleId={mobileNewCardModal.id}
                    onAddBoundsRequest={handleAddBoundsRequest}
                    addBoundsTarget={addBoundsTarget}
                    registerRef={registerRef}
                    activeScrollKey={activeScrollKey}
                  />
                )}
                {mobileNewCardModal.type === "drawback" && (
                  <DrawbacksSection
                    singleId={mobileNewCardModal.id}
                    onAddBoundsRequest={handleAddBoundsRequest}
                    addBoundsTarget={addBoundsTarget}
                    registerRef={registerRef}
                    activeScrollKey={activeScrollKey}
                  />
                )}
                {mobileNewCardModal.type === "scenario" && (
                  <ScenariosSection
                    singleId={mobileNewCardModal.id}
                    onAddBoundsRequest={handleAddBoundsRequest}
                    addBoundsTarget={addBoundsTarget}
                    registerRef={registerRef}
                    activeScrollKey={activeScrollKey}
                  />
                )}
              </div>
            </div>
          </div>
        )}
        <div
          className={`${mobilePanel === "pdf" ? "flex" : "hidden"} md:flex flex-1 flex-col overflow-hidden`}
        >
          <PdfViewer
            ref={pdfRef}
            url={pdfUrl ?? doc.url}
            templates={templates}
            activeTool={activeTool}
            addBoundsTarget={addBoundsTarget}
            tools={toolDefs}
            toolColors={toolColors}
            onDraw={handleDraw}
            onClickTemplate={handleClickTemplate}
            onToolChange={handleToolChange}
            onShowCards={handleShowCards}
          />
        </div>
      </div>
    </div>
  );
}
