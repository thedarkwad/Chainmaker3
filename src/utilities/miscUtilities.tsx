export function objMap<A extends keyof any, B, C>(
  obj: Record<A, B>,
  valMap: (b: B, key: A) => C,
  keyMap?: (a: A) => A,
) {
  let ret: Partial<Record<A, C>> = {};
  for (let key in obj) {
    ret[keyMap ? keyMap(key) : key] = valMap(obj[key], key);
  }
  return ret as Record<A, C>;
}

export const convertWhitespace = (s: string) =>
  s
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.length)
    .map((p) => <p>{p}</p>);

export function objFilter<A extends keyof any, B>(obj: Record<A, B>, f: (b: B, key: A) => boolean) {
  let ret: Partial<Record<A, B>> = {};
  for (let key in obj) {
    if (f(obj[key], key)) ret[key] = obj[key];
  }
  return ret;
}

export function setMap<A, B>(set: Set<A>, f: (a: A) => B): Set<B> {
  return new Set(Array.from(set).map(f));
}

export function extractObj<
  A extends keyof object,
  B extends { [c in C]?: unknown },
  C extends keyof any,
>(obj: Record<A, B>, ...fields: C[]) {
  let ret: Partial<Record<A, Partial<{ [c in C]: B[c] }>>> = {};
  for (let key in obj) {
    ret[key] = {};
    for (let field of fields) ret[key][field] = obj[key][field];
  }
  return ret as Record<A, { [c in C]: B[c] }>;
}

export function extract<B extends { [c in C]?: unknown }, C extends keyof any>(
  obj: B,
  ...fields: C[]
) {
  let ret: Partial<{ [c in C]: B[c] }> = {};
  for (let field of fields) ret[field] = obj[field];
  return ret as { [c in C]: B[c] };
}

export function reinsertElement<A>(list: A[], oIndex: number, tIndex: number): A[] {
  let ret = list.slice(0, oIndex).concat(list.slice(oIndex + 1));
  ret.splice(tIndex, 0, list[oIndex]);
  return ret;
}

export function shallowEquals<A>(a: A[], b: A[]) {
  return a.length == b.length && a.every((_, i) => a[i] == b[i]);
}

export type StripSets<T> =
  T extends Set<infer U>
    ? U[]
    : T extends (infer A)[]
      ? StripSets<A>[]
      : T extends object
        ? { [K in keyof T]: StripSets<T[K]> }
        : T;

export function stripSets<T>(input: T): StripSets<T> {
  if (input instanceof Set) return Array.from(input).map(stripSets) as StripSets<T>;
  if (Array.isArray(input)) return input.map(stripSets) as StripSets<T>;
  if (input && typeof input === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(input)) {
      result[key] = stripSets(value);
    }
    return result;
  }
  return input as StripSets<T>;
}
