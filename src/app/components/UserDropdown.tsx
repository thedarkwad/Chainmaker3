/**
 * UserDropdown — authenticated user menu for any page header.
 *
 * Self-contained: reads auth from useCurrentUser(), handles sign-out and
 * navigation internally. Renders nothing when the user is not logged in.
 *
 * Also owns ImgChestKeyModal, which is only reachable from this dropdown.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  ChevronDown,
  KeyRound,
  MessageSquare,
  X,
} from "lucide-react";
import { useCurrentUser } from "@/app/state/auth";
import { firebaseAuth } from "@/auth/client";
import { getImgChestApiKey, setImgChestApiKey } from "@/api/auth";
import { getUnreadCount } from "@/api/conversations";
import { AuthModal } from "@/app/components/AuthModal";

// ── ImgChestKeyModal ──────────────────────────────────────────────────────────

function ImgChestKeyModal({ onClose }: { onClose: () => void }) {
  const { firebaseUser, dbUser } = useCurrentUser();
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser.getIdToken().then(async token => {
      const result = await getImgChestApiKey({ data: token });
      setKey(result.key ?? "");
      setLoading(false);
    });
  }, [firebaseUser]);

  async function handleSave() {
    if (!firebaseUser) return;
    setSaving(true);
    const token = await firebaseUser.getIdToken();
    await setImgChestApiKey({ data: { idToken: token, key } });
    setSaving(false);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-xl bg-surface border border-edge shadow-xl mx-4">
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <div className="flex items-center gap-2">
            <KeyRound size={15} className="text-accent" />
            <h2 className="text-sm font-semibold text-ink">ImgChest API Key</h2>
          </div>
          <button
            onClick={onClose}
            className="text-ghost hover:text-ink transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {/* Guide image — place imgchest-api-guide.png in /public/ */}
          <div className="rounded-lg border border-edge overflow-hidden bg-tint/30">
            <img
              src="/imgchest-api-guide.png"
              alt="Find your ImgChest API key under Account → API"
              className="w-full object-cover"
              onError={e => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
                (
                  e.currentTarget.nextElementSibling as HTMLElement | null
                )?.removeAttribute("hidden");
              }}
            />
            <p hidden className="px-3 py-2 text-xs text-muted italic">
              Place <code className="font-mono">imgchest-api-guide.png</code> in{" "}
              <code className="font-mono">/public/</code> to show a guide image
              here.
            </p>
          </div>

          <p className="text-xs text-muted leading-relaxed">
            If you have an Image Chest account, you can link that account to
            ChainMaker using an API key.{" "}
          </p>
          <p className="text-xs text-muted leading-relaxed">
            You can then upload images to Image Chest directly from ChainMaker,
            allowing for higher quality uploads and increased storage space. All
            uploaded images will be private to your account.
            {dbUser?.apiKeyNames.includes("imgChest") && (
              <span className="ml-1 text-accent">
                A key is currently saved.
              </span>
            )}
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">API Key</label>
            <textarea
              value={loading ? "" : key}
              onChange={e => setKey(e.target.value)}
              disabled={loading}
              placeholder={
                loading ? "Loading…" : "Paste your ImgChest API key here"
              }
              rows={3}
              className="w-full resize-none rounded border border-edge bg-canvas px-3 py-2 text-xs font-mono text-ink placeholder-ghost focus:border-accent-ring focus:outline-none disabled:opacity-50"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || loading || saved}
              className="flex-1 rounded border border-accent/40 bg-accent-tint px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
            >
              {saved ? "Saved!" : saving ? "Saving…" : "Save"}
            </button>
            {key && !loading && (
              <button
                onClick={() => setKey("")}
                className="rounded border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/20"
                title="Clear API key"
              >
                Clear
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── UserDropdown ──────────────────────────────────────────────────────────────

export function UserDropdown() {
  const { firebaseUser, dbUser } = useCurrentUser();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser.getIdToken().then(idToken => {
      getUnreadCount({ data: { idToken } })
        .then(setUnreadCount)
        .catch(() => {});
    });
  }, [firebaseUser]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!firebaseUser) {
    return (
      <>
        <button
          onClick={() => setAuthModalOpen(true)}
          className="rounded-sm px-2 py-1 text-sm opacity-70 transition-colors hover:bg-surface/10 hover:opacity-100"
        >
          Sign in
        </button>
        {authModalOpen &&
          createPortal(
            <AuthModal onClose={() => setAuthModalOpen(false)} />,
            document.body,
          )}
      </>
    );
  }

  const displayName = dbUser?.displayName || "User";
  const email = firebaseUser.email ?? "";

  async function handleSignOut() {
    const { signOut } = await import("firebase/auth");
    await signOut(firebaseAuth);
    // System-initiated redirect after sign-out.
    navigate({ to: "/" });
  }

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          className={`flex items-center gap-2 rounded-sm px-2 py-1 transition-colors ${
            open ? "opacity-100" : "opacity-70 hover:opacity-100"
          }`}
        >
          <span className="hidden text-sm sm:inline">{displayName}</span>
          <ChevronDown size={13} className="opacity-70" />
        </button>

        {open && (
          <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded border border-edge bg-surface shadow-lg">
            <div className="border-b border-line px-3 py-2.5">
              <p className="text-sm font-medium text-ink">{displayName}</p>
              <p className="text-xs text-muted">{email}</p>
            </div>
            <div className="p-1">
              <Link
                className="w-full block rounded-sm px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-tint"
                to="/userimages"
              >
                Your Images
              </Link>
            </div>
            <div className="p-1">
              <button
                onClick={() => {
                  setOpen(false);
                  setApiKeyModalOpen(true);
                }}
                className="w-full flex items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-tint"
              >
                <KeyRound size={13} className="text-muted" />
                ImgChest Account
              </button>
            </div>
            <div className="p-1">
              <a
                href="/guide"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-tint"
                onClick={() => setOpen(false)}
              >
                <BookOpen size={13} className="text-muted" />
                Jumpdoc Guide
              </a>
            </div>

            <div className="p-1">
              <button
                onClick={() => {
                  setOpen(false);
                  handleSignOut();
                }}
                className="w-full rounded-sm px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-tint"
              >
                Sign out
              </button>
            </div>
          </div>
        )}

        {apiKeyModalOpen &&
          createPortal(
            <ImgChestKeyModal onClose={() => setApiKeyModalOpen(false)} />,
            document.body,
          )}
      </div>
      <Link
        to="/messages"
        className="relative flex items-center rounded-sm p-1.5 opacity-70 transition-colors hover:opacity-100"
        title="Messages"
      >
        <MessageSquare size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex min-w-3.75 h-3.75 items-center justify-center rounded-full bg-danger text-white text-[9px] font-bold px-0.5">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Link>
    </>
  );
}
