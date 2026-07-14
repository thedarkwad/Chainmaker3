import { GID, Id } from "../../data/types";
import { setTracked } from "../../state/hooks";

export function removeCurrencyExchangeFromDoc(
  {
    templateIndex,
    oamount,
    tamount,
  }: {
    templateIndex: number;
    oamount: number;
    tamount: number;
  },
  jumpId: Id<GID.Jump>,
  charId: Id<GID.Character>,
): void {
  setTracked("Remove currency exchange", c => {
    const list = c.jumps.O[jumpId]?.currencyExchanges[charId];
    if (!list) return;
    const idx = list.findIndex(e => e.templateIndex === templateIndex);
    if (idx !== -1) {
      list[idx].oamount -= oamount;
      list[idx].tamount -= tamount;
      if (list[idx].oamount <= 0) list.splice(idx, 1);
    }
    c.budgetFlag += 1;
  });
}
