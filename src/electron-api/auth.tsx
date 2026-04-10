// Electron stub for @/app/state/auth.
// No Firebase auth in Electron — this module exports the same shape but
// always reports "no user, not loading".

import type { AuthState } from "@/app/state/auth";

export type { AuthState };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useCurrentUser(): AuthState {
  return {
    firebaseUser: null,
    dbUser: null,
    loading: false,
    needsDisplayName: false,
    resolveDisplayName: async () => {},
  };
}
