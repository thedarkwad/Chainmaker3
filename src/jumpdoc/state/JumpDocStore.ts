import type { JumpDoc } from "@/chain/data/JumpDoc";
import { createDocStore } from "@/shared/state/createDocStore";

const { useStore, createTrackedAction, createPatch } = createDocStore<JumpDoc>();

export { useStore as useJumpDocStore, createTrackedAction as createJumpDocTrackedAction, createPatch as createJumpDocPatch };
