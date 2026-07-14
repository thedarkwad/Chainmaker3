import { GID, Id, TID } from "../../data/types";
import { setTracked } from "../../state/hooks";
import { JumpDoc } from "@/jumpdoc/data/JumpDoc";
import { convertCurrencyId } from "../utils";

export function addCurrencyExchangeFromDoc(
  {
    templateIndex,
    oCurrency,
    tCurrency,
    oamount,
    tamount,
  }: {
    templateIndex: number;
    oCurrency: Id<TID.Currency>;
    tCurrency: Id<TID.Currency>;
    oamount: number;
    tamount: number;
  },
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
  doc: JumpDoc,
): void {
  setTracked("Add currency exchange", c => {
    const jump = c.jumps.O[jumpId];
    if (!jump) return;
    const oLid = convertCurrencyId(oCurrency, doc, jump.currencies);
    const tLid = convertCurrencyId(tCurrency, doc, jump.currencies);
    const existing = jump.currencyExchanges[charId]?.find(
      ex => ex.templateIndex === templateIndex,
    );
    if (existing) {
      existing.oamount += oamount;
      existing.tamount += tamount;
    } else {
      if (!jump.currencyExchanges[charId])
        jump.currencyExchanges[charId] = [];
      jump.currencyExchanges[charId]!.push({
        oCurrency: oLid,
        tCurrency: tLid,
        oamount,
        tamount,
        templateIndex,
      });
    }
    c.budgetFlag += 1;
  });
}
