import { App, getApps, initializeApp, cert } from "firebase-admin/app";
import { Auth, getAuth } from "firebase-admin/auth";
import { connectToDatabase, Models } from "./db";

// ---------------------------------------------------------------------------
// Firebase Admin singleton
// ---------------------------------------------------------------------------

let adminApp: App | null = null;
let adminAuth: Auth | null = null;

function getFirebaseAdmin(): { app: App; auth: Auth } {
  if (adminApp && adminAuth) return { app: adminApp, auth: adminAuth };

  const existing = getApps();
  adminApp =
    existing.length > 0
      ? existing[0]
      : initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            // Cloud env vars often have literal \n for newlines
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
          }),
        });

  adminAuth = getAuth(adminApp);
  return { app: adminApp, auth: adminAuth };
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Verifies a Firebase ID token (sent from the client in Authorization header).
 * Throws if the token is invalid or expired.
 */
export async function verifyIdToken(token: string) {
  const { auth } = getFirebaseAdmin();
  return auth.verifyIdToken(token);
}

/**
 * Looks up the app-level User document for a verified Firebase UID.
 * Creates a minimal record on first sign-in.
 */
export async function getOrCreateUser(
  firebaseUid: string,
  email: string,
  displayName: string,
) {
  await connectToDatabase();

  const existing = await Models.User.findOne({ firebaseUid });
  if (existing) return existing;

  return Models.User.create({
    firebaseUid,
    email,
    displayName,
    preferences: {},
    permissions: [],
    apiKeys: {},
    imageUsage: { maxBytes: 10 * 1024 * 1024, currentBytes: 0 },
    pdfUsage: { maxBytes: 30 * 1024 * 1024, currentBytes: 0 },
  });
}
