import { createFileRoute, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";

import {
  CompanionAccess,
  SupplementType,
  type ChainSupplement,
} from "@/chain/data/ChainSupplement";
import { JumpSourceType } from "@/chain/data/Jump";
import { createId, type GID, type Id } from "@/chain/data/types";
import {
  useChainSettingsConfig,
  useChainSupplement,
  useChainSupplementIds,
  useChainSupplementsConfig,
} from "@/chain/state/hooks";
import { BoolSegment, SegmentedControl } from "@/ui/SegmentedControl";
import { Checkbox } from "@/ui/Checkbox";
import { Tip } from "@/ui/Tip";

export const Route = createFileRoute("/chain/$chainId/config/supp")({
  component: SupplementsLayout,
});

// ── Numeric-enum ↔ string helpers for SegmentedControl ───────────────────────

function parseSupplementType(v: string): SupplementType {
  const n = +v;
  if (n === SupplementType.Item) return SupplementType.Item;
  if (n === SupplementType.Perk) return SupplementType.Perk;
  return SupplementType.Dual;
}

function parseCompanionAccess(v: string): CompanionAccess {
  const n = +v;
  if (n === CompanionAccess.Unavailable) return CompanionAccess.Unavailable;
  if (n === CompanionAccess.Available) return CompanionAccess.Available;
  return CompanionAccess.Imports;
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function CardLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-ghost mb-1">
      {children}
    </p>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs text-muted text-right">{children}</span>;
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`border border-edge rounded-lg bg-surface p-3 flex flex-col gap-2 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function BlurInput({
  value,
  onCommit,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "onBlur" | "value"> & {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);

  return (
    <input
      {...props}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        onCommit(local);
      }}
      className={`bg-transparent border border-edge rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent-ring ${className ?? ""}`}
    />
  );
}

function BlurNumberInput({
  value,
  onCommit,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "onBlur" | "value"> & {
  value: number;
  onCommit: (v: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(String(value));
  }, [value]);

  return (
    <input
      type="number"
      {...props}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        onCommit(+local || 0);
      }}
      className={`bg-transparent border border-edge rounded px-2 py-1 text-sm text-ink text-right focus:outline-none focus:border-accent-ring ${className ?? ""}`}
    />
  );
}

// ── Detail cards ──────────────────────────────────────────────────────────────

function IdentityCard({
  suppId,
  supplement,
  mod,
  setCompanionAccess,
  isNew,
}: {
  suppId: Id<GID.Supplement>;
  supplement: ChainSupplement;
  mod: (label: string, updater: (s: ChainSupplement) => void) => void;
  setCompanionAccess: (suppId: Id<GID.Supplement>, access: CompanionAccess) => void;
  isNew: boolean;
}) {
  return (
    <Card>
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <BlurInput
            value={supplement.name}
            onCommit={(v) =>
              mod("Rename supplement", (s) => {
                s.name = v;
              })
            }
            placeholder="Name…"
            className="w-full"
            autoFocus={isNew}
          />
        </div>
        <div className="shrink-0">
          <BlurInput
            value={supplement.currency}
            onCommit={(v) =>
              mod("Set supplement currency", (s) => {
                s.currency = v || "SP";
              })
            }
            placeholder="SP"
            className="w-14 text-center"
            title="Currency abbreviation"
          />
        </div>
      </div>

      <BlurInput
        value={supplement.source.type === JumpSourceType.URL ? supplement.source.URL : ""}
        onCommit={(v) =>
          mod("Set supplement URL", (s) => {
            s.source = v.trim()
              ? { type: JumpSourceType.URL, URL: v.trim() }
              : { type: JumpSourceType.Unknown };
          })
        }
        placeholder="https://… (optional link)"
        className="w-full text-xs"
        type="url"
      />

      <div>
        <p className="text-xs text-muted mb-0.5">Content Type</p>
        <SegmentedControl
          value={String(supplement.type)}
          onChange={(v) =>
            mod("Set supplement type", (s) => {
              s.type = parseSupplementType(v);
            })
          }
          options={[
            { value: String(SupplementType.Perk), label: "Perk" },
            { value: String(SupplementType.Item), label: "Item" },
            { value: String(SupplementType.Dual), label: "Both" },
          ]}
        />
      </div>

      <div>
        <p className="text-xs text-muted mb-0.5">
          Companion Access{" "}
          <Tip>
            Do companions get access to this supplement? Are they permanently excluded, or do they
            have to be imported in by a primary jumper?
          </Tip>
        </p>
        <SegmentedControl
          value={String(supplement.companionAccess)}
          onChange={(v) => setCompanionAccess(suppId, parseCompanionAccess(v))}
          options={[
            { value: String(CompanionAccess.Unavailable), label: "None" },
            { value: String(CompanionAccess.Available), label: "Available" },
            { value: String(CompanionAccess.Imports), label: "Imports" },
          ]}
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-sm">
        <Checkbox
          checked={supplement.enableScenarios}
          onChange={(on) =>
            mod("Toggle supplement milestones", (s) => {
              s.enableScenarios = on;
            })
          }
        />
        <span className="text-muted">Enable Milestones</span>
      </label>
    </Card>
  );
}

function BudgetCard({
  supplement,
  mod,
}: {
  supplement: ChainSupplement;
  mod: (label: string, updater: (s: ChainSupplement) => void) => void;
}) {
  return (
    <Card>
      <CardLabel>Budget</CardLabel>
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 mx-auto w-fit">
        <FieldLabel>Initial Stipend:</FieldLabel>
        <span>
          <BlurNumberInput
            value={supplement.initialStipend}
            onCommit={(v) =>
              mod("Set initial stipend", (s) => {
                s.initialStipend = v;
              })
            }
            step={50}
            min={0}
            className="w-20"
          />
          <span className="text-muted ml-1 text-sm">{supplement.currency}</span>
        </span>

        <FieldLabel>Stipend Per Jump:</FieldLabel>
        <span>
          <BlurNumberInput
            value={supplement.perJumpStipend}
            onCommit={(v) =>
              mod("Set per-jump stipend", (s) => {
                s.perJumpStipend = v;
              })
            }
            step={50}
            min={0}
            className="w-20"
          />
          <span className="text-muted ml-1 text-sm">{supplement.currency}</span>
        </span>
        <FieldLabel>Investment Ratio:</FieldLabel>
        <div className="flex items-center gap-0 border border-edge rounded text-sm overflow-hidden">
          <BlurNumberInput
            value={supplement.investmentRatio}
            onCommit={(v) =>
              mod("Set investment ratio", (s) => {
                s.investmentRatio = v;
              })
            }
            step={50}
            min={0}
            className="w-12 border-0 rounded-none px-1.5 py-1 focus:bg-accent-tint/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="px-1.5 py-1 text-muted bg-tint border-l border-edge whitespace-nowrap">
            {supplement.currency} : 100 CP
          </span>
        </div>
        <FieldLabel>Max Investment:</FieldLabel>
        <span>
          <BlurNumberInput
            value={supplement.maxInvestment}
            onCommit={(v) =>
              mod("Set max investment", (s) => {
                s.maxInvestment = Math.max(0, v);
              })
            }
            step={50}
            min={0}
            className="w-20"
          />
          <span className="text-muted ml-1 text-sm">CP</span>
        </span>
      </div>
    </Card>
  );
}

function AvailabilityCard({
  suppId,
  supplement,
  mod,
  actions,
}: {
  suppId: Id<GID.Supplement>;
  supplement: ChainSupplement;
  mod: (label: string, updater: (s: ChainSupplement) => void) => void;
  actions: ReturnType<typeof useChainSupplementsConfig>["actions"];
}) {
  const { settings } = useChainSettingsConfig();
  const minJump = settings?.startWithJumpZero ? 0 : 1;
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [pendingInitialJump, setPendingInitialJump] = useState<number | null>(null);

  const handleDurationChange = (wantsMulti: boolean) => {
    if (wantsMulti) {
      // Single → All Jumps: no data to migrate, just flip the flag.
      mod("Set supplement duration", (s) => {
        s.singleJump = false;
      });
    } else if (!supplement.singleJump) {
      // All Jumps → Single Jump: ask the user what to do with existing data.
      setShowConvertModal(true);
    }
  };

  const handleInitialJumpCommit = (v: number) => {
    const clamped = Math.max(minJump, v);
    if (clamped === supplement.initialJump) return;
    if (!supplement.singleJump) {
      // Multi-jump: show modal to pick delete / shift / cancel.
      setPendingInitialJump(clamped);
    } else {
      actions.setInitialJump(suppId, clamped);
    }
  };

  return (
    <>
      <Card>
        <CardLabel>Availability</CardLabel>
        <div className="flex flex-col items-center gap-1.5 mx-auto w-fit">
          <BoolSegment
            value={!supplement.singleJump}
            onChange={handleDurationChange}
            trueLabel="All Jumps"
            falseLabel="Single jump"
          />
          <div className="flex gap-3 items-center">
            <FieldLabel>
              <span className={supplement.singleJump ? "opacity-0" : ""}>Initial </span>Jump #:
            </FieldLabel>
            <BlurNumberInput
              value={supplement.initialJump}
              onCommit={handleInitialJumpCommit}
              step={1}
              min={minJump}
              className="w-20"
            />
          </div>
        </div>
      </Card>

      {showConvertModal && (
        <ConvertToSingleJumpModal
          jumpNumber={supplement.initialJump}
          onDelete={() => {
            actions.convertToSingleJump(suppId, "delete");
            setShowConvertModal(false);
          }}
          onShunt={() => {
            actions.convertToSingleJump(suppId, "shunt");
            setShowConvertModal(false);
          }}
          onCancel={() => setShowConvertModal(false)}
        />
      )}

      {pendingInitialJump !== null && (
        <MigrateMultiJumpStartModal
          oldJumpNumber={supplement.initialJump}
          newJumpNumber={pendingInitialJump}
          onDelete={() => {
            actions.migrateMultiJump(suppId, pendingInitialJump, "delete");
            setPendingInitialJump(null);
          }}
          onShift={() => {
            actions.migrateMultiJump(suppId, pendingInitialJump, "shift");
            setPendingInitialJump(null);
          }}
          onCancel={() => setPendingInitialJump(null)}
        />
      )}
    </>
  );
}

function ConvertToSingleJumpModal({
  jumpNumber,
  onDelete,
  onShunt,
  onCancel,
}: {
  jumpNumber: number;
  onDelete: () => void;
  onShunt: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface border border-edge rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4">
        <div>
          <p className="font-semibold text-ink text-sm">Convert to Single Jump</p>
          <p className="text-xs text-muted mt-1">
            This supplement currently has purchases and investments across multiple jumps. What
            should happen to content outside Jump&nbsp;{jumpNumber}?
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onDelete}
            className="w-full text-left px-3 py-2 rounded-lg border border-danger/40 bg-danger/10 text-sm text-danger hover:bg-danger/20 transition-colors"
          >
            <span className="font-semibold">Delete</span>
            <span className="text-danger/70">
              {" "}
              — remove all purchases and investments outside Jump&nbsp;{jumpNumber}
            </span>
          </button>
          <button
            type="button"
            onClick={onShunt}
            className="w-full text-left px-3 py-2 rounded-lg border border-edge bg-tint text-sm text-ink hover:bg-tint/70 transition-colors"
          >
            <span className="font-semibold">Move</span>
            <span className="text-muted">
              {" "}
              — consolidate everything into Jump&nbsp;{jumpNumber}
            </span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full text-left px-3 py-2 rounded-lg border border-edge text-sm text-muted hover:text-ink transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function MigrateMultiJumpStartModal({
  oldJumpNumber,
  newJumpNumber,
  onDelete,
  onShift,
  onCancel,
}: {
  oldJumpNumber: number;
  newJumpNumber: number;
  onDelete: () => void;
  onShift: () => void;
  onCancel: () => void;
}) {
  const direction = newJumpNumber > oldJumpNumber ? "forward" : "backward";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface border border-edge rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4">
        <div>
          <p className="font-semibold text-ink text-sm">Move Supplement Start</p>
          <p className="text-xs text-muted mt-1">
            Moving the start from Jump&nbsp;{oldJumpNumber} to Jump&nbsp;{newJumpNumber}. What
            should happen to existing purchases and investments?
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {direction === "forward" && (
            <button
              type="button"
              onClick={onDelete}
              className="w-full text-left px-3 py-2 rounded-lg border border-danger/40 bg-danger/10 text-sm text-danger hover:bg-danger/20 transition-colors"
            >
              <span className="font-semibold">Delete</span>
              <span className="text-danger/70">
                {" "}
                — remove purchases and investments before Jump&nbsp;{newJumpNumber}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onShift}
            className="w-full text-left px-3 py-2 rounded-lg border border-edge bg-tint text-sm text-ink hover:bg-tint/70 transition-colors"
          >
            <span className="font-semibold">Shift</span>
            <span className="text-muted">
              {" "}
              — move all content {direction} by {Math.abs(newJumpNumber - oldJumpNumber)} jump
              {Math.abs(newJumpNumber - oldJumpNumber) !== 1 ? "s" : ""} (may delete overflow)
            </span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full text-left px-3 py-2 rounded-lg border border-edge text-sm text-muted hover:text-ink transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoriesCard({
  suppId,
  supplement,
  actions,
}: {
  suppId: Id<GID.Supplement>;
  supplement: ChainSupplement;
  actions: ReturnType<typeof useChainSupplementsConfig>["actions"];
}) {
  const [activeCatId, setActiveCatId] = useState<Id<GID.PurchaseCategory> | null>(null);
  const hasPurchases =
    supplement.type === SupplementType.Perk ||
    supplement.type === SupplementType.Item ||
    supplement.type === SupplementType.Dual;

  if (!hasPurchases) return null;

  const categoryEntries = Object.entries(supplement.purchaseCategories.O) as [string, string][];

  return (
    <Card>
      <CardLabel>Purchase Categories</CardLabel>
      <div className="flex flex-wrap items-center gap-1.5">
        {categoryEntries.map(([idStr, name]) => {
          const catId = createId<GID.PurchaseCategory>(+idStr);
          const isActive = (activeCatId as number) === +idStr;
          return (
            <button
              key={idStr}
              type="button"
              onClick={() => setActiveCatId(isActive ? null : catId)}
              className={`px-2.5 py-0.5 rounded-full text-sm border transition-colors ${
                isActive
                  ? "bg-accent2-tint text-accent2 border-accent2"
                  : "bg-tint text-ink border-edge hover:border-accent2 hover:text-accent2"
              }`}
            >
              {name || <em className="opacity-60">Unnamed</em>}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            const newCatId = supplement.purchaseCategories.fId;
            actions.addCategory(suppId);
            setActiveCatId(newCatId);
          }}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-dashed border-edge text-muted hover:border-accent2 hover:text-accent2 transition-colors"
        >
          <Plus size={11} />
          Add
        </button>
      </div>
      {activeCatId !== null &&
        (() => {
          const name = supplement.purchaseCategories.O[activeCatId];
          if (name === undefined) return null;
          return (
            <div className="flex items-center gap-2 pt-1.5 border-t border-line">
              <BlurInput
                value={name}
                onCommit={(v) => actions.renameCategory(suppId, activeCatId, v)}
                placeholder="Category name…"
                className="flex-1 min-w-0"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  actions.removeCategory(suppId, activeCatId);
                  setActiveCatId(null);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-danger border border-danger/40 hover:bg-danger/10 transition-colors shrink-0"
              >
                <Trash2 size={11} />
                Delete
              </button>
            </div>
          );
        })()}
    </Card>
  );
}

// ── SupplementDetail ──────────────────────────────────────────────────────────

export function SupplementDetail({ suppId, isNew }: { suppId: Id<GID.Supplement>; isNew: boolean }) {
  const supplement = useChainSupplement(suppId);
  const { actions } = useChainSupplementsConfig();

  if (!supplement) return null;

  const mod = (label: string, updater: (s: ChainSupplement) => void) =>
    actions.modifySupplement(suppId, label, updater);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
      <div className="flex flex-col gap-2">
        <IdentityCard
          suppId={suppId}
          supplement={supplement}
          mod={mod}
          setCompanionAccess={actions.setCompanionAccess}
          isNew={isNew}
        />
        <BudgetCard supplement={supplement} mod={mod} />
      </div>
      <div className="flex flex-col gap-2">
        <AvailabilityCard suppId={suppId} supplement={supplement} mod={mod} actions={actions} />
        <CategoriesCard suppId={suppId} supplement={supplement} actions={actions} />
      </div>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

function SupplementsLayout() {
  return <Outlet />;
}

// ── Sidebar (rendered by config.tsx layout) ───────────────────────────────────

export function SupplementConfigSidebar({ chainId }: { chainId: string }) {
  const suppIds = useChainSupplementIds();
  const { actions } = useChainSupplementsConfig();
  const navigate = useNavigate();
  // Read suppId from child route params (strict: false so it works on parent routes too).
  const { suppId: suppIdStr } = useParams({ strict: false }) as { suppId?: string };
  const urlSuppId = suppIdStr !== undefined ? +suppIdStr : undefined;

  const goTo = (id: Id<GID.Supplement>, isNew = false) =>
    void navigate({
      to: "/chain/$chainId/config/supp/$suppId",
      params: { chainId, suppId: String(id as number) },
      search: isNew ? { isNew: true } : {},
    });

  const handleAdd = () => {
    const id = actions.addSupplement();
    goTo(id, true);
  };

  const handleDelete = () => {
    if (urlSuppId === undefined) return;
    const idx = suppIds.findIndex((id) => (id as number) === urlSuppId);
    actions.removeSupplement(createId<GID.Supplement>(urlSuppId));
    const next = suppIds[idx + 1] ?? suppIds[idx - 1];
    if (next) goTo(next);
    else
      void navigate({
        to: "/chain/$chainId/config/supp",
        params: { chainId },
      });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto py-2 px-2 min-h-0">
        <div className="px-1 pb-1 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ghost">
            Supplements
          </span>
        </div>

        {suppIds.length === 0 && (
          <p className="text-xs text-ghost text-center mt-2 px-2 italic">No supplements yet.</p>
        )}

        {suppIds.map((id) => (
          <SupplementSidebarItem
            key={id}
            suppId={id}
            isSelected={(id as number) === urlSuppId}
            onSelect={() => goTo(id)}
          />
        ))}
      </div>

      <div className="shrink-0 flex gap-1.5 px-2 py-2 border-t border-edge">
        <button
          type="button"
          onClick={handleAdd}
          className="flex-1 flex items-center justify-center gap-1 text-xs text-muted hover:text-ink border border-edge rounded px-2 py-1 transition-colors"
        >
          <Plus size={12} /> Add
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={urlSuppId === undefined}
          className="flex-1 flex items-center justify-center gap-1 text-xs text-muted hover:text-danger border border-edge rounded px-2 py-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-muted"
        >
          <Trash2 size={12} /> Delete
        </button>
      </div>
    </div>
  );
}

function SupplementSidebarItem({
  suppId,
  isSelected,
  onSelect,
}: {
  suppId: Id<GID.Supplement>;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const supplement = useChainSupplement(suppId);
  const name = supplement?.name || "Unnamed";

  if (isSelected) {
    return (
      <div className="rounded-xs outline outline-accent2 bg-accent2-tint text-accent2 px-3 py-1 mt-0.5 font-semibold text-sm text-center truncate">
        {name}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-center rounded-xs border border-edge bg-surface px-3 py-1 mt-0.5 text-sm font-semibold text-ink hover:text-accent2 hover:bg-accent2-tint transition-colors truncate"
    >
      {name}
    </button>
  );
}
