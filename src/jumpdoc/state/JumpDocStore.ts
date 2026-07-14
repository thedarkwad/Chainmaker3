import type { JumpDoc } from "@/jumpdoc/data/JumpDoc";
import { createDocStore } from "@/shared/state/createDocStore";

const { useStore, createTrackedAction, createPatch } = createDocStore<JumpDoc>();

export { useStore as useJumpDocStore, createTrackedAction as createJumpDocTrackedAction, createPatch as createJumpDocPatch };
