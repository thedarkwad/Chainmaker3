// Electron stub for src/api/auth.ts — all server functions are no-ops.
// Auth does not exist in the Electron build; these are never called.

export type ClientUser = {
  _id: string;
  firebaseUid: string;
  displayName: string;
  email: string;
  permissions: string[];
  apiKeyNames: string[];
  imageUsage: { maxBytes: number; currentBytes: number };
  pdfUsage: { maxBytes: number; currentBytes: number };
};

const noop = async () => { throw new Error("Not available in Electron"); };

export const getOrCreateDbUser = { url: "", __executeServer: noop } as unknown as (...args: never[]) => Promise<ClientUser>;
export const updateDisplayName = { url: "", __executeServer: noop } as unknown as (...args: never[]) => Promise<void>;
export const getImgChestApiKey = { url: "", __executeServer: noop } as unknown as (...args: never[]) => Promise<string | null>;
export const setImgChestApiKey = { url: "", __executeServer: noop } as unknown as (...args: never[]) => Promise<void>;
