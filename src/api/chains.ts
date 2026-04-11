import { createServerFn } from "@tanstack/react-start";
import { applyPatches, enablePatches, type Patch } from "immer";
import { connectToDatabase, Models } from "@/server/db";
import { verifyIdToken } from "@/server/auth";
import { isAuthorizedForDoc } from "@/api/_helpers";
import { type SaveResult } from "@/api/types";
import { customAlphabet } from "nanoid";
import { alphanumeric } from "nanoid-dictionary";


export type { SaveResult, SaveStatus } from "@/api/types";

enablePatches();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AltFormLike = { image?: { type?: string; imgId?: string } };
type ContentsLike = { altforms?: { O?: Record<string, AltFormLike | null> } };

/** Collects the set of internal image IDs referenced by alt-forms in chain contents. */
function extractAltFormImgIds(contents: unknown): Set<string> {
  const O = (contents as ContentsLike)?.altforms?.O ?? {};
  const ids = new Set<string>();
  for (const af of Object.values(O)) {
    if (af?.image?.type === "internal" && af.image.imgId) ids.add(af.image.imgId);
  }
  return ids;
}

/**
 * Builds the Image.usedIn update operations needed when chain image references change.
 * Removed image IDs get $pulled; added image IDs get $addToSet.
 */
function buildImgRefUpdates(
  oldIds: Set<string>,
  newIds: Set<string>,
  docType: string,
  docId: string,
): Promise<unknown>[] {
  const ops: Promise<unknown>[] = [];
  for (const imgId of oldIds) {
    if (!newIds.has(imgId))
      ops.push(Models.Image.updateOne({ _id: imgId }, { $pull: { usedIn: { docType, docId } } }));
  }
  for (const imgId of newIds) {
    if (!oldIds.has(imgId))
      ops.push(Models.Image.updateOne({ _id: imgId }, { $addToSet: { usedIn: { docType, docId } } }));
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Chain CRUD server functions
// All DB/auth/storage logic lives in src/server/. This file is the thin
// boundary that TanStack Start uses to cross the client/server gap.
// ---------------------------------------------------------------------------

/**
 * Applies an immer Patch[] diff to the stored chain contents.
 * If idToken is provided, verifies ownership (or admin). If omitted, the chain
 * must have no owner (anonymous chain).
 * Rejects with status "conflict" if the supplied `edits` count doesn't match the DB.
 */
export const saveChain = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { chainId: string; idToken?: string; patches: Patch[]; edits: number }) => data,
  )
  .handler(async ({ data }): Promise<SaveResult> => {
    await connectToDatabase();

    const chain = await Models.Chain.findById(data.chainId).lean();
    if (!chain) return { status: "not_found" };

    if (data.idToken) {
      const { uid } = await verifyIdToken(data.idToken);
      if (!await isAuthorizedForDoc(uid, chain.ownerUid ?? "")) return { status: "unauthorized" };
    } else if (chain.ownerUid) {
      return { status: "unauthorized" };
    }

    if (chain.edits !== data.edits) return { status: "conflict" };

    let updated: unknown;
    try {
      updated = applyPatches(chain.contents, data.patches);
    } catch {
      return { status: "bad_patches" };
    }
    const updatedName = (updated as { name?: string }).name ?? "";

    const oldImgIds = extractAltFormImgIds(chain.contents);
    const newImgIds = extractAltFormImgIds(updated);
    const chainIdStr = String(chain._id);

    await Promise.all([
      Models.Chain.findByIdAndUpdate(data.chainId, {
        $set: { contents: updated, name: updatedName },
        $inc: { edits: 1 },
      }),
      ...buildImgRefUpdates(oldImgIds, newImgIds, "chain", chainIdStr),
    ]);

    return { status: "ok", edits: chain.edits + 1 };
  });

/**
 * Replaces a chain's contents wholesale — no patch application, no edits check.
 * Used as a fallback when patch application fails due to a desync.
 * If idToken is provided, verifies ownership (or admin). If omitted, the chain
 * must have no owner (anonymous chain).
 */
export const forceReplaceChain = createServerFn({ method: "POST" })
  .inputValidator((data: { chainId: string; idToken?: string; contents: unknown }) => data)
  .handler(async ({ data }): Promise<SaveResult> => {
    await connectToDatabase();
    const chain = await Models.Chain.findById(data.chainId).lean();
    if (!chain) return { status: "not_found" };

    if (data.idToken) {
      const { uid } = await verifyIdToken(data.idToken);
      if (!await isAuthorizedForDoc(uid, chain.ownerUid ?? "")) return { status: "unauthorized" };
    } else if (chain.ownerUid) {
      return { status: "unauthorized" };
    }

    const updatedName = (data.contents as { name?: string }).name ?? "";
    const oldImgIds = extractAltFormImgIds(chain.contents);
    const newImgIds = extractAltFormImgIds(data.contents);
    const chainIdStr = String(chain._id);

    await Promise.all([
      Models.Chain.findByIdAndUpdate(data.chainId, {
        $set: { contents: data.contents, name: updatedName },
        $inc: { edits: 1 },
      }),
      ...buildImgRefUpdates(oldImgIds, newImgIds, "chain", chainIdStr),
    ]);

    return { status: "ok", edits: chain.edits + 1 };
  });

/**
 * Creates a new chain owned by the authenticated user.
 * Accepts already-converted v3.0 contents; the client is responsible for
 * running convertChain on older formats before calling this.
 * Returns the new chain's MongoDB _id for use in navigation.
 */
export const createChain = createServerFn({ method: "POST" })
  .inputValidator((data: { idToken?: string; contents: object; imageIds?: string[] }) => data)
  .handler(async ({ data }) => {
    await connectToDatabase();
    const uid = data.idToken ? (await verifyIdToken(data.idToken)).uid : "";
    const chain = await Models.Chain.create({
      contents: data.contents,
      name: (data.contents as { name?: string }).name ?? "",
      ownerUid: uid,
      publicUid: customAlphabet(alphanumeric, 16)(),
      edits: 0,
      version: "3.0",
    });
    if (data.imageIds?.length) {
      await Models.Image.updateMany(
        { _id: { $in: data.imageIds } },
        { $push: { usedIn: { docType: "chain", docId: String(chain._id) } } },
      );
    }
    return { publicUid: chain.publicUid };
  });

/**
 * Deletes a chain and removes its image references.
 * Requires the caller to be the owner or an admin.
 */
export const deleteChain = createServerFn({ method: "POST" })
  .inputValidator((data: { publicUid: string; idToken: string }) => data)
  .handler(async ({ data }): Promise<{ status: "ok" | "not_found" | "unauthorized" }> => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(data.idToken);
    const chain = await Models.Chain.findOne({ publicUid: data.publicUid }).lean();
    if (!chain) return { status: "not_found" };
    if (!await isAuthorizedForDoc(uid, chain.ownerUid ?? "")) return { status: "unauthorized" };
    const chainIdStr = String(chain._id);
    await Promise.all([
      Models.Chain.findByIdAndDelete(chain._id),
      Models.Image.updateMany(
        { "usedIn.docId": chainIdStr },
        { $pull: { usedIn: { docType: "chain", docId: chainIdStr } } },
      ),
    ]);
    return { status: "ok" };
  });

/**
 * Duplicates a chain, giving the copy a new publicUid and appending " (copy)" to the name.
 * Image usedIn references are updated to include the new chain.
 * Requires the caller to be the owner or an admin.
 */
export const duplicateChain = createServerFn({ method: "POST" })
  .inputValidator((data: { publicUid: string; idToken: string }) => data)
  .handler(async ({ data }): Promise<{ publicUid: string }> => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(data.idToken);
    const chain = await Models.Chain.findOne({ publicUid: data.publicUid }).lean();
    if (!chain) throw new Error("Chain not found");
    if (!await isAuthorizedForDoc(uid, chain.ownerUid ?? "")) throw new Error("Unauthorized");
    const contents = chain.contents as Record<string, unknown>;
    const srcName = (contents.name as string | undefined) ?? "Untitled";
    const newName = `${srcName} (copy)`;
    const newContents = { ...contents, name: newName };
    const newChain = await Models.Chain.create({
      contents: newContents,
      name: newName,
      ownerUid: uid,
      publicUid: customAlphabet(alphanumeric, 16)(),
      edits: 0,
      version: chain.version,
    });
    // Carry over image usedIn references
    const imgIds = [...extractAltFormImgIds(chain.contents)];
    if (imgIds.length > 0) {
      const newIdStr = String(newChain._id);
      await Models.Image.updateMany(
        { _id: { $in: imgIds } },
        { $addToSet: { usedIn: { docType: "chain", docId: newIdStr } } },
      );
    }
    return { publicUid: newChain.publicUid };
  });

export type ChainSummary = {
  _id: string;
  publicUid: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Returns summary metadata for all chains owned by the authenticated user.
 * Accepts a Firebase ID token; never sends full chain contents to the client.
 */
export const listChains = createServerFn({ method: "POST" })
  .inputValidator((idToken: string) => idToken)
  .handler(async ({ data: idToken }): Promise<ChainSummary[]> => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(idToken);
    const chains = await Models.Chain.find(
      { ownerUid: uid },
      { name: 1, publicUid: 1, createdAt: 1, updatedAt: 1 },
    ).lean();
    return chains.map((c) => ({
      _id: String(c._id),
      publicUid: c.publicUid,
      name: (c as { name?: string }).name ?? "Untitled",
      createdAt: (c.createdAt as Date).toISOString(),
      updatedAt: (c.updatedAt as Date).toISOString(),
    }));
  });

/**
 * Loads a chain by its publicUid.
 * If the chain has an ownerUid set, an idToken must be supplied and must
 * belong to the owner or an admin — otherwise throws "Unauthorized".
 * Returns contents, the current edits count (for conflict detection on save),
 * and the internal MongoDB _id (chainMongoId) needed by saveChain.
 */
export const loadChain = createServerFn({ method: "POST" })
  .inputValidator((data: { publicUid: string; idToken?: string }) => data)
  .handler(async ({ data }) => {
    await connectToDatabase();
    const chain = await Models.Chain.findOne({ publicUid: data.publicUid }).lean();
    if (!chain) throw new Error("Chain not found");

    if (chain.ownerUid) {
      if (!data.idToken) throw new Error("Authentication required");
      const { uid } = await verifyIdToken(data.idToken);
      if (!await isAuthorizedForDoc(uid, chain.ownerUid)) throw new Error("Unauthorized");
    }

    return {
      contents: chain.contents,
      edits: chain.edits,
      chainMongoId: String(chain._id),
      ownerUid: chain.ownerUid ?? "",
    };
  });

/**
 * Claims an anonymous chain (ownerUid === "") for the authenticated user.
 * Rejects if the chain already has an owner.
 */
export const claimChain = createServerFn({ method: "POST" })
  .inputValidator((data: { publicUid: string; idToken: string }) => data)
  .handler(async ({ data }): Promise<{ status: "ok" | "already_owned" | "not_found" }> => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(data.idToken);
    const chain = await Models.Chain.findOne({ publicUid: data.publicUid }, { ownerUid: 1 }).lean();
    if (!chain) return { status: "not_found" };
    if (chain.ownerUid) return { status: "already_owned" };
    await Models.Chain.updateOne({ publicUid: data.publicUid }, { $set: { ownerUid: uid } });
    return { status: "ok" };
  });

export async function autosaveChain(): Promise<never> {
  throw new Error("autosaveChain is only available in Electron");
}
