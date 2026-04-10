export const enum GID {
  Character,
  Jump,
  Purchase,
  AltForm,
  Supplement,
  PurchaseGroup,
  PurchaseCategory,
}

export const enum LID {
  OriginCategory,
  Currency,
  PurchaseSubtype,
}

export const enum TID {
  OriginCategory,
  Origin,
  Currency,
  PurchaseSubtype,
  Purchase,
  Companion,
  Drawback,
  Scenario,
}

export type Id<T extends LID | GID | TID> = number & { _type: T };

export type Registry<A extends LID | GID | TID, T> = {
  fId: Id<A>;
  O: {
    [P in Id<A>]: T;
  };
};

export function createId<A extends LID | GID | TID>(n: number) {
  return n as Id<A>;
}

export function createRegistry<A extends LID | GID | TID, T>(
  obj: Record<number, T>,
): Registry<A, T> {
  return {
    O: obj,
    fId: createId<A>(Object.keys(obj).reduce((a, b) => Math.max(a, Number(b)), 0) + 1),
  };
}

export function registryAdd<A extends LID | GID | TID, S>(
  p: Registry<A, S>,
  e: S extends { id: Id<A> } ? Omit<S, "id"> : S,
): Id<A> {
  const id = createId<A>(p.fId++);
  p.O[id] = { ...e, id } as S;
  return id;
}
export type Lookup<A extends LID | GID | TID, B, C = undefined> = {
  [P in Id<A>]: [C] extends [undefined]
    ? B
    : B extends LID | GID | TID
      ? {
          [Q in Id<B>]: C;
        }
      : undefined;
};

export type PartialLookup<A extends LID | GID | TID, B, C = undefined> = {
  [P in Id<A>]?: [C] extends [undefined]
    ? B
    : B extends LID | GID | TID
      ? {
          [Q in Id<B>]: C;
        }
      : undefined;
};

export type Index<A extends LID | GID | TID, B extends LID | GID | TID> = Lookup<A, Id<B>[]>;

export type PartialIndex<A extends LID | GID | TID, B extends LID | GID | TID> = PartialLookup<
  A,
  Id<B>[]
>;
