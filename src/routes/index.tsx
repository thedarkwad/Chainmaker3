import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type ChangeEvent, lazy, useEffect, useRef, useState } from "react";
import { ArrowRight, FileText, FolderOpen, Plus, Upload } from "lucide-react";
import { unzipSync } from "fflate";

import { useCurrentUser } from "@/app/state/auth";
import { useTheme } from "@/providers/ThemeProvider";
import { SettingsDropdown } from "@/app/components/SettingsDropdown";
import { UserDropdown } from "@/app/components/UserDropdown";
import { AuthModal } from "@/app/components/AuthModal";
import { JumpDocPickerModal } from "@/app/components/JumpDocPickerModal";
import { listPublishedJumpDocs, importJumpDoc, type JumpDocSummary } from "@/api/jumpdocs";
import { createChain } from "@/api/chains";
import { uploadImage } from "@/api/images";
import { convertChain } from "@/chain/conversion";
import { getRecentChains, type RecentChain } from "@/app/state/recentChains";

// Lazily imported so the web build never bundles electron-api dependencies.
// import.meta.env.VITE_PLATFORM is a build-time constant — Vite tree-shakes
// the false branch entirely.
const ElectronHome =
  import.meta.env.VITE_PLATFORM === "electron"
    ? lazy(() => import("@/app/components/ElectronHome").then((m) => ({ default: m.ElectronHome })))
    : null;

export const Route = createFileRoute("/")({
  component: HomePage,
});

// ── DocCard ────────────────────────────────────────────────────────────────────

function DocCard({ doc, onClick }: { doc: JumpDocSummary; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 rounded-lg border border-edge bg-surface p-3 text-left transition-colors hover:border-accent hover:bg-accent-tint w-full"
    >
      <div className="shrink-0 h-12 overflow-hidden rounded bg-tint">
        {doc.imageUrl ? (
          <img src={doc.imageUrl} alt={doc.name} className="h-full aspect-square object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileText size={14} className="text-ghost" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{doc.name}</p>
        {doc.author.length > 0 && (
          <p className="truncate text-xs text-muted">{doc.author.join(", ")}</p>
        )}
      </div>
      <ArrowRight
        size={14}
        className="ml-auto shrink-0 text-ghost sm:opacity-0 transition-opacity sm:group-hover:opacity-100"
      />
    </button>
  );
}

// ── GalaxyImage ────────────────────────────────────────────────────────────────

function readAccentHueRotation(): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--theme-accent-ring")
    .trim();
  const match = raw.match(/oklch\(\s*[\d.%]+\s+[\d.]+\s+([\d.]+)/);
  const hue = match ? parseFloat(match[1]) : 278;
  return hue - 278; // 278 = indigo baseline
}

function GalaxyImage({ dark }: { dark: boolean }) {
  const [hueRotate, setHueRotate] = useState(0);

  useEffect(() => {
    setHueRotate(readAccentHueRotation());
    const observer = new MutationObserver(() => setHueRotate(readAccentHueRotation()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-dark"],
    });
    return () => observer.disconnect();
  }, []);

  const filter = `hue-rotate(${hueRotate + 220}deg)`;

  return (
    <img
      src="https://cdn.esahubble.org/archives/images/screen/potw1345a.jpg"
      alt=""
      aria-hidden
      className={`pointer-events-none absolute right-0 top-1/3 w-700 -translate-y-5/12 translate-x-1/4 select-none ${
        dark ? "mix-blend-lighten" : "mix-blend-normal opacity-30"
      }`}
      style={{
        filter,
        maskImage: dark
          ? "radial-gradient(ellipse 70% 65% at 65% 50%, black 25%, transparent 75%)"
          : "radial-gradient(ellipse 70% 65% at 65% 50%, black 5%, transparent 60%)",
        WebkitMaskImage: dark
          ? "radial-gradient(ellipse 70% 65% at 65% 50%, black 25%, transparent 75%)"
          : "radial-gradient(ellipse 70% 65% at 65% 50%, black 5%, transparent 60%)",
      }}
    />
  );
}

// ── HomePage ───────────────────────────────────────────────────────────────────

function HomePage() {
  const isElectron = import.meta.env.VITE_PLATFORM === "electron";

  if (isElectron && ElectronHome) return <ElectronHome />;

  const { settings, updateSettings } = useTheme();
  const { firebaseUser } = useCurrentUser();
  const navigate = useNavigate();

  const [recentDocs, setRecentDocs] = useState<JumpDocSummary[]>([]);
  const [recentChains] = useState<RecentChain[]>(() => getRecentChains());
  /** null = closed, undefined = open without a doc, JumpDocSummary = open with a doc */
  const [pickerDoc, setPickerDoc] = useState<JumpDocSummary | null | undefined>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [chainImporting, setChainImporting] = useState(false);
  const [chainImportError, setChainImportError] = useState<string | null>(null);
  const [chainImportResult, setChainImportResult] = useState<{
    publicUid: string;
    skippedImages: string[];
  } | null>(null);
  const chainFileInputRef = useRef<HTMLInputElement>(null);

  async function handleImportChain(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setChainImportError(null);
    setChainImportResult(null);
    setChainImporting(true);
    try {
      const isChainFile = file.name.toLowerCase().endsWith(".chain");

      if (isChainFile) {
        if (!firebaseUser) {
          setChainImportError("Sign in to upload .chain files.");
          return;
        }

        const uint8 = new Uint8Array(await file.arrayBuffer());
        const unzipped = unzipSync(uint8);

        const dataBytes = unzipped["data.json"];
        if (!dataBytes) throw new Error("Invalid .chain file: missing data.json");

        const raw = JSON.parse(new TextDecoder().decode(dataBytes)) as Record<string, unknown>;
        const isLegacy = raw.versionNumber !== "3.0";
        const chain = isLegacy ? convertChain(raw as object) : raw;
        const chainCopy = JSON.parse(JSON.stringify(chain)) as Record<string, unknown>;
        const altforms =
          (chainCopy.altforms as { O?: Record<string, Record<string, unknown>> } | undefined)?.O ??
          {};

        const imageFolder = isLegacy ? "user_images/" : "images/";
        const imageEntries = Object.entries(unzipped).filter(
          ([name]) => name.startsWith(imageFolder) && name.length > imageFolder.length,
        );

        const idToken = await firebaseUser.getIdToken();
        const skippedImages: string[] = [];
        const uploadedImageIds: string[] = [];

        for (const [entryName, imageData] of imageEntries) {
          const filename = entryName.slice(imageFolder.length);
          const altFormKey = filename.replace(/\.[^.]+$/, "");

          let binary = "";
          for (let i = 0; i < imageData.length; i++) binary += String.fromCharCode(imageData[i]);
          const fileData = btoa(binary);

          let newImgId: string;
          try {
            const result = await uploadImage({
              data: { idToken, fileName: filename, fileData, bytes: imageData.length },
            });
            newImgId = result._id;
          } catch {
            const afName =
              (altforms[altFormKey] as { name?: string } | undefined)?.name ?? filename;
            skippedImages.push(afName);
            continue;
          }

          uploadedImageIds.push(newImgId);

          if (isLegacy) {
            if (altforms[altFormKey]) {
              (altforms[altFormKey] as Record<string, unknown>).image = {
                type: "internal",
                imgId: newImgId,
              };
            }
          } else {
            for (const af of Object.values(altforms)) {
              const img = (af as { image?: { type?: string; imgId?: string } }).image;
              if (img?.type === "internal" && img.imgId === altFormKey) img.imgId = newImgId;
            }
          }
        }

        const { publicUid } = await createChain({
          data: { idToken, contents: chainCopy, imageIds: uploadedImageIds },
        });

        if (skippedImages.length > 0) {
          setChainImportResult({ publicUid, skippedImages });
        } else {
          navigate({ to: "/chain/$chainId", params: { chainId: publicUid } });
        }
      } else {
        const raw = JSON.parse(await file.text()) as Record<string, unknown>;
        const contents = raw.versionNumber === "3.0" ? raw : convertChain(raw as object);
        const idToken = firebaseUser ? await firebaseUser.getIdToken() : undefined;
        const { publicUid } = await createChain({ data: { idToken, contents } });
        navigate({ to: "/chain/$chainId", params: { chainId: publicUid } });
      }
    } catch (err) {
      setChainImportError(
        err instanceof SyntaxError
          ? "That file doesn't look like valid JSON."
          : err instanceof Error
            ? err.message
            : "Import failed — check the console for details.",
      );
    } finally {
      setChainImporting(false);
    }
  }

  useEffect(() => {
    listPublishedJumpDocs({ data: { page: 1, pageSize: 5, sortKey: "createdAt", sortDir: "desc" } })
      .then((r) => setRecentDocs(r.docs))
      .catch((e) => console.error("listPublishedJumpDocs failed:", e));
  }, []);

  return (
    <div className="relative flex h-dvh flex-col overflow-y-auto bg-canvas">
      {/* Settings gear — top right, always visible regardless of background */}
      <div className="absolute right-5 top-5 z-20 flex items-center gap-1 rounded-lg bg-accent2/60 backdrop-blur-sm text-white">
        <UserDropdown />
        <SettingsDropdown settings={settings} onUpdate={updateSettings} />
      </div>

      {/* Main layout — side by side on lg, stacked on mobile */}
      <div className="flex flex-1 flex-col lg:flex-row lg:min-h-dvh">
        <div className="relative flex flex-col items-center justify-center bg-linear-to-br from-accent to-accent2 px-8 py-16 lg:w-[44%] lg:px-14 lg:py-24">
          {/* Subtle vignette */}
          <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/5 to-black/25" />

          <div className="relative z-10 max-w-sm">
            <h1
              className="mb-2 text-5xl leading-tight text-white lg:text-6xl"
              style={{ fontFamily: "Roboto Slab, Sans Serif" }}
            >
              ChainMaker
            </h1>

            <p className="mb-10 text-sm leading-relaxed text-white/60">
              Jumpchain is a character-building game where you design a traveler jumping between
              fictional universes, gaining powers, companions, and items along the way. ChainMaker
              is a tool for planning your chain, tracking your purchases, and exploring
              community-created jump documents.
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setPickerDoc(undefined)}
                className="flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-accent transition-opacity hover:opacity-90"
              >
                <Plus size={15} />
                New Chain
              </button>
              <button
                onClick={() => chainFileInputRef.current?.click()}
                disabled={chainImporting}
                className="flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
              >
                <Upload size={14} />
                {chainImporting ? "Importing…" : "Import Chain"}
              </button>
              <input
                ref={chainFileInputRef}
                type="file"
                accept=".json,.chain"
                className="hidden"
                onChange={handleImportChain}
              />
              {chainImportError && (
                <p className="w-full text-xs text-white/80">{chainImportError}</p>
              )}
              {chainImportResult && (
                <div className="w-full rounded-lg border border-white/20 bg-white/10 p-3 text-xs text-white/90">
                  <p className="font-medium mb-1">
                    {chainImportResult.skippedImages.length} image
                    {chainImportResult.skippedImages.length !== 1 ? "s" : ""} couldn't be uploaded
                    (storage quota exceeded):
                  </p>
                  <ul className="list-disc list-inside text-white/70 mb-2">
                    {chainImportResult.skippedImages.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() =>
                      navigate({
                        to: "/chain/$chainId",
                        params: { chainId: chainImportResult.publicUid },
                      })
                    }
                    className="rounded border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
                  >
                    Open Chain Anyway
                  </button>
                </div>
              )}
              {isElectron ? (
                <button
                  onClick={() => {
                    window.electronAPI?.chains
                      .openFilePicker()
                      .then((result) => {
                        if (result)
                          navigate({ to: "/chain/$chainId", params: { chainId: result.id } });
                      })
                      .catch(console.error);
                  }}
                  className="flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
                >
                  <FolderOpen size={14} />
                  Open Chain File
                </button>
              ) : firebaseUser ? (
                // @ts-ignore — /portal excluded from Electron route tree; guarded by !isElectron
                <Link
                  to="/portal"
                  className="flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
                >
                  My Chains & Jumpdocs <ArrowRight size={14} />
                </Link>
              ) : (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
                >
                  Sign In <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Content panel ──────────────────────────────────────────────────── */}
        <div className="relative flex-1 overflow-hidden lg:flex">
          <div className="relative flex flex-col gap-8 px-6 py-10 lg:flex-1 overflow-x-hidden lg:overflow-y-auto lg:px-12 lg:py-20">
            {/* Galaxy image — lighten in dark mode, invert+multiply in light mode */}
            <GalaxyImage dark={settings.dark} />
            {/* Auth / Portal card — web only */}
            {!isElectron && firebaseUser ? (
              <section className="rounded-xl border border-edge bg-surface p-6">
                <h2 className="mb-1 text-sm font-semibold text-ink">Welcome Back</h2>
                <p className="mb-4 text-xs text-muted">
                  View your chains and jump documents in your portal.
                </p>
                {/* @ts-ignore — /portal excluded from Electron route tree; guarded by !isElectron */}
                <Link
                  to="/portal"
                  className="inline-flex items-center gap-2 rounded-lg bg-accent2 px-4 py-2 text-xs font-medium text-white hover:opacity-90"
                >
                  Open Portal <ArrowRight size={12} />
                </Link>
              </section>
            ) : null}

            {/* Recent Chains */}
            {recentChains.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                  Your Recent Chains
                </h2>
                <div className="flex flex-col gap-1 max-w-1/2">
                  {recentChains.map((c) => (
                    <Link
                      key={c.publicUid}
                      to="/chain/$chainId"
                      params={{ chainId: c.publicUid }}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink transition-colors hover:bg-tint"
                      search={{}}
                    >
                      <ArrowRight size={13} className="shrink-0 text-ghost" />
                      {c.name}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Recent Jumpdocs */}
            <section>
              <div className="mb-3 flex flex-wrap items-center gap-y-0.5 gap-x-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  {isElectron ? "Local Jumpdocs" : "Newly Converted Jumpdocs"}
                </h2>
                <div className="flex gap-1">
                  <Link
                    to="/gallery"
                    className="flex items-center gap-1 text-xs text-accent hover:underline bg-surface rounded z-10 p-1 border border-edge/50"
                  >
                    Browse All <ArrowRight size={12} />
                  </Link>
                  <Link
                    to="/purchases"
                    className="flex items-center gap-1 text-xs text-accent hover:underline bg-surface rounded z-10 p-1 border border-edge/50"
                  >
                    Search For Perks &amp; Items <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {recentDocs.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-sm text-ghost">
                    Loading…
                  </div>
                ) : (
                  recentDocs.map((doc) => (
                    <DocCard key={doc._id} doc={doc} onClick={() => setPickerDoc(doc)} />
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      {!isElectron && showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          // @ts-ignore — /portal excluded from Electron route tree; guarded by !isElectron
          onSuccess={() => navigate({ to: "/portal" })}
        />
      )}

      {pickerDoc !== null && (
        <JumpDocPickerModal doc={pickerDoc} onClose={() => setPickerDoc(null)} />
      )}
    </div>
  );
}
