/**
 * PdfViewer — renders a PDF via pdfjs-dist with interactive rect overlays.
 *
 * - All pages stacked vertically in a scrollable container.
 * - SVG overlay per page shows bounds rects colored by template type.
 * - Drawing mode: drag to create a new rect when a tool is active.
 * - Hold Ctrl/⌘ to reveal the text layer.
 * - Exposes scrollToBound() via ref.
 *
 * Zoom is applied as a CSS transform (no canvas re-render on zoom change).
 */

import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
} from "react";
import "pdfjs-dist/web/pdf_viewer.css";

import { ChevronDown, MousePointer2, Plus } from "lucide-react";
import type { ToolDefinition } from "@/jumpdoc/state/hooks";
import type { ToolType } from "./toolTypes";
import type { PageRect } from "@/chain/data/JumpDoc";
import {
  usePdfRenderer,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
  RENDER_SCALE,
  PAGE_GAP,
} from "@/ui/usePdfRenderer";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type BoundedTemplate = {
  id: number;
  type: ToolType;
  name: string;
  bounds: PageRect[];
};

export type PdfViewerProps = {
  url: string;
  templates: BoundedTemplate[];
  activeTool: ToolType | null;
  addBoundsTarget: { type: ToolType; id: number } | null;
  tools: ToolDefinition[];
  toolColors: Record<string, string>;
  onDraw: (rects: PageRect[], text: string) => void;
  onClickTemplate: (type: ToolType, id: number) => void;
  onToolChange: (tool: ToolType | null) => void;
  /** When set, shows a mobile-only "← Cards" button in the toolbar. */
  onShowCards?: () => void;
};

export type PdfViewerHandle = {
  scrollToBound: (rect: PageRect) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal state types
// ─────────────────────────────────────────────────────────────────────────────

type DrawState = {
  startPage: number;
  startX: number;
  startY: number;
  currPage: number;
  currX: number;
  currY: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// PdfPageOverlay — memoized SVG overlay + mouse-capture layer for one page.
// Custom equality avoids rerenders when bounds/names are structurally unchanged.
// ─────────────────────────────────────────────────────────────────────────────

type PdfPageOverlayProps = {
  pageIdx: number;
  pageInfo: { width: number; height: number };
  pageTemplates: BoundedTemplate[];
  toolColors: Record<string, string>;
  addBoundsTarget: { type: ToolType; id: number } | null;
  activeTool: ToolType | null;
  drRect: { x: number; y: number; w: number; h: number } | null;
  isDrawingMode: boolean;
  ctrlHeld: boolean;
  onClickTemplate: (type: ToolType, id: number) => void;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>, pageIdx: number) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>, pageIdx: number) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>, pageIdx: number) => void;
};

const PdfPageOverlay = memo(
  function PdfPageOverlay({
    pageIdx,
    pageInfo,
    pageTemplates,
    toolColors,
    addBoundsTarget,
    activeTool,
    drRect,
    isDrawingMode,
    ctrlHeld,
    onClickTemplate,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }: PdfPageOverlayProps) {
    return (
      <>
        {!ctrlHeld && (
          <svg
            className="absolute inset-0"
            width={pageInfo.width}
            height={pageInfo.height}
            style={{ pointerEvents: "none" }}
          >
            {pageTemplates.map((tmpl) =>
              tmpl.bounds
                .filter((b) => b.page === pageIdx)
                .map((b, bi) => {
                  const bx = b.x * pageInfo.width;
                  const by = b.y * pageInfo.height;
                  const bw = b.width * pageInfo.width;
                  const bh = b.height * pageInfo.height;
                  const color = toolColors[tmpl.type] ?? "#888";
                  const isTarget =
                    addBoundsTarget?.id === tmpl.id && addBoundsTarget.type === tmpl.type;
                  return (
                    <g
                      key={`${tmpl.type}-${tmpl.id}-${bi}`}
                      style={{ pointerEvents: "all", cursor: "pointer" }}
                      onClick={() => onClickTemplate(tmpl.type, tmpl.id)}
                    >
                      <rect
                        x={bx}
                        y={by}
                        width={bw}
                        height={bh}
                        fill={color}
                        fillOpacity={isTarget ? 0.35 : 0.15}
                        stroke={color}
                        strokeOpacity={isTarget ? 1 : 0.6}
                        strokeWidth={isTarget ? 2 : 1.5}
                        strokeDasharray={isTarget ? "4 2" : undefined}
                      />
                      <text
                        x={bx + 3}
                        y={by + 11}
                        fontSize={10}
                        fill={color}
                        fillOpacity={0.9}
                        style={{ userSelect: "none", fontFamily: "sans-serif" }}
                      >
                        {tmpl.name.length > 22 ? tmpl.name.slice(0, 20) + "…" : tmpl.name}
                      </text>
                    </g>
                  );
                }),
            )}
            {drRect && (
              <rect
                x={drRect.x * pageInfo.width}
                y={drRect.y * pageInfo.height}
                width={drRect.w * pageInfo.width}
                height={drRect.h * pageInfo.height}
                fill="none"
                stroke={
                  activeTool
                    ? (toolColors[activeTool] ?? "#ffffff")
                    : addBoundsTarget
                      ? (toolColors[addBoundsTarget.type] ?? "#ffffff")
                      : "#ffffff"
                }
                strokeWidth={2}
                strokeDasharray="5 3"
                opacity={0.9}
              />
            )}
          </svg>
        )}
        {isDrawingMode && !ctrlHeld && (
          <div
            className="absolute inset-0"
            style={{ cursor: "crosshair", touchAction: "none" }}
            onPointerDown={(e) => onPointerDown(e, pageIdx)}
            onPointerMove={(e) => onPointerMove(e, pageIdx)}
            onPointerUp={(e) => onPointerUp(e, pageIdx)}
          />
        )}
      </>
    );
  },
  (prev, next) => {
    if (
      prev.pageInfo !== next.pageInfo ||
      prev.toolColors !== next.toolColors ||
      prev.addBoundsTarget !== next.addBoundsTarget ||
      prev.activeTool !== next.activeTool ||
      prev.drRect !== next.drRect ||
      prev.isDrawingMode !== next.isDrawingMode ||
      prev.ctrlHeld !== next.ctrlHeld ||
      prev.onClickTemplate !== next.onClickTemplate ||
      prev.onPointerDown !== next.onPointerDown ||
      prev.onPointerMove !== next.onPointerMove ||
      prev.onPointerUp !== next.onPointerUp ||
      prev.pageTemplates.length !== next.pageTemplates.length
    )
      return false;
    for (let i = 0; i < prev.pageTemplates.length; i++) {
      const p = prev.pageTemplates[i],
        n = next.pageTemplates[i];
      if (p.id !== n.id || p.type !== n.type || p.name !== n.name || p.bounds !== n.bounds)
        return false;
    }
    return true;
  },
);

export const PdfViewer = memo(
  forwardRef<PdfViewerHandle, PdfViewerProps>(function PdfViewer(
    {
      url,
      templates,
      activeTool,
      addBoundsTarget,
      tools,
      toolColors,
      onDraw,
      onClickTemplate,
      onToolChange,
      onShowCards,
    },
    ref,
  ) {
    const {
      scrollRef,
      canvasRefs,
      textLayerRefs,
      pageWrapperRefs,
      ioRef,
      pages,
      zoom,
      displayScale,
      error,
      changeZoom,
    } = usePdfRenderer({ url });

    const [ctrlHeld, setCtrlHeld] = useState(false);
    const [drawing, setDrawing] = useState<DrawState | null>(null);
    const [openGroup, setOpenGroup] = useState<string | null>(null);
    const isDrawingMode = activeTool !== null || addBoundsTarget !== null;

    // ── Ctrl/⌘ to hide overlays and enable text selection ───────────────────

    useEffect(() => {
      const down = (e: KeyboardEvent) => {
        if (e.key === "Control" || e.key === "Meta") setCtrlHeld(true);
        if (e.key === "Escape") onToolChange(null);
      };
      const up = (e: KeyboardEvent) => {
        if (e.key === "Control" || e.key === "Meta") setCtrlHeld(false);
      };
      window.addEventListener("keydown", down);
      window.addEventListener("keyup", up);
      return () => {
        window.removeEventListener("keydown", down);
        window.removeEventListener("keyup", up);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onToolChange]);

    // ── scrollToBound handle ──────────────────────────────────────────────────

    useImperativeHandle(
      ref,
      () => ({
        scrollToBound(rect: PageRect) {
          const container = scrollRef.current;
          if (!container) return;
          let offset = 0;
          for (let i = 0; i < rect.page; i++) {
            offset += (pages[i]?.height ?? 0) * displayScale + PAGE_GAP;
          }
          container.scrollTo({ top: offset, behavior: "smooth" });
        },
      }),
      [pages, displayScale],
    );

    // ── Drawing interaction ───────────────────────────────────────────────────

    const getPageCoords = useCallback(
      (e: React.PointerEvent<HTMLDivElement>, pageIdx: number): { x: number; y: number } => {
        const canvas = canvasRefs.current[pageIdx];
        if (!canvas) return { x: 0, y: 0 };
        // getBoundingClientRect() accounts for CSS transform, returning display-size bounds.
        const rect = canvas.getBoundingClientRect();
        return {
          x: (e.clientX - rect.left) / rect.width,
          y: (e.clientY - rect.top) / rect.height,
        };
      },
      [],
    );

    // ── Extract text from drawn rect using the rendered text layer ───────────

    function extractTextFromRect(pageIdx: number, rect: PageRect): string {
      const canvas = canvasRefs.current[pageIdx];
      const textContainer = textLayerRefs.current[pageIdx];
      if (!canvas || !textContainer) return "";

      // getBoundingClientRect() returns display-size bounds (accounting for CSS scale).
      const canvasBounds = canvas.getBoundingClientRect();

      const targetLeft = canvasBounds.left + rect.x * canvasBounds.width;
      const targetTop = canvasBounds.top + rect.y * canvasBounds.height;
      const targetRight = targetLeft + rect.width * canvasBounds.width;
      const targetBottom = targetTop + rect.height * canvasBounds.height;

      const items: { str: string; top: number; left: number; right: number }[] = [];

      for (const span of textContainer.querySelectorAll<HTMLElement>("span")) {
        const str = span.textContent ?? "";
        if (!str.trim()) continue;

        const sr = span.getBoundingClientRect();

        const spanMidX = sr.left + sr.width / 2;
        const spanMidY = sr.top + sr.height / 2;

        const isInside =
          spanMidX >= targetLeft &&
          spanMidX <= targetRight &&
          spanMidY >= targetTop &&
          spanMidY <= targetBottom;

        if (isInside) {
          items.push({ str, top: sr.top, left: sr.left, right: sr.right });
        }
      }

      items.sort((a, b) => {
        const dy = a.top - b.top;
        return Math.abs(dy) > 5 ? dy : a.left - b.left;
      });

      const lines: { str: string; top: number; left: number; right: number }[][] = [];
      for (const item of items) {
        const last = lines[lines.length - 1];
        if (last && Math.abs(item.top - last[0].top) <= 5) {
          last.push(item);
        } else {
          lines.push([item]);
        }
      }

      if (lines.length === 0) return "";

      const gaps = lines.slice(1).map((line, i) => line[0].top - lines[i][0].top);
      const sorted = [...gaps].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const vThreshold = median * 1.4;

      const length = Math.max(...lines.map((l) => l.at(-1)!.right - l[0].left));
      const hThreshold = length * 0.05;

      let indentsAllowed = Math.min(2, Math.floor(lines.length / 5) + 1);

      const medianLines = lines
        .map((l) => l[0].left)
        .sort()
        .slice(Math.max(1, -indentsAllowed - 1));
      const leftAligned = Math.max(...medianLines) - Math.min(...medianLines) < 5;

      return lines
        .map((line, i) => {
          const text = line
            .map((item, i) => {
              if (i == 0) return item.str;
              let hgap = line[i].left - line[i-1].right;
              if (hgap < 2)
                return item.str;
              return " " + item.str;
            })
            .join("");
          if (i === 0) return text;
          const vgap = line[0].top - lines[i - 1][0].top;
          const lgap = line[0].left - lines[i - 1][0].left;
          return (vgap > vThreshold || (leftAligned && lgap > hThreshold) ? "\n\n" : " ") + text;
        })
        .join("")
        .trim();
    }

    function buildDragRects(
      startPage: number,
      startX: number,
      startY: number,
      endPage: number,
      endX: number,
      endY: number,
    ): PageRect[] {
      const minX = Math.min(startX, endX);
      const xWidth = Math.abs(endX - startX);
      if (xWidth < 0.005) return [];

      if (startPage === endPage) {
        const h = Math.abs(endY - startY);
        if (h < 0.005) return [];
        return [{ page: startPage, x: minX, y: Math.min(startY, endY), width: xWidth, height: h }];
      }

      const [firstPage, firstY, lastPage, lastY] =
        startPage < endPage
          ? [startPage, startY, endPage, endY]
          : [endPage, endY, startPage, startY];

      const rects: PageRect[] = [];
      if (1 - firstY >= 0.005)
        rects.push({ page: firstPage, x: minX, y: firstY, width: xWidth, height: 1 - firstY });
      for (let p = firstPage + 1; p < lastPage; p++) {
        rects.push({ page: p, x: minX, y: 0, width: xWidth, height: 1 });
      }
      if (lastY >= 0.005)
        rects.push({ page: lastPage, x: minX, y: 0, width: xWidth, height: lastY });
      return rects;
    }

    const drawingRef = useRef(drawing);
    drawingRef.current = drawing;

    const handleMouseDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>, pageIdx: number) => {
        if (!isDrawingMode) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        (document.activeElement as HTMLElement | null)?.blur();
        const { x, y } = getPageCoords(e, pageIdx);
        setDrawing({
          startPage: pageIdx,
          startX: x,
          startY: y,
          currPage: pageIdx,
          currX: x,
          currY: y,
        });
      },
      [isDrawingMode, getPageCoords],
    );

    // Pointer capture means move/up events always fire on the page that started
    // the drag. Compute the actual page from clientY against page wrapper rects.
    const getActualPageIdx = useCallback((clientY: number): number => {
      const wrappers = pageWrapperRefs.current;
      for (let i = 0; i < wrappers.length; i++) {
        const wr = wrappers[i];
        if (!wr) continue;
        const r = wr.getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) return i;
      }
      // Clamp to first/last page if cursor is outside all wrappers.
      const first = wrappers[0];
      if (first && clientY < first.getBoundingClientRect().top) return 0;
      return Math.max(0, wrappers.length - 1);
    }, []);

    const handleMouseMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>, _pageIdx: number) => {
        const actualPage = getActualPageIdx(e.clientY);
        const { x, y } = getPageCoords(e, actualPage);
        setDrawing((d) => (d ? { ...d, currPage: actualPage, currX: x, currY: y } : d));
      },
      [getPageCoords, getActualPageIdx],
    );

    const handleMouseUp = useCallback(
      (e: React.PointerEvent<HTMLDivElement>, _pageIdx: number) => {
        const d = drawingRef.current;
        if (!d) return;
        const actualPage = getActualPageIdx(e.clientY);
        const { x, y } = getPageCoords(e, actualPage);
        setDrawing(null);
        const rects = buildDragRects(d.startPage, d.startX, d.startY, actualPage, x, y);
        if (rects.length === 0) return;
        const text = rects
          .map((r) => extractTextFromRect(r.page, r))
          .reduce(
            (acc, frag) =>
              acc + (acc.match(/[.?!:]$/) && frag.match(/^[A-Z]/) ? "\n\n" : " ") + frag,
            "",
          )
          .trim();
        onDraw(rects, text);
        if (e.pointerType === "touch") onToolChange(null);
      },
      [onDraw, onToolChange, getPageCoords],
    );

    // ── Render ────────────────────────────────────────────────────────────────

    const toolButtons: {
      tool: ToolType | null;
      label: string;
      group: string;
      color?: string;
      icon?: React.ReactNode;
    }[] = [
      {
        tool: null,
        label: "Pointer",
        group: "pointer",
        color: "#555",
        icon: <MousePointer2 size={13} />,
      },
      ...tools.map(({ key, label, color, group }) => ({
        tool: key,
        label,
        group,
        color,
        icon: <Plus size={11} />,
      })),
    ];

    const toolGroups: { group: string; buttons: typeof toolButtons }[] = [];
    for (const btn of toolButtons) {
      const existing = toolGroups.find((g) => g.group === btn.group);
      if (existing) existing.buttons.push(btn);
      else toolGroups.push({ group: btn.group, buttons: [btn] });
    }

    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-tint">
        {/* ── Toolbar ── */}
        <div className="shrink-0 flex flex-col items-stretch justify-center gap-x-0.5 gap-y-1 px-2 py-2 bg-surface border-b border-edge min-h-12 flex-wrap">
          <div className="grid grid-cols-[1fr_auto_1fr]">
            {onShowCards && (
              <div className="flex flex-wrap justify-self-start items-center gap-0.5">
                <button
                  type="button"
                  onClick={onShowCards}
                  className="md:hidden flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-muted hover:text-ink transition-colors shrink-0"
                >
                  ← Cards
                </button>
              </div>
            )}
            <div className="flex justify-self-center items-center shrink-0">
              <button
                onClick={() => changeZoom((z) => z - ZOOM_STEP)}
                disabled={zoom <= MIN_ZOOM}
                className="px-1.5 py-1 rounded text-xs text-muted hover:text-ink hover:bg-tint disabled:opacity-40"
              >
                −
              </button>
              <span className="text-xs text-muted w-9 text-center">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => changeZoom((z) => z + ZOOM_STEP)}
                disabled={zoom >= MAX_ZOOM}
                className="px-1.5 py-1 rounded text-xs text-muted hover:text-ink hover:bg-tint disabled:opacity-40"
              >
                +
              </button>
            </div>

            {addBoundsTarget ? (
              <span
                className="text-xs font-semibold shrink-0 justify-self-end"
                style={{ color: toolColors[addBoundsTarget.type] ?? "#888" }}
              >
                Draw a rect to add a bound
              </span>
            ) : (
              <span className="text-xs text-ghost min-w-max justify-self-end">
                Ctrl/⌘ to select text
              </span>
            )}
          </div>

          <div className="flex items-center justify-center flex-wrap">
            {toolGroups.map(({ group, buttons }, gi) => {
              const groupLabel = group.charAt(0).toUpperCase() + group.slice(1);
              const activeBtn = buttons.find((b) => b.tool === activeTool);
              const isOpen = openGroup === group;
              const isSingle = buttons.length === 1;

              const renderButton = (
                { tool, label, color, icon }: (typeof buttons)[number],
                extraOnClick?: () => void,
              ) => {
                const active = activeTool === tool;
                return (
                  <button
                    key={label}
                    title={tool ? `Draw new ${label}` : "Pointer (cancel tool)"}
                    onClick={() => {
                      onToolChange(tool);
                      extraOnClick?.();
                    }}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors shrink-0 ${
                      active
                        ? "text-surface"
                        : "text-muted hover:text-ink bg-transparent hover:bg-tint"
                    }`}
                    style={active && color ? { backgroundColor: color } : undefined}
                  >
                    {icon}
                    {label}
                  </button>
                );
              };

              return (
                <div key={group} className="flex items-center">
                  {gi > 0 && <div className="w-px self-stretch bg-edge mx-1.5 shrink-0" />}
                  {isSingle ? (
                    renderButton(buttons[0])
                  ) : (
                    <div className="relative">
                      <button
                        onClick={() => setOpenGroup(isOpen ? null : group)}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors shrink-0 ${
                          activeBtn
                            ? "text-surface"
                            : "text-muted hover:text-ink bg-transparent hover:bg-tint"
                        }`}
                        style={activeBtn?.color ? { backgroundColor: activeBtn.color } : undefined}
                      >
                        {activeBtn ? `${groupLabel} (${activeBtn.label})` : groupLabel}
                        <ChevronDown size={10} />
                      </button>
                      {isOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setOpenGroup(null)} />
                          <div className="absolute top-full left-0 z-50 mt-1 bg-surface border border-edge rounded shadow-lg p-1 flex flex-col gap-0.5 min-w-max">
                            {buttons.map((btn) => renderButton(btn, () => setOpenGroup(null)))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── PDF pages ── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-auto">
          {error && <div className="p-8 text-center text-red-400 text-sm">{error}</div>}

          {!error && pages.length === 0 && (
            <div className="p-8 text-center text-muted text-sm">Loading PDF…</div>
          )}

          <div className="flex flex-col items-center py-4 gap-4 min-w-fit">
            {pages.map((pageInfo, pageIdx) => {
              const pageTemplates = templates.filter((t) =>
                t.bounds.some((b) => b.page === pageIdx),
              );

              let drRect: { x: number; y: number; w: number; h: number } | null = null;
              if (drawing) {
                const { startPage, startX, startY, currPage, currX, currY } = drawing;
                const minX = Math.min(startX, currX);
                const xWidth = Math.abs(currX - startX);
                const [firstPage, firstY, lastPage, lastY] =
                  startPage <= currPage
                    ? [startPage, startY, currPage, currY]
                    : [currPage, currY, startPage, startY];
                if (pageIdx === firstPage && pageIdx === lastPage) {
                  drRect = {
                    x: minX,
                    y: Math.min(firstY, lastY),
                    w: xWidth,
                    h: Math.abs(lastY - firstY),
                  };
                } else if (pageIdx === firstPage) {
                  drRect = { x: minX, y: firstY, w: xWidth, h: 1 - firstY };
                } else if (pageIdx > firstPage && pageIdx < lastPage) {
                  drRect = { x: minX, y: 0, w: xWidth, h: 1 };
                } else if (pageIdx === lastPage) {
                  drRect = { x: minX, y: 0, w: xWidth, h: lastY };
                }
                if (drRect && (drRect.w < 0.005 || drRect.h < 0.005)) drRect = null;
              }

              return (
                // Outer wrapper is sized at the display dimensions (CSS scale applied).
                <div
                  key={pageIdx}
                  ref={(el) => {
                    pageWrapperRefs.current[pageIdx] = el;
                    if (el) ioRef.current?.observe(el);
                  }}
                  data-page-idx={pageIdx}
                  className="relative shadow-lg overflow-hidden"
                  style={{
                    width: pageInfo.width * displayScale,
                    height: pageInfo.height * displayScale,
                  }}
                >
                  {/* Inner content at render resolution, CSS-scaled to display size.
                      This means canvas pixels never change — only the visual size does. */}
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: pageInfo.width,
                      height: pageInfo.height,
                      transform: `scale(${displayScale})`,
                      transformOrigin: "top left",
                    }}
                  >
                    {/* PDF canvas */}
                    <canvas
                      ref={(el) => {
                        canvasRefs.current[pageIdx] = el;
                      }}
                      width={pageInfo.width}
                      height={pageInfo.height}
                      style={{ display: "block", pointerEvents: "none" }}
                    />

                    {/* Text layer — transparent text for selection/copy */}
                    <div
                      ref={(el) => {
                        textLayerRefs.current[pageIdx] = el;
                      }}
                      className={`textLayer absolute inset-0 overflow-hidden select-text ${
                        ctrlHeld ? "" : "pointer-events-none invisible"
                      }`}
                      style={{ "--total-scale-factor": RENDER_SCALE } as React.CSSProperties}
                    />

                    {/* Overlay SVG */}
                    <PdfPageOverlay
                      pageIdx={pageIdx}
                      pageInfo={pageInfo}
                      pageTemplates={pageTemplates}
                      toolColors={toolColors}
                      addBoundsTarget={addBoundsTarget}
                      activeTool={activeTool}
                      drRect={drRect}
                      isDrawingMode={isDrawingMode}
                      ctrlHeld={ctrlHeld}
                      onClickTemplate={onClickTemplate}
                      onPointerDown={handleMouseDown}
                      onPointerMove={handleMouseMove}
                      onPointerUp={handleMouseUp}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }),
);
