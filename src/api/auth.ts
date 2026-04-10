import { createServerFn } from "@tanstack/react-start";
import { connectToDatabase, Models } from "@/server/db";
import { verifyIdToken, getOrCreateUser } from "@/server/auth";

// ---------------------------------------------------------------------------
// ClientUser — the serialisable user shape returned to the browser.
// Never import IUser (Mongoose type) on the client; use this instead.
// ---------------------------------------------------------------------------

export type ClientUser = {
  _id: string;
  firebaseUid: string;
  displayName: string;
  email: string;
  permissions: string[];
  /** Names of API keys the user has stored (values are never sent to the client). */
  apiKeyNames: string[];
  imageUsage: { maxBytes: number; currentBytes: number };
  pdfUsage: { maxBytes: number; currentBytes: number };
};

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

/**
 * Verifies a Firebase ID token, then looks up (or creates) the DB user.
 * Called from AuthProvider whenever Firebase auth state changes to signed-in.
 */
export const getOrCreateDbUser = createServerFn({ method: "POST" })
  .inputValidator((idToken: string) => idToken)
  .handler(async ({ data: idToken }) => {
    await connectToDatabase();
    const decoded = await verifyIdToken(idToken);
    const user = await getOrCreateUser(
      decoded.uid,
      decoded.email ?? "",
      "",
    );
    return {
      _id: String(user._id),
      firebaseUid: user.firebaseUid,
      displayName: user.displayName,
      email: user.email,
      permissions: (user.permissions ?? []) as string[],
      apiKeyNames: Array.from(user.apiKeys?.keys() ?? []),
      imageUsage: { maxBytes: user.imageUsage.maxBytes, currentBytes: user.imageUsage.currentBytes },
      pdfUsage: { maxBytes: user.pdfUsage.maxBytes, currentBytes: user.pdfUsage.currentBytes },
    };
  });

/**
 * Updates the display name of the authenticated user in the DB.
 * Called after the user picks a custom display name during Google sign-up.
 */
export const updateDisplayName = createServerFn({ method: "POST" })
  .inputValidator((data: { idToken: string; displayName: string }) => data)
  .handler(async ({ data }) => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(data.idToken);
    await Models.User.updateOne({ firebaseUid: uid }, { displayName: data.displayName });
    return { ok: true };
  });

/**
 * Returns the stored ImgChest API key for the authenticated user, or null if not set.
 * The key value is only ever sent back to the owning user.
 */
export const getImgChestApiKey = createServerFn({ method: "POST" })
  .inputValidator((idToken: string) => idToken)
  .handler(async ({ data: idToken }) => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(idToken);
    const user = await Models.User.findOne({ firebaseUid: uid }).lean();
    const key = (user?.apiKeys as Record<string, string> | undefined)?.["imgChest"] ?? null;
    return { key: key ?? null };
  });

/**
 * Stores or clears the ImgChest API key for the authenticated user.
 * Pass an empty string to remove the key.
 */
export const setImgChestApiKey = createServerFn({ method: "POST" })
  .inputValidator((data: { idToken: string; key: string }) => data)
  .handler(async ({ data }) => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(data.idToken);
    if (data.key.trim()) {
      await Models.User.updateOne({ firebaseUid: uid }, { $set: { "apiKeys.imgChest": data.key.trim() } });
    } else {
      await Models.User.updateOne({ firebaseUid: uid }, { $unset: { "apiKeys.imgChest": "" } });
    }
    return { ok: true };
  });
