import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Trash2, UserCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { BlurInput, Pill, AddPill, DeleteButton } from "@/ui/FormPrimitives";
import { Tip } from "@/ui/Tip";
import { SegmentedControl, BoolSegment } from "@/ui/SegmentedControl";

import { PurchaseType } from "@/chain/data/Purchase";
import { createId, type GID, type Id } from "@/chain/data/types";
import {
  useBankSettingsConfig,
  useChainName,
  useChainPurchaseCategoryConfig,
  useChainSettingsConfig,
  useChainSupplementsConfig,
  useDisablePurchaseGroups,
  useJumpZeroChangeWouldShiftData,
} from "@/chain/state/hooks";
import { Checkbox } from "@/ui/Checkbox";
import { CollapsibleSection } from "@/ui/CollapsibleSection";
import { deleteChain, claimChain } from "@/api/chains";
import { useCurrentUser } from "@/app/state/auth";
import { removeRecentChain } from "@/app/state/recentChains";
import { useContext } from "react";
import { ChainOwnerUidCtx } from "@/routes/chain/$chainId";

export const Route = createFileRoute("/chain/$chainId/config/")({
  component: ChainSettingsPage,
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs font-semibold text-muted ${className ?? ""}`}>{children}</p>;
}


// ─────────────────────────────────────────────────────────────────────────────
// Jump Basics
// ─────────────────────────────────────────────────────────────────────────────

function JumpBasicsSection() {
  const { name, rename } = useChainName();
  const { settings, modify } = useChainSettingsConfig();
  const { actions: suppActions } = useChainSupplementsConfig();
  const jumpZeroShiftData = useJumpZeroChangeWouldShiftData();
  const disablePurchaseGroups = useDisablePurchaseGroups();
  const [pendingJumpZero, setPendingJumpZero] = useState<boolean | null>(null);

  const handleJumpZeroChange = (on: boolean) => {
    const wouldAffect = on ? jumpZeroShiftData.enabling : jumpZeroShiftData.disabling;
    if (wouldAffect) {
      setPendingJumpZero(on);
    } else {
      suppActions.shiftAllSupplementsForJumpZeroChange(on);
    }
  };

  return (
    <>
      <CollapsibleSection title="Jump Basics" styled>
        <div className="flex flex-col gap-3 p-1">
          {/* Chain name */}
          <BlurInput
            value={name}
            onCommit={(v) => {
              if (v.trim()) rename(v.trim());
            }}
            placeholder="Chain name…"
            className="w-full text-base font-semibold text-center"
          />

          {settings && (
            <div className="flex flex-col gap-2 pt-2 border-t border-line">
              <div className="flex items-center justify-center gap-2">
                <Label className="font-medium">Default CP Per Jump:</Label>
                <BlurInput
                  type="number"
                  step="50"
                  min="0"
                  value={String(settings.defaultCP)}
                  onCommit={(v) =>
                    modify("Set default CP", (cs) => {
                      cs.defaultCP = Math.max(0, +v || 0);
                    })
                  }
                  className="w-24 text-right"
                />
              </div>
              <Checkbox checked={settings.startWithJumpZero} onChange={handleJumpZeroChange}>
                Start jump numbering at zero
              </Checkbox>
              <Checkbox
                checked={settings.allowPerkGroups}
                onChange={(on) => {
                  if (on)
                    modify("Enable perk fusions", (cs) => {
                      cs.allowPerkGroups = true;
                    });
                  else disablePurchaseGroups(PurchaseType.Perk);
                }}
              >
                Allow perk fusions / imports
              </Checkbox>
              <Checkbox
                checked={settings.allowItemGroups}
                onChange={(on) => {
                  if (on)
                    modify("Enable item fusions", (cs) => {
                      cs.allowItemGroups = true;
                    });
                  else disablePurchaseGroups(PurchaseType.Item);
                }}
              >
                Allow item fusions / imports
              </Checkbox>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {pendingJumpZero !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface border border-edge rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4">
            <div>
              <p className="font-semibold text-ink text-sm">
                {pendingJumpZero ? "Enable Jump Zero" : "Disable Jump Zero"}
              </p>
              <p className="text-xs text-muted mt-1">
                Changing jump numbering may shift supplement purchases and investments by one jump.{" "}
                {pendingJumpZero &&
                  `Content in the last jump of each supplement${" "}
              may be deleted if there is no room to shift.`}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  suppActions.shiftAllSupplementsForJumpZeroChange(pendingJumpZero);
                  setPendingJumpZero(null);
                }}
                className="w-full text-left px-3 py-2 rounded-lg border border-edge bg-tint text-sm text-ink hover:bg-tint/70 transition-colors"
              >
                <span className="font-semibold">Shift and apply</span>
              </button>
              <button
                type="button"
                onClick={() => setPendingJumpZero(null)}
                className="w-full text-left px-3 py-2 rounded-lg border border-edge text-sm text-muted hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Optional Features
// ─────────────────────────────────────────────────────────────────────────────

function OptionalFeaturesSection() {
  const { settings, modify: modifySettings } = useChainSettingsConfig();
  const { bank, modify: modifyBank } = useBankSettingsConfig();
  if (!settings) return null;

  return (
    <CollapsibleSection title="Optional Features" styled>
      <div className="flex flex-col gap-3 p-1">
        <div className="flex flex-col items-center gap-1">
          <Label>Alt-Forms</Label>
          <BoolSegment
            value={settings.altForms}
            onChange={(on) =>
              modifySettings("Toggle alt-forms", (cs) => {
                cs.altForms = on;
              })
            }
            trueLabel="Enabled"
            falseLabel="Disabled"
          />
        </div>

        <div className="flex flex-col items-center gap-1 pt-2 border-t border-line">
          <Label>Narratives</Label>
          <SegmentedControl
            value={settings.narratives}
            onChange={(v) =>
              modifySettings("Set narratives", (cs) => {
                cs.narratives = v as typeof cs.narratives;
              })
            }
            options={[
              { value: "enabled", label: "Enabled" },
              { value: "restricted", label: "Disabled for companions" },
              { value: "disabled", label: "Disabled" },
            ]}
          />
        </div>

        {bank && (
          <div className="flex flex-col gap-3 pt-2 border-t border-line">
            <div className="flex flex-col items-center gap-1">
              <Label>Bank</Label>
              <BoolSegment
                value={bank.enabled}
                onChange={(on) =>
                  modifyBank("Toggle bank", (b) => {
                    b.enabled = on;
                  })
                }
                trueLabel="Enabled"
                falseLabel="Disabled"
              />
            </div>

            {bank.enabled && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-0.5">Max Deposit (CP)</Label>
                  <BlurInput
                    type="number"
                    step="50"
                    min="0"
                    value={String(bank.maxDeposit)}
                    onCommit={(v) =>
                      modifyBank("Set max deposit", (b) => {
                        b.maxDeposit = Math.max(0, +v || 0);
                      })
                    }
                    className="w-full text-right"
                  />
                </div>
                <div>
                  <Label className="mb-0.5">Deposit Ratio (%)</Label>
                  <BlurInput
                    type="number"
                    step="5"
                    min="0"
                    max="100"
                    value={String(bank.depositRatio)}
                    onCommit={(v) =>
                      modifyBank("Set deposit ratio", (b) => {
                        b.depositRatio = Math.min(100, Math.max(0, +v || 0));
                      })
                    }
                    className="w-full text-right"
                  />
                </div>
                <div>
                  <Label className="mb-0.5">Interest Rate (%)</Label>
                  <BlurInput
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={String(bank.interestRate)}
                    onCommit={(v) =>
                      modifyBank("Set interest rate", (b) => {
                        b.interestRate = Math.min(100, Math.max(0, +v || 0));
                      })
                    }
                    className="w-full text-right"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawbacks
// ─────────────────────────────────────────────────────────────────────────────

function DrawbacksSection() {
  const { settings, modify } = useChainSettingsConfig();
  if (!settings) return null;

  return (
    <CollapsibleSection title="Drawbacks" styled>
      <div className="flex flex-col gap-3 p-1">
        {/* Retained drawbacks in sibling jumps */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-1.5">
            <Label>Retained Drawbacks in Sibling Jumps</Label>
            <Tip>
              When a drawback is "retained" for future jumps, do supplements/parents of the original
              jump receive additional points by default?
            </Tip>
          </div>
          <BoolSegment
            value={settings.supplementBlockDrawbackSharing}
            onChange={(on) =>
              modify("Toggle drawback sharing", (cs) => {
                cs.supplementBlockDrawbackSharing = on;
              })
            }
            trueLabel="Active"
            falseLabel="Not active"
          />
          {/* JumpDoc drawback limit */}
          <div className="pt-2 border-t border-line flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-1.5">
              <Label>Jumpdoc Drawback Limit</Label>
              <Tip>
                <p>
                  Some jumpdocs cap how many points you can earn from drawbacks. This controls
                  whether that cap is applied when you add an interactive jump.{" "}
                </p>
                <p className="mt-2">
                  It does NOT disable drawback limits that you manually apply.{" "}
                </p>
              </Tip>
            </div>
            <BoolSegment
              value={!settings.ignoreDrawbackLimit}
              onChange={(respect) =>
                modify("Set drawback limit behaviour", (cs) => {
                  cs.ignoreDrawbackLimit = !respect;
                })
              }
              trueLabel="Respect"
              falseLabel="Ignore"
            />
          </div>
        </div>

        {/* Chain Drawbacks sub-section */}
        <div className="pt-2 border-t border-line flex flex-col gap-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-widest text-center">
            Chain Drawbacks
          </p>

          {/* Companion access */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-1.5">
              <Label>Companion Access</Label>
              <Tip>
                Do companions recieve full points from chain drawbacks? If not, it is still possible
                to give them points by adding a separate "companion stipend" to a particular chain
                drawback.
              </Tip>
            </div>
            <BoolSegment
              value={settings.chainDrawbacksForCompanions}
              onChange={(on) =>
                modify("Toggle drawbacks for companions", (cs) => {
                  cs.chainDrawbacksForCompanions = on;
                })
              }
              trueLabel="Accessible to companions"
              falseLabel="Restricted to primary jumper(s)"
            />
          </div>

          {/* Supplement activity */}
          <div className="flex flex-col items-center gap-1.5">
            <Label>In Jump Supplements</Label>
            <BoolSegment
              value={settings.chainDrawbacksSupplements}
              onChange={(on) =>
                modify("Toggle drawbacks for supplements", (cs) => {
                  cs.chainDrawbacksSupplements = on;
                })
              }
              trueLabel="Active in jump supplements"
              falseLabel="Disabled in jump supplements"
            />
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Purchase Categories
// ─────────────────────────────────────────────────────────────────────────────

function CategoryPillSection({
  type,
  label,
}: {
  type: PurchaseType.Perk | PurchaseType.Item;
  label: string;
}) {
  const { categories, actions } = useChainPurchaseCategoryConfig(type);
  const [activeId, setActiveId] = useState<Id<GID.PurchaseCategory> | null>(null);

  if (!categories) return null;
  const entries = Object.entries(categories.O) as [string, string][];

  const handleAdd = () => {
    const newId = categories.fId;
    actions.addCategory();
    setActiveId(newId);
  };

  return (
    <CollapsibleSection title={label} styled>
      <div className="flex flex-col gap-2 p-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {entries.map(([idStr, name]) => {
            const id = createId<GID.PurchaseCategory>(+idStr);
            const isActive = (activeId as number) === +idStr;
            return (
              <Pill key={idStr} active={isActive} onClick={() => setActiveId(isActive ? null : id)}>
                <span className={isActive ? "" : `text-muted`}>
                  {name || <em className="opacity-60">Unnamed</em>}
                </span>
              </Pill>
            );
          })}
          <AddPill onClick={handleAdd} label={`Add ${label.toLowerCase()} category`} />
        </div>

        {activeId !== null &&
          (() => {
            const name = categories.O[activeId];
            if (name === undefined) return null;
            return (
              <div className="flex items-end gap-2 pt-2 border-t border-line">
                <div className="flex-1">
                  <Label className="mb-0.5">Name</Label>
                  <BlurInput
                    value={name}
                    onCommit={(v) => actions.renameCategory(activeId, v)}
                    placeholder="Category name…"
                    className="w-full"
                    autoFocus
                  />
                </div>
                <DeleteButton
                  onClick={() => {
                    actions.removeCategory(activeId);
                    setActiveId(null);
                  }}
                  label="Delete category"
                />
              </div>
            );
          })()}
      </div>
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Claim Chain
// ─────────────────────────────────────────────────────────────────────────────

function ClaimChainSection() {
  const { chainId } = Route.useParams();
  const { firebaseUser } = useCurrentUser();
  const ownerUid = useContext(ChainOwnerUidCtx);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  // Only show for anonymous chains opened by a signed-in user.
  if (ownerUid !== "" || !firebaseUser || claimed) return null;

  async function handleClaim() {
    if (!firebaseUser) return;
    setBusy(true);
    setError(null);
    try {
      const idToken = await firebaseUser.getIdToken();
      const result = await claimChain({ data: { publicUid: chainId, idToken } });
      if (result.status === "ok") {
        setClaimed(true);
        setConfirming(false);
      } else {
        setError(
          result.status === "already_owned"
            ? "This chain already has an owner."
            : "Chain not found.",
        );
      }
    } catch {
      setError("Failed to claim chain. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mx-auto my-4 flex w-fit items-center gap-1.5 px-4 py-2 rounded border border-accent/50 text-xs font-medium text-accent hover:bg-accent/10 transition-colors"
      >
        <UserCheck size={12} />
        Claim Chain
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-edge bg-surface shadow-xl p-6 flex flex-col gap-4">
            <div>
              <p className="text-sm font-semibold text-ink">Claim this chain?</p>
              <p className="text-xs text-muted mt-1">
                This will add the chain to your account. You'll be able to access it from your
                portal, but no one else will be able to access or edit it.
              </p>
              {error && <p className="text-xs text-danger mt-2">{error}</p>}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="px-3 py-1.5 rounded border border-edge text-xs text-muted hover:text-ink transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClaim}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent text-xs font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                <UserCheck size={12} />
                {busy ? "Claiming…" : "Claim Chain"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete Chain
// ─────────────────────────────────────────────────────────────────────────────

function DeleteChainSection() {
  const isElectron = import.meta.env.VITE_PLATFORM === "electron";
  const { chainId } = Route.useParams();
  const { firebaseUser } = useCurrentUser();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isElectron) return null;

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        await deleteChain({ data: { publicUid: chainId, idToken } });
      }
      removeRecentChain(chainId);
      navigate({ to: "/portal" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mx-auto my-4 flex w-fit items-center gap-1.5 px-4 py-2 rounded border border-danger/50 text-xs font-medium text-danger hover:bg-danger/10 transition-colors"
      >
        <Trash2 size={12} />
        Delete Chain
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-edge bg-surface shadow-xl p-6 flex flex-col gap-4">
            <div>
              <p className="text-sm font-semibold text-ink">Delete this chain?</p>
              <p className="text-xs text-muted mt-1">
                This cannot be undone. All jumps, purchases, and characters will be permanently
                deleted.
              </p>
              {error && <p className="text-xs text-danger mt-2">{error}</p>}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="px-3 py-1.5 rounded border border-edge text-xs text-muted hover:text-ink transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-danger text-xs font-medium text-white hover:bg-danger/90 transition-colors disabled:opacity-50"
              >
                <Trash2 size={12} />
                {busy ? "Deleting…" : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────

function ChainSettingsPage() {
  return (
    <div className="">
      <div className="max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
        {/* Left — identity + optional features */}
        <div className="flex flex-col gap-1">
          <JumpBasicsSection />
          <DrawbacksSection />
        </div>

        {/* Right — drawbacks, bank, categories */}
        <div className="flex flex-col gap-1">
          <CategoryPillSection type={PurchaseType.Perk} label="Perk Categories" />
          <CategoryPillSection type={PurchaseType.Item} label="Item Categories" />
          <OptionalFeaturesSection />
          <div className="flex flex-row">
            <ClaimChainSection />
            <DeleteChainSection />
          </div>
        </div>
      </div>
    </div>
  );
}
