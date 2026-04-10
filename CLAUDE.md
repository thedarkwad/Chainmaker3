# ChainMaker — LLM Working Instructions

This document contains **mandatory rules** for every LLM editing this codebase.
They may only be broken with **explicit permission from the user**.

---

## Rule 0 — Simplicity first

Before adding any complexity — cancellation flags, extra refs, module-level state,
workarounds, new abstractions — ask: is this actually necessary? Reach for the
simplest change that addresses the real problem.

If a fix feels unidiomatic or requires unusual machinery, that is a signal to stop
and re-examine the problem from first principles rather than pushing forward. Do not
layer more complexity onto a broken approach.

---

## Rule 0a — Read before reasoning; act before speculating

**Never reason from memory about how external code works.** If you are uncertain
how a library, framework, or external file behaves, read the source first — grep,
read the file, check the CSS, look at the types. One tool call beats ten sentences
of speculation.

**When debugging, make a change and ask the user to test rather than narrating
uncertainty.** If you don't know which of two values is correct, pick one, apply
it, and say "try this — if it's wrong we'll try X instead." Do not write multiple
paragraphs about what might be happening before touching any code.

**More than one sentence of internal reasoning about external behavior is a red
flag.** Stop, read the actual source, then act.

---

## Rule 1 — Reading chain state

Chain state must always be accessed via:

**a) A prop** passed down from a parent that already holds the data, **or**
**b) A custom Zustand hook** (see `src/state/hooks.ts`).

Never call `useChainStore((s) => ...)` inline inside a component — write a named
hook instead. If the hook you need does not exist yet, create one in `hooks.ts`.

```ts
// ✅ correct
const currencies = useCurrencies(jumpId);

// ❌ wrong — inline selector, no reuse, no named hook
const currencies = useChainStore((s) => s.chain?.jumps.O[jumpId]?.currencies);
```

**Never call `useChain()` inside a component — not even with `useMemo`.**
`useChain()` is only for use inside `hooks.ts`. If the data you need requires
joining multiple tables or filtering across jumps, write a new named hook in
`hooks.ts` that calls `useChain` + `useMemo` internally, then call that hook
from the component. If the hook doesn't exist yet, create it.

```ts
// ✅ correct — specific hook (possibly new, created for this need)
const perkIds = useCharacterRegularPerkIds(charId);

// ✅ correct — hook encapsulates useChain + useMemo
// (in hooks.ts)
export function useCharacterRegularPerkIds(charId: Id<GID.Character>) {
  const chain = useChain();
  return useMemo(() => { /* join logic here */ }, [chain, charId]);
}

// ❌ wrong — useChain in a component, even with useMemo
function MyComponent() {
  const chain = useChain();
  const ids = useMemo(() => chain?.jumps..., [chain]);
}

// ❌ wrong — useChain in a component without any hook
function MyComponent() {
  const chain = useChain();
  const currencies = chain?.jumps.O[jumpId]?.currencies;
}
```

**Zustand selector stability:** Selectors must return a stable reference. Never
return a freshly constructed `[]` or `{}` literal — Zustand v5 uses
`useSyncExternalStore` and will loop infinitely. Use `useShallow` when you must
select multiple fields, or pre-aggregate inside the selector.

---

## Rule 2 — Writing chain state / state that must be saved

Any mutation that (a) belongs on the undo/redo stack, or (b) needs to be
persisted when the chain is saved, must go through one of:

**a) A hook action** — functions returned from a `use*` hook that call
`createTrackedAction` internally (e.g. `actions.modify(...)` from `usePurchase`).
Use this for **direct mutations** — where the user's interaction immediately
and permanently changes the chain (no separate "submit" step).

**b) `useDraft`** — for **edit-session state**: a component has a distinct
"viewing" mode and "editing" mode, and changes are committed all at once on
save. `useDraft` integrates with the UIBinding system so undo/redo entries are
properly scoped to the edit session and cleaned up on cancel.

**When to use which:**

| Situation | Pattern |
|---|---|
| Toggle, dropdown, or button that immediately changes data | Hook action (`createTrackedAction`) |
| Text field that commits on blur (no separate save) | Hook action + `BlurInput` pattern |
| Component with edit/view mode + Save/Cancel | **`useDraft`** — NEVER `useState` |
| Scenario rewards, narrative blurbs, origin entries, alt-form fields | **`useDraft`** |

**`useDraft` API quick reference:**
- `restart(value)` — call in `onEnterEdit`; sets baseline and clears UIBinding
- `sync(updater)` — untracked change; use for text/number inputs (native undo)
- `set(name, updater)` — tracked change; use for selects, add/remove operations
- `close()` — call just before committing to the store on save
- `cancel()` — call in `onCancel`; reverts to baseline

Never call `useChainStore.setState(...)` directly inside a component.
Never call `useChainStore.getState()` to read state reactively.

```ts
// ✅ correct — direct mutation via hook action
const { actions } = usePurchase(id);
actions.modify("Rename", (p) => { p.name = newName; });

// ✅ correct — edit-session via useDraft
const draft = useDraft({ text: "" });
onEnterEdit={() => draft.restart({ text: current })}
onSave={() => { draft.close(); commit(draft.state.text); }}
onCancel={() => draft.cancel()}

// ❌ wrong — useState for edit-session data; breaks undo/redo
const [localData, setLocalData] = useState(current);

// ❌ wrong — bypasses undo stack entirely
useChainStore.setState((s) => { s.chain!.purchases.O[id]!.name = newName; });
```

For new mutation needs, add a `createTrackedAction`-based action to the
relevant hook in `hooks.ts` rather than writing the mutation inline.

---

## Rule 3 — Page navigation

Use TanStack Router `useNavigate()` and `<Link>` everywhere for user-initiated
navigation — both inside and outside the chain editor.

Navigation is no longer tracked as undoable actions. Instead, each update on the
UpdateStack records the path where it was made. When undo/redo fires, the
`UndoRedoProvider` automatically navigates to the path of the update being
acted on, so the user always sees the change they just undone or redone.

**Exception — system-initiated redirects** (auth guards, post-login redirects):
Add a comment explaining that the navigation is system-initiated, not a user action.

```tsx
// ✅ correct — user navigation anywhere in the app
import { Link, useNavigate } from "@tanstack/react-router";
const navigate = useNavigate();
navigate({ to: "/chain/$chainId/char/$charId/jump/$jumpId", params });
<Link to="/chain/$chainId" params={{ chainId }}>{chain.name}</Link>

// ✅ correct — system redirect (auth guard), not user-initiated
// Auth redirects are system-initiated, not user navigation.
const navigate = useNavigate();
useEffect(() => { if (!user) navigate({ to: "/auth" }); }, [user]);
```

---

## Architecture overview

### Domain directories

| Domain | Location | Contents |
|---|---|---|
| Chain editor | `src/chain/` | `data/` (types), `state/` (store + hooks), `components/`, `conversion.ts` |
| JumpDoc editor | `src/jumpdoc/` | `state/` (store + hooks + draft), `components/` |
| App shell | `src/app/` | `components/` (AppHeader, SettingsDropdown), `state/` (localSettings) |
| Shared infrastructure | `src/shared/state/` | `UpdateStack`, `createDocStore`, `makeDraft` |
| Generic UI | `src/ui/` | Reusable presentational components (TrackedLink, EditableSection, etc.) |
| Backend services | `src/server/` | MongoDB, Firebase Admin, Backblaze B2 |
| API boundary | `src/api/` | TanStack Start `createServerFn` wrappers |
| Firebase client | `src/auth/` | Browser-side Firebase auth SDK |
| Routes | `src/routes/` | TanStack Router file-based routes |

**New domain code goes here:**
- Chain editor features → `src/chain/`
- JumpDoc editor features → `src/jumpdoc/`
- Homepage, user portal, auth UI → `src/app/`

### Chain editor layers

| Layer | Location | Purpose |
|---|---|---|
| Chain data types | `src/chain/data/` | Pure TypeScript types, no React |
| Zustand store | `src/chain/state/Store.ts` | Single source of truth for chain + undo stack |
| Tracked mutations | `src/chain/state/StoreUtilities.ts` | `createTrackedAction`, `createPatch` |
| Undo stack (shared) | `src/shared/state/UpdateStack.ts` | Patch-based and action-based undo/redo |
| Custom hooks | `src/chain/state/hooks.ts` | All chain `use*` hooks; add new hooks here |
| Draft hook | `src/chain/state/useDraft.ts` | Local edit state with undo-stack integration |
| Chain components | `src/chain/components/` | Chain-specific UI; no direct store access |

The undo/redo mechanism bridges the browser's native history (`execCommand`) and
the custom `UpdateStack` via two hidden `contentEditable` divs managed by
`UndoRedoProvider`. Do not remove or restructure those divs.

---

## Style conventions

- Tailwind utility classes only — no inline styles except for one-off values
  that Tailwind cannot express (e.g. a precise `letterSpacing`).
- Semantic color tokens from `styles.css` (`bg-surface`, `text-muted`,
  `border-edge`, `bg-accent`, etc.) — never raw color classes like `bg-gray-200`.
- Components never own layout of their *container* — margin/positioning is the
  parent's responsibility.
- No emojis unless the user asks.

---

## Rule 6 — Branded types, ID conversions, and type assertions

This codebase uses branded types for all IDs: `Id<TID.X>` and `Id<LID.X>` are
`number & { _type: X }`. Use `createId<T>(n)` to construct them.

**Never store or use a branded ID as a plain `number`.** This includes:
- Casting an `Id<X>` to `number` with `as number` or `as unknown as number`
- Typing object keys as `number` when they are indexed by a branded ID (use the branded type or `string` from `Object.entries`)
- Annotating a variable or field as `number` when it holds a branded ID (use the branded type; don't strip the brand by widening)

**Minimize `as` casts globally.** Every `as` in this codebase strips type
information and can silently hide bugs. Before writing any `as` expression, ask:
can TypeScript infer or narrow this correctly without a cast? If yes, do that
instead. Only use `as` when there is genuinely no alternative, and add a comment
explaining why. **Never use `as` to paper over a type error you don't understand.**

**Never use naked casts** (`as number`, `as unknown as number`, `createId<LID.X>(id)`
where `id` is a different branded type). These silently hide domain mismatches.

### Accessing `Lookup` and `PartialLookup` — the most common cast mistake

`Lookup<A, B>` and `PartialLookup<A, B>` are typed as `{ [P in Id<A>]?: B }`.
This means the key type IS `Id<A>` — a branded number. **You do not need any
cast to index them with an `Id<A>` value.** Just use the branded ID directly:

```ts
// Given:
//   bankDeposits: PartialLookup<GID.Character, number>
//   charId: Id<GID.Character>

// ✅ correct — no cast needed, TypeScript accepts this
const deposit = jump.bankDeposits[charId] ?? 0;
jump.bankDeposits[charId] = amount;

// ❌ wrong — as any hides the type, masks future errors
const deposit = (jump.bankDeposits as any)[charId as unknown as number] ?? 0;
(jump.bankDeposits as any)[charId as unknown as number] = amount;
```

**When TypeScript complains about indexing a `Lookup` or `PartialLookup` with
a branded ID, do NOT reach for `as any`. Instead:**
1. Check that the variable is actually the correct branded type (`Id<GID.X>`, not a plain `number`).
2. Check that the `Lookup`'s key type (`A`) matches the ID's brand (`GID.X` or `LID.X`).
3. If they match, the access is valid — TypeScript may need a minor nudge like `satisfies` or a type annotation, but never `as any`.
4. If they don't match, you have a real type mismatch — fix the logic, don't cast past it.

### Nested `Lookup<A, B, C>` — key order matters

`Lookup<A, B, C>` (three type params) means: outer key is `Id<A>`, inner key is
`Id<B>`, value is `C`. **Always read the type definition before writing loops.**
Getting the key order wrong produces a silent logic error that no cast can fix:

```ts
// Given: stipend: Lookup<LID.Currency, LID.PurchaseSubtype, number>
// Outer key = LID.Currency, inner key = LID.PurchaseSubtype

// ✅ correct — iterate currencies first, then subtypes
for (const currIdStr in stipend) {
  const currGid = createId<LID.Currency>(+currIdStr);
  const subtypeAmounts = stipend[currGid];
  for (const subtypeIdStr in subtypeAmounts) {
    const subtypeGid = createId<LID.PurchaseSubtype>(+subtypeIdStr);
    const amount = subtypeAmounts[subtypeGid];
  }
}

// ❌ wrong — iterates currencies but treats them as subtypes; wrong semantics
for (const subtypeIdStr in stipend) {
  const subtypeGid = createId<LID.PurchaseSubtype>(+subtypeIdStr); // wrong brand
  const subtypeAmounts = stipend[subtypeGid as any]; // cast hides the error
}
```

**TID vs LID:** Template IDs (`TID`) come from JumpDoc; Local IDs (`LID`) come
from the jump. These are different namespaces. Never assume a TID value equals
the correct LID value — always look up by a stable domain key (name, abbrev, etc.).

**When converting between TID and LID, write a lookup function:**

```ts
// ✅ correct — resolves by domain key, returns undefined on no match
function resolveJumpOriginCategory(
  categoryName: string,
  originCategories: Registry<LID.OriginCategory, OriginCategory> | undefined,
): Id<LID.OriginCategory> | undefined {
  for (const [idStr, cat] of Object.entries(originCategories?.O ?? {})) {
    if (cat?.name === categoryName) return createId<LID.OriginCategory>(+idStr);
  }
  return undefined;
}

// ❌ wrong — naked cast; assumes numeric spaces match across documents
function tidOriginCategoryToLid(id: Id<TID.OriginCategory>): Id<LID.OriginCategory> {
  return createId<LID.OriginCategory>(id); // DO NOT DO THIS
}

// ❌ wrong — strips branding entirely
const lid = originCategories?.O[categoryId as unknown as number];
```

**Always use existing types directly.** If a field exists on `OriginTemplate`,
pass `OriginTemplate` (or `Omit<OriginTemplate, "bounds">`) — never destructure
and re-declare the same fields under new names.

**Plan for reuse before writing UI.** When implementing a feature that will have
multiple variants (e.g. different annotation types all showing a confirmation card),
design and extract the shared component first, then build each variant on top of it.
Do not write the first variant inline and only extract later — by then markup has
already been duplicated. If an existing component almost covers the case, extend
its props rather than forking it. Never copy markup across files.


---

## Rule 4 — Legacy code

Never modify anything inside `src/chaindata_old/`. That directory contains
legacy chain-data code that is kept only for reference during data conversion.
It must not be edited, refactored, or deleted.

---

## Rule 5 — Server / backend architecture

The backend is split into three strict layers. Do not mix concerns between them.

### Layer 1 — Services (`src/server/`)

Pure server-side modules. No React, no `createServerFn`, no TanStack imports.

| File | Responsibility |
|---|---|
| `src/server/db.ts` | Mongoose schemas, models, `connectToDatabase()` |
| `src/server/auth.ts` | Firebase Admin SDK, `verifyIdToken()`, `getOrCreateUser()` |
| `src/server/storage.ts` | Backblaze B2 client, `uploadFile()`, `deleteFile()` |

**Rules for `src/server/`:**
- These files are **never imported by client code** (components, routes, hooks).
- All environment variables for DB/auth/storage are read here and nowhere else.
- Add new service helpers here; do not inline DB/auth/storage logic in API files.

### Layer 2 — API boundary (`src/api/`)

TanStack Start `createServerFn` wrappers — one file per domain (e.g.
`chains.ts`, `jumpdocs.ts`, `images.ts`, `auth.ts`). These are the only files
that `import` from `src/server/`.

**Rules for `src/api/`:**
- Each function must call `connectToDatabase()` before any DB access.
- Keep these thin: validate input, call a service helper, return a result.
- Do not put business logic here; put it in `src/server/`.

### Layer 3 — Client auth (`src/auth/client.ts`)

Firebase **client** SDK only. Imported only by browser-side code.

- `src/auth/client.ts` — exports `firebaseAuth` (Firebase client `Auth` instance).
- Never import `firebase-admin` or anything from `src/server/` in client-side code.

### Boundary rules summary

```
components / routes
      ↓  (import)
src/api/*.ts          ← createServerFn boundary (client ↔ server)
      ↓  (import, server-only)
src/server/*.ts       ← DB / Auth / Storage logic
```

- `src/server/` is never imported by anything outside `src/api/`.
- `src/api/` is never imported by `src/server/`.
- `src/auth/client.ts` is never imported by `src/server/` or `src/api/`.

### Schema rules (`src/server/db.ts`)

- Always use `{ type: X, required: true }` for required fields — never a bare type constructor.
- Use Mongoose's built-in `timestamps` option instead of manual `createdAt`/`updatedAt` fields.
- Include the hot-reload guard on all models: `mongoose.models["X"] ?? model(...)`.
- Cross-document references store the target's `_id` as a plain `String` field
  (e.g. `ownerUid` stores a `firebaseUid`, `docId` stores a document `_id`).
- Never use `type` as a sub-document field name — it conflicts with Mongoose's schema
  keyword. Use `docType`, `kind`, or a domain-specific name instead.
