import { GID, Id } from "../../data/types";
import { useRemoveCharacter } from "../../state/hooks";
import { useCallback } from "react";

export function useRemoveCharactersMutator() {
  const removeCharacterFn = useRemoveCharacter();
  return useCallback(
    (ids: Id<GID.Character>[]) => {
      for (const id of ids) removeCharacterFn(id);
    },
    [removeCharacterFn],
  );
}
