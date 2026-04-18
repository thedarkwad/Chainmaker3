import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { getOrCreateDbUser, updateDisplayName, type ClientUser } from "@/api/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthState = {
  firebaseUser: FirebaseUser | null;
  dbUser: ClientUser | null;
  loading: boolean;
  /** True when the signed-in user has no display name set in the DB yet. */
  needsDisplayName: boolean;
  /** Save a display name to the DB and clear needsDisplayName. */
  resolveDisplayName: (name: string) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthState>({
  firebaseUser: null,
  dbUser: null,
  loading: true,
  needsDisplayName: false,
  resolveDisplayName: async () => {},
});

// ---------------------------------------------------------------------------
// Provider — mount once at the app root (see __root.tsx)
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<AuthState, "resolveDisplayName">>({
    firebaseUser: null,
    dbUser: null,
    loading: true,
    needsDisplayName: false,
  });

  // Stable ref so resolveDisplayName can always access the current Firebase user
  // without being recreated on every render.
  const firebaseUserRef = useRef<FirebaseUser | null>(null);

  const resolveDisplayName = useCallback(async (name: string) => {
    if (!firebaseUserRef.current) return;
    const idToken = await firebaseUserRef.current.getIdToken();
    await updateDisplayName({ data: { idToken, displayName: name } });
    setState((prev) => ({
      ...prev,
      needsDisplayName: false,
      dbUser: prev.dbUser ? { ...prev.dbUser, displayName: name } : null,
    }));
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    Promise.all([
      import("firebase/auth"),
      import("@/auth/client"),
    ]).then(([{ onAuthStateChanged }, { firebaseAuth }]) => {
      cleanup = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
        firebaseUserRef.current = firebaseUser;

        if (!firebaseUser) {
          setState({ firebaseUser: null, dbUser: null, loading: false, needsDisplayName: false });
          return;
        }

        try {
          const idToken = await firebaseUser.getIdToken();
          const dbUser = await getOrCreateDbUser({ data: idToken }) as ClientUser ;
          setState({
            firebaseUser,
            dbUser,
            loading: false,
            needsDisplayName: !dbUser.displayName.trim(),
          });
        } catch (err) {
          console.error("Failed to load DB user after Firebase sign-in:", err);
          setState({ firebaseUser, dbUser: null, loading: false, needsDisplayName: false });
        }
      });
    });

    return () => cleanup?.();
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, resolveDisplayName }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCurrentUser(): AuthState {
  return useContext(AuthContext);
}
