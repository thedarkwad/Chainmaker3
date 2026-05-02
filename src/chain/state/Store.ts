import { Chain } from "@/chain/data/Chain";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import UpdateStack from "@/shared/state/UpdateStack";
import { UpdateStackActions } from "./UpdateStackActions";
import { CalculatedData } from "@/chain/data/CalculatedData";

export type ChainState = {
  chain?: Chain;
  calculatedData: Partial<CalculatedData>;
  updates: UpdateStack<Chain>;
  dummyElements: [HTMLDivElement?, HTMLDivElement?];
  pendingNavigation?: string;
};

type ChainActions = { setChain: (c: Chain) => void };

type Actions = ChainActions &
  ReturnType<typeof UpdateStackActions> & {
    setDummyElement: (d: [HTMLDivElement, HTMLDivElement]) => void;
    clearPendingNavigation: () => void;
    reset: () => void;
  };

export const useChainStore = create<ChainState & Actions>()(
  subscribeWithSelector((set) => ({
    updates: new UpdateStack(),
    dummyElements: [,],
    calculatedData: {},
    ...UpdateStackActions(set),
    reset: () => set({ updates: new UpdateStack() }),
    setChain: (c) => set({ chain: c }),
    setDummyElement: (d) => set({ dummyElements: d }),
    clearPendingNavigation: () => set({ pendingNavigation: undefined }),
  })),
);
