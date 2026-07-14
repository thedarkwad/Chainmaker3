import { JumpDocBuildData, BuildListener } from "../../state/ViewerActionStore";
import { Chain } from "../../data/Chain";
import { JumpDoc } from "@/jumpdoc/data/JumpDoc";
import { ChainMutators } from "../types";

export function createListener(
  action: (
    build: JumpDocBuildData,
    chain: Chain,
    doc: JumpDoc,
    mutators: ChainMutators,
  ) => void,
  deps: (build: JumpDocBuildData, chain: Chain) => readonly unknown[],
): BuildListener {
  let prev: readonly unknown[] | undefined;
  return {
    condition: (build, chain) => {
      const next = deps(build, chain);
      let ret = !prev || next.some((d, i) => d !== prev?.[i]);
      prev = next;
      return ret;
    },
    action: (build, chain, doc, mutators) => {
      action(build, chain, doc, mutators);
    },
  };
}
