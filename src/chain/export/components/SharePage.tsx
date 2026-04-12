import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { useExportChainSummary, useExportSnapshot } from "@/chain/state/hooks";
import { buildExportIR } from "../buildExportIR";
import { buildPurchaseListIR } from "../buildPurchaseListIR";
import { renderMarkdown } from "../renderMarkdown";
import { renderBBCode } from "../renderBBCode";
import { renderPurchaseListMarkdown } from "../renderPurchaseListMarkdown";
import { renderPurchaseListBBCode } from "../renderPurchaseListBBCode";
import {
  DEFAULT_PURCHASE_LIST_OPTIONS,
  DEFAULT_SECTIONS,
  type ExportFormat,
  type ExportIR,
  type ExportOptions,
  type ExportScope,
  type IRPurchaseListExport,
  type PdfColorTheme,
  type PdfFont,
  type PdfWorkerInput,
  type PurchaseListOptions,
} from "../types";
import { resolveAppThemePalette } from "../resolveAppTheme";
import { ScopePanel } from "./ScopePanel";
import { CustomizationPanel } from "./CustomizationPanel";
import { PurchaseListOptionsPanel } from "./PurchaseListOptionsPanel";
import { TextPreviewPanel } from "./TextPreviewPanel";
import { PdfPreviewPanel } from "./PdfPreviewPanel";

type GeneratedExport =
  | { kind: "chain"; ir: ExportIR; options: ExportOptions }
  | {
      kind: "purchase-list";
      ir: IRPurchaseListExport;
      plOptions: PurchaseListOptions;
      pdfColorTheme: PdfColorTheme;
      pdfFont: PdfFont;
      resolvedAppThemePalette?: import("../types").ResolvedColorPalette;
    };

export function SharePage() {
  const summary = useExportChainSummary();
  const snapshot = useExportSnapshot();

  // ── State ──
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const [scope, setScope] = useState<ExportScope>({ kind: "chain" });
  const [characterId, setCharacterId] = useState(() => summary.characters[0]?.id ?? (0 as never));
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [pdfColorTheme, setPdfColorTheme] = useState<PdfColorTheme>("app-theme");
  const [pdfFont, setPdfFont] = useState<PdfFont>("sans-serif");
  const [purchaseListOptions, setPurchaseListOptions] = useState<PurchaseListOptions>(
    DEFAULT_PURCHASE_LIST_OPTIONS,
  );
  const [generated, setGenerated] = useState<GeneratedExport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [mobileTab, setMobileTab] = useState<"options" | "preview">("options");

  const availableSupplements = useMemo(() => {
    const { chain } = snapshot;
    if (!chain) return [];
    const jumpIds =
      scope.kind === "chain"
        ? chain.jumpList
        : scope.kind === "jump"
          ? chain.jumpList.filter((jId) => jId === scope.jumpId)
          : [];
    const names: string[] = [];
    const seen = new Set<string>();
    for (const jumpId of jumpIds) {
      const jumpsO = chain.jumps.O as Record<
        number,
        (typeof chain.jumps.O)[keyof typeof chain.jumps.O]
      >;
      const jump = jumpsO[jumpId as unknown as number];
      if (!jump?.useSupplements) continue;
      const charPurchases = (
        jump.supplementPurchases as Record<number, Record<number, unknown[]>> | undefined
      )?.[characterId as unknown as number];
      if (!charPurchases) continue;
      const supplementsO = chain.supplements.O as Record<
        number,
        (typeof chain.supplements.O)[keyof typeof chain.supplements.O]
      >;
      for (const [suppIdStr, purchaseIds] of Object.entries(charPurchases)) {
        if (!purchaseIds || purchaseIds.length === 0) continue;
        const supp = supplementsO[Number(suppIdStr)];
        if (!supp?.name || seen.has(supp.name)) continue;
        seen.add(supp.name);
        names.push(supp.name);
      }
    }
    return names;
  }, [snapshot, scope, characterId]);

  const isPurchaseList = scope.kind === "purchase-list";

  function handleGenerate() {
    const { chain, calculatedData } = snapshot;
    if (!chain) return;
    setGenerating(true);
    // Resolve CSS vars on the main thread before the worker runs (worker has no DOM access).
    const resolvedAppThemePalette = pdfColorTheme === "app-theme" ? resolveAppThemePalette() : undefined;
    setTimeout(() => {
      try {
        if (isPurchaseList) {
          const ir = buildPurchaseListIR(chain, calculatedData, characterId, purchaseListOptions);
          setGenerated({
            kind: "purchase-list",
            ir,
            plOptions: purchaseListOptions,
            pdfColorTheme,
            pdfFont,
            resolvedAppThemePalette,
          });
        } else {
          const options: ExportOptions = { scope, characterId, sections, pdfColorTheme, pdfFont, resolvedAppThemePalette };
          const ir = buildExportIR(chain, calculatedData, options);
          setGenerated({ kind: "chain", ir, options });
        }
      } finally {
        setGenerating(false);
        setMobileTab("preview");
      }
    }, 0);
  }

  // ── Derived output ──
  const textOutput = (() => {
    if (!generated) return null;
    if (generated.kind === "chain") {
      if (format === "markdown") return renderMarkdown(generated.ir, generated.options.sections);
      if (format === "bbcode") return renderBBCode(generated.ir, generated.options.sections);
    } else {
      if (format === "markdown") return renderPurchaseListMarkdown(generated.ir);
      if (format === "bbcode") return renderPurchaseListBBCode(generated.ir);
    }
    return null;
  })();

  const pdfInput = useMemo((): PdfWorkerInput | null => {
    if (!generated) return null;
    if (generated.kind === "chain") {
      return { kind: "chain", ir: generated.ir, options: generated.options };
    }
    return {
      kind: "purchase-list",
      ir: generated.ir,
      pdfColorTheme: generated.pdfColorTheme,
      pdfFont: generated.pdfFont,
      resolvedAppThemePalette: generated.resolvedAppThemePalette,
    };
  }, [generated]);

  const filename = (() => {
    const base = (summary.chainName || "chain").replace(/[^a-zA-Z0-9_-]/g, "_");
    const suffix =
      isPurchaseList && generated?.kind === "purchase-list"
        ? `_${generated.ir.contentLabel.toLowerCase().replace(/ & /g, "_and_").replace(/\s+/g, "_")}`
        : "";
    if (format === "markdown") return `${base}${suffix}.md`;
    if (format === "bbcode") return `${base}${suffix}.txt`;
    return `${base}${suffix}.pdf`;
  })();

  return (
    <div className="flex flex-col sm:flex-row h-full min-h-0">
      {/* ── Mobile tab bar (hidden on sm+) ── */}
      <div className="flex sm:hidden shrink-0 border-b border-edge bg-surface">
        <button
          type="button"
          onClick={() => setMobileTab("options")}
          className={`flex-1 py-2 text-sm font-semibold transition-colors ${
            mobileTab === "options" ? "text-accent border-b-2 border-accent" : "text-muted"
          }`}
        >
          Options
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("preview")}
          className={`flex-1 py-2 text-sm font-semibold transition-colors ${
            mobileTab === "preview" ? "text-accent border-b-2 border-accent" : "text-muted"
          }`}
        >
          Preview
        </button>
      </div>

      {/* ── Left panel (options) ── */}
      <div
        className={`${mobileTab === "preview" ? "hidden sm:flex" : "flex"} sm:w-70 sm:shrink-0 flex-col gap-4 overflow-y-auto p-4 sm:border-r border-edge bg-surface`}
      >
        {/* Format tabs */}
        <div className="flex flex-col gap-1 shrink-0 sm:items-stretch">
          {(["markdown", "bbcode", "pdf"] as ExportFormat[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFormat(f);
                setGenerated(null);
              }}
              className={`px-3 py-1 text-sm rounded border transition-colors ${
                format === f
                  ? "bg-accent text-white border-accent font-semibold"
                  : "bg-surface text-ink border-edge hover:bg-tint"
              }`}
            >
              {f === "markdown"
                ? "Markdown (Reddit)"
                : f === "bbcode"
                  ? "BBCode (SpaceBattles)"
                  : "PDF"}
            </button>
          ))}
        </div>

        <ScopePanel
          jumps={summary.jumps}
          characters={summary.characters}
          scope={scope}
          characterId={characterId}
          onScopeChange={setScope}
          onCharacterChange={setCharacterId}
        />

        {isPurchaseList ? (
          <PurchaseListOptionsPanel
            options={purchaseListOptions}
            onChange={setPurchaseListOptions}
          />
        ) : (
          <CustomizationPanel
            sections={sections}
            pdfColorTheme={pdfColorTheme}
            pdfFont={pdfFont}
            format={format}
            availableSupplements={availableSupplements}
            onSectionsChange={setSections}
            onColorThemeChange={setPdfColorTheme}
            onFontChange={setPdfFont}
          />
        )}

        {/* PDF theme/font for purchase-list mode */}
        {isPurchaseList && format === "pdf" && (
          <div className="flex flex-col gap-4">
            <section>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Color</p>
              <select
                value={pdfColorTheme}
                onChange={(e) => setPdfColorTheme(e.target.value as PdfColorTheme)}
                className="w-full text-sm rounded border border-edge bg-surface px-1.5 py-0.5"
              >
                {(
                  [
                    { value: "app-theme", label: "App Theme" },
                    { value: "paper", label: "Paper" },
                    { value: "black-and-white", label: "Black & White" },
                  ] as { value: PdfColorTheme; label: string }[]
                ).map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </section>
            <section>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Font</p>
              <select
                value={pdfFont}
                onChange={(e) => setPdfFont(e.target.value as PdfFont)}
                className="w-full text-sm rounded border border-edge bg-surface px-1.5 py-0.5"
              >
                {(
                  [
                    { value: "sans-serif", label: "Sans-Serif" },
                    { value: "serif", label: "Serif" },
                    { value: "mono", label: "Mono" },
                  ] as { value: PdfFont; label: string }[]
                ).map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </section>
          </div>
        )}

        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center justify-center gap-2 w-full py-2 rounded bg-accent text-white text-sm font-semibold hover:bg-accent/80 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={generating ? "animate-spin" : ""} />
          {generating ? "Generating…" : "Generate Preview"}
        </button>
      </div>

      {/* ── Right panel (preview) ── */}
      <div
        className={`${mobileTab === "options" ? "hidden sm:flex" : "flex"} flex-1 min-w-0 flex-col p-4 gap-3`}
      >
        {/* Preview area */}
        <div className="flex-1 min-h-0">
          {!generated ? (
            <div className="flex h-full items-center justify-center text-sm text-ghost italic">
              Click "Generate Preview" to render the export.
            </div>
          ) : format === "pdf" && pdfInput ? (
            <PdfPreviewPanel data={pdfInput} filename={filename} />
          ) : textOutput !== null ? (
            <TextPreviewPanel text={textOutput} filename={filename} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
