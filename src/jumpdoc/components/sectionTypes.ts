/**
 * Shared prop types used across all JumpDoc section components.
 */

import { GID, Id, LID, TID } from "@/chain/data/types";
import type { ToolType } from "./toolTypes";

export type AddBoundsTarget = { type: ToolType; id: number };

export type SectionSharedProps<T extends GID | LID | TID> = {
  /** Called when the user clicks "Add Bound" on a template card. */
  onAddBoundsRequest: (type: ToolType, id: Id<T>) => void;
  /** Which template is currently waiting for a bound to be drawn. */
  addBoundsTarget: AddBoundsTarget | null;
  /** Register a DOM element so the page can scroll to it. */
  registerRef: (key: string, el: HTMLElement | null) => void;
  /** The key of the card that should be scrolled into view. */
  activeScrollKey: string | null;
};
