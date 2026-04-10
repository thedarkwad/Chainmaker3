import { Models } from "@/server/db";

/**
 * Returns true if `uid` owns the document or has admin permissions.
 * Use this to gate mutations on ownership without repeating the DB lookup at every call site.
 */
export async function isAuthorizedForDoc(uid: string, ownerUid: string): Promise<boolean> {
  if (ownerUid === uid) return true;
  const user = await Models.User.findOne({ firebaseUid: uid }, { permissions: 1 }).lean();
  return user?.permissions?.includes("admin") ?? false;
}

/** Escapes a string for safe use in a RegExp literal. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
