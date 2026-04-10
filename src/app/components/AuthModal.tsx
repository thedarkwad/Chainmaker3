/**
 * AuthModal — sign-in / sign-up modal overlay.
 *
 * Handles email/password and Google OAuth sign-in. Display name collection
 * for new accounts is handled globally by DisplayNameModal in __root.tsx,
 * which survives auth state changes that would otherwise unmount this modal.
 */

import { useState } from "react";
import { getOrCreateDbUser, updateDisplayName } from "@/api/auth";
import { X } from "lucide-react";

type Mode = "signin" | "signup";

export function AuthModal({ onClose, onSuccess }: { onClose: () => void; onSuccess?: () => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    try {
      const { signInWithPopup, GoogleAuthProvider } = await import("firebase/auth");
      const { firebaseAuth } = await import("@/auth/client");
      await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
      // AuthProvider's onAuthStateChanged will detect empty displayName and set
      // needsDisplayName=true, which causes DisplayNameModal to appear globally.
      onSuccess ? onSuccess() : onClose();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { signInWithEmailAndPassword } = await import("firebase/auth");
        const { firebaseAuth } = await import("@/auth/client");
        await signInWithEmailAndPassword(firebaseAuth, email, password);
        onSuccess ? onSuccess() : onClose();
      } else {
        const { createUserWithEmailAndPassword } = await import("firebase/auth");
        const { firebaseAuth } = await import("@/auth/client");
        const { user } = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        const idToken = await user.getIdToken();
        // Explicitly create the DB user so updateDisplayName has a record to update.
        await getOrCreateDbUser({ data: idToken });
        if (displayName.trim()) {
          await updateDisplayName({ data: { idToken, displayName: displayName.trim() } });
        }
        // Full reload so AuthProvider fetches the now-complete dbUser record.
        window.location.href = "/portal";
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h2 className="text-base font-semibold text-ink">Sign in to ChainMaker</h2>
      <p className="text-xs text-muted">Manage your chains and jumpdocs across devices.</p>

      <div className="flex flex-col gap-3 pt-1">
        {/* Google */}
        <button
          onClick={handleGoogle}
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded border border-edge bg-canvas px-4 py-2 text-sm text-ink transition-colors hover:bg-tint disabled:opacity-50"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="h-px flex-1 bg-edge" />
          or
          <span className="h-px flex-1 bg-edge" />
        </div>

        {/* Mode toggle */}
        <div className="flex rounded border border-edge text-sm">
          <button
            onClick={() => { setMode("signin"); setError(null); }}
            className={`flex-1 py-1.5 text-center transition-colors ${
              mode === "signin" ? "bg-accent text-white" : "text-muted hover:text-ink"
            }`}
          >
            Sign in
          </button>
          <button
            onClick={() => { setMode("signup"); setError(null); }}
            className={`flex-1 py-1.5 text-center transition-colors ${
              mode === "signup" ? "bg-accent text-white" : "text-muted hover:text-ink"
            }`}
          >
            Create account
          </button>
        </div>

        {/* Email / password form */}
        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="rounded border border-edge bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-edge bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <input
            type="password"
            placeholder="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-edge bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-accent px-4 py-2 text-sm text-white transition-colors hover:opacity-80 disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </ModalShell>
  );
}

// ── Shared modal shell ────────────────────────────────────────────────────────

export function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-sm rounded-xl border border-edge bg-surface p-6 shadow-xl flex flex-col gap-3">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-ghost hover:text-ink transition-colors"
        >
          <X size={15} />
        </button>
        {children}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84z" />
    </svg>
  );
}

export function friendlyError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: string }).code;
    switch (code) {
      case "auth/invalid-email": return "Invalid email address.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential": return "Incorrect email or password.";
      case "auth/email-already-in-use": return "An account with that email already exists.";
      case "auth/weak-password": return "Password must be at least 6 characters.";
      case "auth/too-many-requests": return "Too many attempts. Try again later.";
      case "auth/popup-closed-by-user": return "Sign-in popup was closed.";
      case "auth/popup-blocked": return "Pop-up was blocked. Allow pop-ups for this site.";
      default: return "Something went wrong. Please try again.";
    }
  }
  return "Something went wrong. Please try again.";
}
