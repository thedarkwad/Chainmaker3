import { Annotation, JumpDoc } from "@/jumpdoc/data/JumpDoc";
import { Id, GID } from "../../data/types";
import {
  AnnotationInteraction,
  JumpDocBuildData,
} from "../../state/ViewerActionStore";

export function currencyExchangeInteraction(
  ann: Annotation<"currency-exchange">,
  doc: JumpDoc,
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): AnnotationInteraction<{ count: number }> {
  const oCurrencyAbbrev = doc.currencies.O[ann.oCurrency]?.abbrev ?? "?";
  const tCurrencyAbbrev = doc.currencies.O[ann.tCurrency]?.abbrev ?? "?";

  const takenCount = (build: JumpDocBuildData) =>
    build.currencyExchanges
      .filter(e => e.templateIndex === ann.docIndex)
      .reduce((n, ex) => n + Math.floor(ex.oamount / ann.oamount), 0);

  return {
    initialize: build => ({ count: takenCount(build) }),
    error: () => undefined,
    typeName: "Currency Exchange",
    name: `Exchange - ${ann.oamount} ${oCurrencyAbbrev} → ${ann.tamount} ${tCurrencyAbbrev}`,
    description: `Trade ${ann.oamount} ${oCurrencyAbbrev} for ${ann.tamount} ${tCurrencyAbbrev}`,
    preview: ({ state, setState }) => (
      <div className="px-2 pb-2 flex items-center gap-3">
        <span className="text-xs text-muted">Times taken:</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setState({ count: Math.max(0, state.count - 1) })}
            className="w-6 h-6 flex items-center justify-center rounded border border-edge text-sm hover:bg-accent/10 transition-colors"
          >
            -
          </button>
          <span className="w-8 text-center text-sm tabular-nums">
            {state.count}
          </span>
          <button
            type="button"
            onClick={() => setState({ count: state.count + 1 })}
            className="w-6 h-6 flex items-center justify-center rounded border border-edge text-sm hover:bg-accent/10 transition-colors"
          >
            +
          </button>
        </div>
      </div>
    ),
    actions: [
      {
        name: "Apply",
        variant: "confirm",
        condition: () => true,
        execute: (build, mutators, state) => {
          const current = takenCount(build);
          const delta = state.count - current;
          if (delta > 0) {
            for (let i = 0; i < delta; i++) {
              mutators.addCurrencyExchangeFromDoc(
                {
                  templateIndex: ann.docIndex!,
                  oCurrency: ann.oCurrency,
                  tCurrency: ann.tCurrency,
                  oamount: ann.oamount,
                  tamount: ann.tamount,
                },
                jumpId,
                charId,
                doc,
              );
            }
          } else if (delta < 0) {
            for (let i = 0; i < -delta; i++) {
              mutators.removeCurrencyExchangeFromDoc(
                {
                  templateIndex: ann.docIndex!,
                  oamount: ann.oamount,
                  tamount: ann.tamount,
                },
                jumpId,
                charId,
              );
            }
          }
          if (delta !== 0)
            mutators.navigate({
              sub: "drawbacks",
              extraSearch: { exchange: "1" },
            });
          return [];
        },
      },
    ],
    forcePreview: () => true,
  };
}
