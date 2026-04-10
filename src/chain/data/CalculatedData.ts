import { GID, Id, LID, Lookup, PartialLookup } from "./types";
import { SimpleValue, Value } from "./Purchase";

export type CharacterPassportStats = {
  trueAgeYears: number;
  jumpsTaken: number;
  perkCount: number;
  itemCount: number;
  altFormCount: number;
  cpTotal: number;
  initialJumpId: Id<GID.Jump> | undefined;
  initialJumpName: string | undefined;
};

export type Budget = {
  currency: Lookup<LID.Currency, number>;
  stipends: Lookup<LID.PurchaseSubtype, LID.Currency, number>;
  remainingDiscounts: Lookup<LID.PurchaseSubtype, { value: SimpleValue; n: number }[]>;
  companionStipend: SimpleValue;
  originStipend: SimpleValue;
  drawbackCP: number;
};

export type CalculatedData = {
  jumpNumber: Lookup<GID.Jump, number>;
  jumpChunks: Id<GID.Jump>[][];

  bankBalance: Lookup<GID.Character, GID.Jump, number>;
  totalBankDeposit: Lookup<GID.Character, GID.Jump, number>;

  supplementAccess: Lookup<GID.Character, GID.Supplement, Set<number>>;
  jumpAccess: Lookup<GID.Character, Set<number>>;

  budget: Lookup<GID.Character, GID.Jump, Budget>;
  totalCostOfSubpurchases: PartialLookup<GID.Purchase, Value>;

  supplementInvestments: Lookup<GID.Character, GID.Jump, Lookup<GID.Supplement, number>>;
  companionSupplementPercentage: Lookup<
    GID.Character,
    GID.Character,
    Lookup<GID.Jump, GID.Supplement, number>
  >;
  grossSupplementStipend: Lookup<GID.Character, GID.Jump, Lookup<GID.Supplement, number>>;
  supplementBudgets: Lookup<GID.Character, GID.Jump, Lookup<GID.Supplement, number>>;

  retainedDrawbacks: Lookup<GID.Character, GID.Jump, Id<GID.Purchase>[]>;
  chainDrawbacks: Lookup<GID.Character, GID.Jump, Id<GID.Purchase>[]>;

  passportStats: Lookup<GID.Character, CharacterPassportStats>;
};
