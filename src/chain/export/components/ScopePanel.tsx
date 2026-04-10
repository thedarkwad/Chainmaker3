import type { GID, Id } from "@/chain/data/types";
import type { ExportOptions, ExportScope } from "../types";

type JumpEntry = { id: Id<GID.Jump>; name: string; number: number };
type CharEntry = { id: Id<GID.Character>; name: string; primary: boolean };

type Props = {
  jumps: JumpEntry[];
  characters: CharEntry[];
  scope: ExportScope;
  characterId: Id<GID.Character>;
  onScopeChange: (scope: ExportScope) => void;
  onCharacterChange: (id: Id<GID.Character>) => void;
};

export function ScopePanel({
  jumps,
  characters,
  scope,
  characterId,
  onScopeChange,
  onCharacterChange,
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      {/* Scope */}
      <section>
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Scope</p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            checked={scope.kind === "chain"}
            onChange={() => onScopeChange({ kind: "chain" })}
            className="accent-accent"
          />
          Whole chain
        </label>
        <div className="mt-1.5">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              checked={scope.kind === "jump"}
              onChange={() => {
                const first = jumps[0];
                if (first) onScopeChange({ kind: "jump", jumpId: first.id });
              }}
              className="accent-accent"
            />
            Single jump
          </label>
          {scope.kind === "jump" && (
            <select
              value={scope.jumpId as unknown as number}
              onChange={(e) => {
                const id = Number(e.target.value) as Id<GID.Jump>;
                onScopeChange({ kind: "jump", jumpId: id });
              }}
              className="w-full mt-1.5 text-sm rounded border border-edge bg-surface px-1.5 py-0.5"
            >
              {jumps.map((j) => (
                <option key={j.id as unknown as number} value={j.id as unknown as number}>
                  Jump {j.number} — {j.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer mt-1.5">
          <input
            type="radio"
            checked={scope.kind === "purchase-list"}
            onChange={() => onScopeChange({ kind: "purchase-list" })}
            className="accent-accent"
          />
          Purchase list
        </label>
      </section>

      {/* Character */}
      <section>
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Character</p>
        <select
          value={characterId as unknown as number}
          onChange={(e) => onCharacterChange(Number(e.target.value) as Id<GID.Character>)}
          className="w-full text-sm rounded border border-edge bg-surface px-2 py-1"
        >
          {characters.map((c) => (
            <option key={c.id as unknown as number} value={c.id as unknown as number}>
              {c.name}{c.primary ? " (Primary)" : ""}
            </option>
          ))}
        </select>
      </section>
    </div>
  );
}
