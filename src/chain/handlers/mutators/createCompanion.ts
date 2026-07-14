import { GID, Id } from "../../data/types";
import { useCreateCompanion } from "../../state/hooks";
import { CompanionTemplate } from "@/jumpdoc/data/JumpDoc";
import { useCallback } from "react";

export function useCreateCompanionMutator() {
  const createCompanion = useCreateCompanion();
  return useCallback(
    ({
      template,
      name,
      gender,
      species,
    }: {
      template: CompanionTemplate;
      name: string;
      gender: string;
      species: string;
    }): Id<GID.Character> => {
      return createCompanion({
        name,
        gender,
        age: 0,
        backgroundSummary: template.name,
        backgroundDescription: template.description,
        personality: "",
        species,
      });
    },
    [createCompanion],
  );
}
