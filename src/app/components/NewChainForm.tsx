import React, { useEffect, useState } from "react";
import { ChevronRight, Globe, TriangleAlert, X } from "lucide-react";
import { Tip } from "@/ui/Tip";
import { createChain } from "@/api/chains";
import { loadJumpDoc, type JumpDocSummary } from "@/api/jumpdocs";
import { buildNewChain } from "@/chain/data/newChain";
import { JumpSourceType } from "@/chain/data/Jump";
import {
  type DefaultBodyMods,
  type DefaultPerkCategories,
  type DefaultWarehouseMods,
} from "@/chain/data/chainPresets";
import { JumpDocGallery } from "./JumpDocGallery";
// import { JumpDocGallery } from "@/app/components/JumpDocGallery";

type FirebaseUserLike = { getIdToken(): Promise<string> };
type JumpSourceMode = "url" | "jumpdoc";

export type NewChainFormProps = {
  /** Optional: prefill the JumpDoc tab with this doc selected. */
  initialJumpdoc?: JumpDocSummary;
  /** If provided, the idToken is fetched from this user before creating the chain. */
  firebaseUser?: FirebaseUserLike | null;
  /** Called with the new chain's publicUid after successful creation. */
  onCreated: (publicUid: string) => void;
  /** Called when the user wants to cancel (e.g. to close the surrounding modal). */
  onCancel: () => void;
};

export function NewChainForm({
  initialJumpdoc,
  firebaseUser,
  onCreated,
  onCancel,
}: NewChainFormProps) {
  const [chainName, setChainName] = useState("");
  const [jumperName, setJumperName] = useState("");
  const [sourceMode, setSourceMode] = useState<JumpSourceMode>(initialJumpdoc ? "jumpdoc" : "url");
  const [selectedDoc, setSelectedDoc] = useState<JumpDocSummary | null>(initialJumpdoc ?? null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [jumpName, setJumpName] = useState("");
  const [jumpUrl, setJumpUrl] = useState("");
  const [bodyMod, setBodyMod] = useState<DefaultBodyMods | "">("");
  const [warehouseMod, setWarehouseMod] = useState<DefaultWarehouseMods | "">("");
  const [perkCategories, setPerkCategories] = useState<DefaultPerkCategories>("Default");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chainName.trim() || !jumperName.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      let jumpSource: Parameters<typeof buildNewChain>[0]["jumpSource"];
      let resolvedJumpName: string | undefined;
      let resolvedDoc: Parameters<typeof buildNewChain>[0]["doc"];
      let resolvedDocPublicUid: string | undefined;
      if (sourceMode === "jumpdoc" && selectedDoc) {
        const loaded = await loadJumpDoc({ data: { publicUid: selectedDoc.publicUid } });
        resolvedDoc = loaded.contents as Parameters<typeof buildNewChain>[0]["doc"];
        resolvedDocPublicUid = selectedDoc.publicUid;
        resolvedJumpName = selectedDoc.name;
      } else if (sourceMode === "url") {
        jumpSource = { type: JumpSourceType.URL, URL: jumpUrl.trim() };
        resolvedJumpName = jumpName.trim() || undefined;
      }

      const contents = buildNewChain({
        name: chainName.trim(),
        jumperName: jumperName.trim(),
        jumpName: resolvedJumpName,
        jumpSource,
        doc: resolvedDoc,
        docPublicUid: resolvedDocPublicUid,
        bodyMod: bodyMod || undefined,
        warehouseMod: warehouseMod || undefined,
        perkCategories,
      });

      const idToken = firebaseUser ? await firebaseUser.getIdToken() : undefined;
      const { publicUid } = await createChain({ data: { idToken, contents } });
      onCreated(publicUid);
    } catch (err) {
      console.error("Chain creation failed:", err);
      setError("Failed to create chain. Please try again.");
      setSubmitting(false);
    }
  }

  const canSubmit =
    chainName.trim().length > 0 &&
    jumperName.trim().length > 0 &&
    (sourceMode === "jumpdoc" || jumpName.trim().length > 0) &&
    !submitting;

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
        {/* Chain name + Jumper name */}
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-medium text-muted">Chain Name</label>
            <input
              // autoFocus
              value={chainName}
              onChange={(e) => setChainName(e.target.value)}
              placeholder="Chain Name"
              className="rounded border border-edge bg-canvas px-3 py-1.5 text-sm text-ink placeholder:text-ghost focus:border-accent-ring focus:outline-none"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-medium text-muted">Jumper Name</label>
            <input
              value={jumperName}
              onChange={(e) => setJumperName(e.target.value)}
              placeholder="Jumper"
              className="rounded border border-edge bg-canvas px-3 py-1.5 text-sm text-ink placeholder:text-ghost focus:border-accent-ring focus:outline-none"
            />
          </div>
        </div>

        {/* First jump source */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted">First Jump</label>
          <div className="flex gap-1 rounded-lg border border-edge bg-canvas p-0.5">
            <SourceTab active={sourceMode === "jumpdoc"} onClick={() => setSourceMode("jumpdoc")}>
              Interactive
            </SourceTab>
            <SourceTab active={sourceMode === "url"} onClick={() => setSourceMode("url")}>
              Static
            </SourceTab>
          </div>

          {sourceMode === "jumpdoc" && (
            <button
              type="button"
              onClick={() => setGalleryOpen(true)}
              className="flex items-center gap-2 rounded border border-edge bg-canvas px-3 py-2 text-left transition-colors hover:bg-tint"
            >
              {selectedDoc?.imageUrl && (
                <img
                  src={selectedDoc.imageUrl}
                  alt={selectedDoc.name}
                  className="h-12 w-12 rounded object-cover shrink-0"
                />
              )}
              {selectedDoc ? (
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-sm text-ink">{selectedDoc.name}</span>
                  {selectedDoc.author.length > 0 && (
                    <span className="text-xs text-muted">{selectedDoc.author.join(", ")}</span>
                  )}
                </div>
              ) : (
                <span className="flex-1 text-sm text-ghost">Choose a JumpDoc…</span>
              )}
              <ChevronRight size={13} className="shrink-0 text-ghost" />
            </button>
          )}

          {sourceMode === "url" && (
            <div className="flex flex-col gap-1.5">
              <input
                value={jumpName}
                onChange={(e) => setJumpName(e.target.value)}
                placeholder="Jump name"
                className="rounded border border-edge bg-canvas px-3 py-1.5 text-sm text-ink placeholder:text-ghost focus:border-accent-ring focus:outline-none"
              />
              <div className="flex items-center gap-2 rounded border border-edge bg-canvas px-3 py-1.5">
                <Globe size={13} className="shrink-0 text-ghost" />
                <input
                  value={jumpUrl}
                  onChange={(e) => setJumpUrl(e.target.value)}
                  placeholder="https://example.com/myjumpdoc.pdf"
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ghost focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Presets */}
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="text-xs font-medium text-muted">Presets (optional)</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <label className="text-xs text-ghost">Body Mod</label>
                <Tip>
                  A personal supplement that upgrades your jumper's body and mind. Carried across
                  all jumps, even if your powers would otherwise be stripped.
                </Tip>
              </div>
              <PresetSelect
                value={bodyMod}
                onChange={(v) => setBodyMod(v as DefaultBodyMods | "")}
                options={[
                  { value: "", label: "None" },
                  { value: "Essential", label: "Essential" },
                  { value: "SB", label: "SB" },
                  { value: "Quicksilver", label: "Quicksilver" },
                ]}
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <label className="text-xs text-ghost">Warehouse</label>
                <Tip>
                  A personal storage space that travels with you between jumps. Used to store items,
                  companions, and other resources.
                </Tip>
              </div>
              <PresetSelect
                value={warehouseMod}
                onChange={(v) => setWarehouseMod(v as DefaultWarehouseMods | "")}
                options={[
                  { value: "", label: "None" },
                  { value: "PersonalReality", label: "Personal Reality" },
                  { value: "Quicksilver", label: "Quicksilver" },
                  { value: "Backpack", label: "Backpack" },
                ]}
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <label className="text-xs text-ghost">Perk categories</label>
                <Tip>
                  <p className="font-medium text-ink mb-1">Default</p>
                  <p className="mb-2">
                    Physical · Mental · Social · Magical · Spiritual · Skill · Crafting · Fortune ·
                    Meta · Other
                  </p>
                  <p className="font-medium text-ink mb-1">Power Source</p>
                  <p className="mb-2">
                    Biology · Skill & Knowledge · Will & Personality · Magic · Psionics · Soul & Chi
                    · Fate · Technology · Esoteric · Fiat · Other
                  </p>
                  <p className="font-medium text-ink mb-1">PRT Classification</p>
                  <p>
                    Mover · Shaker · Brute · Breaker · Master · Tinker · Blaster · Thinker · Striker
                    · Changer · Trump · Stranger · Other
                  </p>
                </Tip>
              </div>
              <PresetSelect
                value={perkCategories}
                onChange={(v) => setPerkCategories(v as DefaultPerkCategories)}
                options={[
                  { value: "Default", label: "Default" },
                  { value: "Worm", label: "PRT Classification" },
                  { value: "PowerSource", label: "Power Source" },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Guest warning */}
        {!firebaseUser && (
          <div className="flex items-start gap-2 rounded border border-warn/40 bg-warn/10 px-3 py-2.5 text-xs text-warn">
            <TriangleAlert size={13} className="mt-px shrink-0" />
            <p className="leading-relaxed">
              <span className="font-semibold">Bookmark your chain URL</span> after creating it.
              Without an account, it's the only way to get back to your chain. Your recent chains
              are saved in your browser, but can be lost if you clear your cache.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-line pt-3">
          {error ? <p className="text-xs text-danger">{error}</p> : <span />}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-xs text-muted transition-colors hover:bg-tint hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-surface shadow-sm transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create Chain"}
            </button>
          </div>
        </div>
      </form>

      {galleryOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/50"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setGalleryOpen(false);
          }}
        >
          <div className="flex w-full max-w-3xl flex-col rounded-lg border border-edge bg-canvas shadow-xl m-4 max-h-[80vh]">
            <div className="flex shrink-0 items-center justify-between border-b border-edge px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Select a JumpDoc</h2>
              <button
                type="button"
                onClick={() => setGalleryOpen(false)}
                className="p-0.5 text-ghost transition-colors hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <JumpDocGallery
                onSelect={(doc) => {
                  setSelectedDoc(doc);
                  setGalleryOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SourceTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
        active ? "bg-accent/80 text-accent-tint shadow-sm" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function PresetSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-edge bg-canvas px-2 py-1 text-xs text-ink focus:border-accent-ring focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
