import { createServerFn } from "@tanstack/react-start";
import { applyPatches, enablePatches, type Patch } from "immer";
import mongoose from "mongoose";
import AdmZip from "adm-zip";
import sharp from "sharp";
import { connectToDatabase, Models } from "@/server/db";
import { verifyIdToken } from "@/server/auth";
import { syncJumpDocPurchases } from "@/server/purchases";
import { uploadFile, deleteFile } from "@/server/storage";
import { compressPdf } from "@/server/pdf";
import { type SaveResult } from "@/api/types";
import { customAlphabet } from "nanoid";
import { alphanumeric } from "nanoid-dictionary";
import { parseJumpDocQuery, type JumpDocSearchField } from "@/utilities/SearchUtilities";
import { isAuthorizedForDoc, escapeRegex } from "@/api/_helpers";

export type { SaveResult, SaveStatus } from "@/api/types";

enablePatches();

// ---------------------------------------------------------------------------
// JumpDoc CRUD server functions
// ---------------------------------------------------------------------------

/**
 * Applies an immer Patch[] diff to the stored jumpdoc contents.
 * Requires a Firebase ID token; rejects if the caller is not the owner or an admin.
 * Rejects with status "conflict" if the supplied `edits` count doesn't match the DB.
 * `docMongoId` is the MongoDB _id (returned by loadJumpDoc), not the publicUid.
 */
export const saveJumpDoc = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { docMongoId: string; idToken: string; patches: Patch[]; edits: number }) => data,
  )
  .handler(async ({ data }): Promise<SaveResult> => {
    await connectToDatabase();

    const { uid } = await verifyIdToken(data.idToken);

    const doc = await Models.JumpDoc.findById(data.docMongoId).lean();
    if (!doc) return { status: "not_found" };

    if (!(await isAuthorizedForDoc(uid, doc.ownerUid))) return { status: "unauthorized" };

    if (doc.edits !== data.edits) return { status: "conflict" };

    let updated: unknown;
    try {
      updated = applyPatches(doc.contents, data.patches);
    } catch {
      return { status: "bad_patches" };
    }
    const updatedContents = updated as { name?: string; author?: string };
    const updatedName = updatedContents.name ?? "";
    const updatedAuthor = (updatedContents.author ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await Models.JumpDoc.findByIdAndUpdate(
      data.docMongoId,
      { $set: { contents: updated, name: updatedName, author: updatedAuthor }, $inc: { edits: 1 } },
      { strict: false },
    );
    await syncJumpDocPurchases(doc.publicUid, updatedName, doc.published, updated as never);

    return { status: "ok", edits: doc.edits + 1 };
  });

/**
 * Deletes a JumpDoc, its PDF (from DB and Backblaze B2), and updates the owner's
 * pdfUsage quota. Also removes the cover image's usedIn reference if set.
 * Requires the caller to be the owner or an admin.
 */
export const deleteJumpDoc = createServerFn({ method: "POST" })
  .inputValidator((data: { publicUid: string; idToken: string }) => data)
  .handler(async ({ data }): Promise<{ status: "ok" | "not_found" | "unauthorized" }> => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(data.idToken);
    const doc = await Models.JumpDoc.findOne({ publicUid: data.publicUid }).lean();
    if (!doc) return { status: "not_found" };
    if (!(await isAuthorizedForDoc(uid, doc.ownerUid))) return { status: "unauthorized" };
    const docIdStr = String(doc._id);
    const pdf = await Models.PDF.findOne({ usedInDocId: docIdStr }).lean();
    const ops: Promise<unknown>[] = [
      Models.JumpDoc.findByIdAndDelete(doc._id),
      Models.Purchase.deleteMany({ docId: data.publicUid }),
    ];
    if (pdf) {
      ops.push(Models.PDF.findByIdAndDelete(pdf._id));
      if (pdf.backblazeFileId) ops.push(deleteFile(pdf.backblazeFileId));
      ops.push(
        Models.User.updateOne(
          { firebaseUid: uid },
          { $inc: { "pdfUsage.currentBytes": -pdf.bytes } },
        ),
      );
    }
    if (doc.imageId) {
      ops.push(
        Models.Image.updateOne(
          { _id: doc.imageId },
          { $pull: { usedIn: { docType: "jumpdoc", docId: docIdStr } } },
        ),
      );
    }
    await Promise.all(ops);
    return { status: "ok" };
  });

/**
 * Replaces a JumpDoc's contents wholesale — no patch application, no edits check.
 * Used as a fallback when patch application fails due to a desync.
 * Requires the caller to be the owner or an admin.
 */
export const forceReplaceJumpDoc = createServerFn({ method: "POST" })
  .inputValidator((data: { docMongoId: string; idToken: string; contents: unknown }) => data)
  .handler(async ({ data }): Promise<SaveResult> => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(data.idToken);
    const doc = await Models.JumpDoc.findById(data.docMongoId).lean();
    if (!doc) return { status: "not_found" };
    if (!(await isAuthorizedForDoc(uid, doc.ownerUid))) return { status: "unauthorized" };
    const contents = data.contents as { name?: string; author?: string };
    const updatedName = contents.name ?? "";
    const updatedAuthor = (contents.author ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await Models.JumpDoc.findByIdAndUpdate(
      data.docMongoId,
      {
        $set: { contents: data.contents, name: updatedName, author: updatedAuthor },
        $inc: { edits: 1 },
      },
      { strict: false },
    );
    await syncJumpDocPurchases(doc.publicUid, updatedName, doc.published, data.contents as never);
    return { status: "ok", edits: doc.edits + 1 };
  });

export type JumpDocAttributes = {
  genre: string[];
  medium: string[];
  franchise: string[];
  // supernaturalElements: string[];
};

export type JumpDocSummary = {
  _id: string;
  publicUid: string;
  name: string;
  /** Denormalized from contents.author — split on comma and trimmed. */
  author: string[];
  createdAt: string;
  updatedAt: string;
  published: boolean;
  nsfw: boolean;
  /** Public URL of the cover image, if one has been set. */
  imageUrl?: string;
  attributes: JumpDocAttributes;
  /** True when the requesting user owns this doc (only set when idToken is provided). */
  isOwner?: boolean;
};

// Loose type that covers all the lean Mongoose shapes returned by JumpDoc queries.
type RawJumpDoc = {
  _id: unknown;
  publicUid: string;
  name?: string;
  author?: string[];
  published?: boolean;
  nsfw?: boolean;
  imageId?: string;
  createdAt: unknown;
  updatedAt: unknown;
  attributes?: { genre?: string[]; medium?: string[]; franchise?: string[] };
  ownerUid?: string;
};

/**
 * Maps a raw Mongoose JumpDoc to the JumpDocSummary wire type.
 * Pass `published: true` to hard-code the published flag (for gallery endpoints).
 * Pass `callerUid` to include the `isOwner` field; null omits it.
 */
function mapJumpDocSummary(
  d: RawJumpDoc,
  imageUrl: string | undefined,
  callerUid: string | null,
  published?: boolean,
): JumpDocSummary {
  return {
    _id: String(d._id),
    publicUid: d.publicUid,
    name: d.name ?? "Untitled",
    author: d.author ?? [],
    published: published ?? d.published ?? false,
    nsfw: d.nsfw ?? false,
    createdAt: (d.createdAt as Date).toISOString(),
    updatedAt: (d.updatedAt as Date).toISOString(),
    attributes: {
      genre: d.attributes?.genre ?? [],
      medium: d.attributes?.medium ?? [],
      franchise: d.attributes?.franchise ?? [],
      // supernaturalElements: d.attributes?.supernaturalElements ?? [],
    },
    ...(imageUrl ? { imageUrl } : {}),
    ...(callerUid !== null ? { isOwner: d.ownerUid === callerUid } : {}),
  };
}

/**
 * Returns summary metadata for all jumpdocs owned by the authenticated user.
 * Accepts a Firebase ID token; never sends full jumpdoc contents to the client.
 */
export const listJumpDocs = createServerFn({ method: "POST" })
  .inputValidator((idToken: string) => idToken)
  .handler(async ({ data: idToken }): Promise<JumpDocSummary[]> => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(idToken);
    const docs = await Models.JumpDoc.find(
      { ownerUid: uid },
      {
        name: 1,
        author: 1,
        publicUid: 1,
        imageId: 1,
        published: 1,
        nsfw: 1,
        attributes: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    ).lean();

    // Batch-fetch cover image paths for docs that have an imageId.
    const imageIds = docs.map((d) => d.imageId).filter(Boolean) as string[];
    const images =
      imageIds.length > 0
        ? await Models.Image.find({ _id: { $in: imageIds } }, { path: 1 }).lean()
        : [];
    const imagePathById = new Map(images.map((img) => [String(img._id), img.path as string]));

    return docs.map((d) =>
      mapJumpDocSummary(
        d as RawJumpDoc,
        d.imageId ? imagePathById.get(d.imageId) : undefined,
        null,
      ),
    );
  });

export type JumpDocGalleryParams = {
  page: number;
  pageSize: number;
  sortKey: "name" | "updatedAt" | "createdAt";
  sortDir: "asc" | "desc";
  /** Raw query string — see parseJumpDocQuery for syntax. */
  search?: string;
  /** Optional Firebase ID token — when provided, each doc includes isOwner. */
  idToken?: string;
  /** When true, include NSFW docs in results. Defaults to false. */
  showNsfw?: boolean;
};

export type JumpDocGalleryPage = {
  docs: JumpDocSummary[];
  total: number;
};

// ---------------------------------------------------------------------------
// Search filter helpers for listPublishedJumpDocs
// ---------------------------------------------------------------------------

const FIELD_TO_MONGO: Record<Exclude<JumpDocSearchField, "any">, string> = {
  name: "name",
  author: "author",
  franchise: "attributes.franchise",
  genre: "attributes.genre",
  medium: "attributes.medium",
  element: "attributes.supernaturalElements",
};

/**
 * Builds a MongoDB filter from a parsed JumpDoc query.
 * Bare-word (any) tokens are ORed; field-specific tokens are ANDed.
 */
function buildSearchFilter(search: string): object {
  if (!search.trim()) return {};

  const tokens = parseJumpDocQuery(search);
  if (tokens.length === 0) return {};

  const anyTokens = tokens.filter((t) => t.field === "any");
  const specificTokens = tokens.filter((t) => t.field !== "any");

  const andClauses: object[] = [];

  // Bare words: any one must match name, author, or franchise
  if (anyTokens.length > 0) {
    const orClauses = anyTokens.flatMap((t) => {
      const re = new RegExp(escapeRegex(t.term), "i");
      return [{ name: re }, { author: re }, { "attributes.franchise": re }];
    });
    andClauses.push({ $or: orClauses });
  }

  // Field-specific tokens: each must match
  for (const t of specificTokens) {
    const re = t.exact
      ? new RegExp(`^${escapeRegex(t.term)}$`, "i")
      : new RegExp(escapeRegex(t.term), "i");
    const field = FIELD_TO_MONGO[t.field as Exclude<JumpDocSearchField, "any">];
    andClauses.push({ [field]: re });
  }

  return andClauses.length === 1 ? andClauses[0] : { $and: andClauses };
}

/**
 * Returns a paginated, sorted page of published jumpdocs.
 * No authentication required — only docs with `published: true` are returned.
 */
export const listPublishedJumpDocs = createServerFn({ method: "POST" })
  .inputValidator((data: JumpDocGalleryParams) => data)
  .handler(async ({ data }): Promise<JumpDocGalleryPage> => {
    await connectToDatabase();

    let callerUid: string | null = null;
    if (data.idToken) {
      try {
        const { uid } = await verifyIdToken(data.idToken);
        callerUid = uid;
      } catch {
        // Invalid token — treat as unauthenticated
      }
    }

    const mongoSortDir = data.sortDir === "asc" ? 1 : -1;
    const skip = (data.page - 1) * data.pageSize;
    const searchFilter = buildSearchFilter(data.search ?? "");
    const nsfwFilter = data.showNsfw ? {} : { nsfw: { $ne: true } };
    const filter = { published: true, ...nsfwFilter, ...searchFilter };

    const projection = callerUid
      ? {
          name: 1,
          author: 1,
          publicUid: 1,
          imageId: 1,
          nsfw: 1,
          attributes: 1,
          createdAt: 1,
          updatedAt: 1,
          ownerUid: 1,
        }
      : {
          name: 1,
          author: 1,
          publicUid: 1,
          imageId: 1,
          nsfw: 1,
          attributes: 1,
          createdAt: 1,
          updatedAt: 1,
        };

    const [docs, total] = await Promise.all([
      Models.JumpDoc.find(filter, projection)
        .sort({ [data.sortKey]: mongoSortDir })
        .skip(skip)
        .limit(data.pageSize)
        .lean(),
      Models.JumpDoc.countDocuments(filter),
    ]);

    const imageIds = docs.map((d) => d.imageId).filter(Boolean) as string[];
    const images =
      imageIds.length > 0
        ? await Models.Image.find({ _id: { $in: imageIds } }, { path: 1 }).lean()
        : [];
    const imagePathById = new Map(images.map((img) => [String(img._id), img.path as string]));

    return {
      total,
      docs: docs.map((d) =>
        mapJumpDocSummary(
          d as RawJumpDoc,
          d.imageId ? imagePathById.get(d.imageId) : undefined,
          callerUid,
          true,
        ),
      ),
    };
  });

/**
 * Returns summary metadata for a single published JumpDoc by its publicUid.
 * Accepts an optional idToken to determine ownership.
 */
export const getPublishedJumpDocSummary = createServerFn({ method: "POST" })
  .inputValidator((data: { publicUid: string; idToken?: string }) => data)
  .handler(async ({ data }): Promise<JumpDocSummary | null> => {
    await connectToDatabase();
    const doc = await Models.JumpDoc.findOne(
      { publicUid: data.publicUid, published: true, nsfw: { $ne: true } },
      {
        name: 1,
        author: 1,
        publicUid: 1,
        imageId: 1,
        nsfw: 1,
        attributes: 1,
        createdAt: 1,
        updatedAt: 1,
        ownerUid: 1,
      },
    ).lean();
    if (!doc) return null;
    let callerUid: string | null = null;
    if (data.idToken) {
      try {
        callerUid = (await verifyIdToken(data.idToken)).uid;
      } catch {}
    }
    const imageUrl = doc.imageId
      ? await Models.Image.findOne({ _id: doc.imageId }, { path: 1 })
          .lean()
          .then((img) => img?.path as string | undefined)
      : undefined;
    return mapJumpDocSummary(doc as RawJumpDoc, imageUrl, callerUid, true);
  });

/**
 * Loads a jumpdoc by its publicUid.
 * If the doc has an ownerUid, an idToken must be supplied matching the owner or an admin.
 * Returns contents, edits count, and the internal MongoDB _id (docMongoId) for saves.
 */
export const loadJumpDoc = createServerFn({ method: "POST" })
  .inputValidator((data: { publicUid: string; idToken?: string }) => data)
  .handler(async ({ data }) => {
    await connectToDatabase();
    const doc = await Models.JumpDoc.findOne({ publicUid: data.publicUid }).lean();
    if (!doc) throw new Error("JumpDoc not found");

    // Published docs are public — no auth required.
    // Unpublished docs require the caller to be the owner or an admin.
    if (doc.ownerUid && !doc.published) {
      if (!data.idToken) throw new Error("Authentication required");
      const { uid } = await verifyIdToken(data.idToken);
      if (!(await isAuthorizedForDoc(uid, doc.ownerUid))) throw new Error("Unauthorized");
    }

    // Fetch cover image URL if the doc has one
    let imageUrl: string | null = null;
    if (doc.imageId) {
      const img = await Models.Image.findById(doc.imageId, { path: 1 }).lean();
      imageUrl = img ? (img.path as string) : null;
    }

    return {
      contents: doc.contents,
      edits: doc.edits,
      docMongoId: String(doc._id),
      published: doc.published ?? false,
      nsfw: (doc as { nsfw?: boolean }).nsfw ?? false,
      attributes: doc.attributes ?? {
        genre: [],
        medium: [],
        franchise: [],
        // supernaturalElements: [],
      },
      imageId: (doc.imageId as string | undefined) ?? null,
      imageUrl,
    };
  });

export type JumpDocPublishInput = {
  docMongoId: string;
  idToken: string;
  published: boolean;
  nsfw: boolean;
  attributes: {
    genre: string[];
    medium: string[];
    franchise: string[];
    supernaturalElements: string[];
  };
  imageId: string | null;
};

/**
 * Sets the published flag and metadata attributes on a JumpDoc.
 * Requires the caller to be the owner or an admin.
 */
export const publishJumpDoc = createServerFn({ method: "POST" })
  .inputValidator((data: JumpDocPublishInput) => data)
  .handler(
    async ({
      data,
    }): Promise<{ status: "ok" } | { status: "unauthorized" } | { status: "not_found" }> => {
      await connectToDatabase();

      const { uid } = await verifyIdToken(data.idToken);

      const doc = await Models.JumpDoc.findById(data.docMongoId).lean();
      if (!doc) return { status: "not_found" };

      if (!(await isAuthorizedForDoc(uid, doc.ownerUid))) return { status: "unauthorized" };

      const oldImageId = (doc.imageId as string | undefined) ?? null;
      const newImageId = data.imageId ?? null;

      const updates: Promise<unknown>[] = [
        Models.JumpDoc.findByIdAndUpdate(data.docMongoId, {
          $set: {
            published: data.published,
            nsfw: data.nsfw,
            attributes: data.attributes,
            imageId: newImageId,
          },
        }),
        ...(doc.published !== data.published
          ? [
              Models.Purchase.updateMany(
                { docId: doc.publicUid },
                { $set: { published: data.published } },
              ),
            ]
          : []),
      ];

      if (oldImageId !== newImageId) {
        const docIdStr = String(doc._id);
        if (oldImageId) {
          updates.push(
            Models.Image.updateOne(
              { _id: oldImageId },
              { $pull: { usedIn: { docType: "jumpdoc", docId: docIdStr } } },
            ),
          );
        }
        if (newImageId) {
          updates.push(
            Models.Image.updateOne(
              { _id: newImageId },
              { $addToSet: { usedIn: { docType: "jumpdoc", docId: docIdStr } } },
            ),
          );
        }
      }

      await Promise.all(updates);

      return { status: "ok" };
    },
  );

/**
 * Creates a new JumpDoc from an uploaded PDF.
 * Checks the user's pdfUsage quota, uploads the file to Backblaze B2,
 * creates the PDF and JumpDoc records, links them, and updates the quota.
 * `fileData` is the PDF encoded as a base64 string.
 */
export const createJumpDoc = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { idToken: string; fileName: string; fileData: string; bytes: number }) => data,
  )
  .handler(async ({ data }): Promise<{ publicUid: string }> => {
    if (data.bytes > 10 * 1048576)
      throw new Error(`PDF is too large to upload (max 10 MB before compression).`);

    await connectToDatabase();

    const { uid } = await verifyIdToken(data.idToken);

    const rawBuffer = Buffer.from(data.fileData, "base64");
    const buffer = await compressPdf(rawBuffer);
    const pdfBytes = buffer.length;

    // Check PDF storage quota
    const user = await Models.User.findOne({ firebaseUid: uid }, { pdfUsage: 1 }).lean();
    if (!user) throw new Error("User not found");
    if (user.pdfUsage.currentBytes + pdfBytes > user.pdfUsage.maxBytes) {
      const limitMb = Math.round(user.pdfUsage.maxBytes / 1024 / 1024);
      const usedMb = Math.round(user.pdfUsage.currentBytes / 1024 / 1024);
      throw new Error(`PDF storage quota exceeded (${usedMb} MB used of ${limitMb} MB limit)`);
    }

    // Upload to Backblaze B2
    const key = `pdfs/${uid}/${customAlphabet(alphanumeric, 16)()}.pdf`;
    const { url } = await uploadFile(key, buffer, "application/pdf");

    // Pre-generate the PDF ObjectId so JumpDoc can reference it before creation
    const pdfObjId = new mongoose.Types.ObjectId();

    const name = data.fileName.replace(/\.pdf$/i, "");
    const contents = {
      name,
      url,
      author: "",
      duration: { days: 0, months: 0, years: 10 },
      // Age and Gender are single-line (free-form); Location and Origin are multi-choice.
      // Origin has providesDiscounts so perks can be origin-locked.
      originCategories: {
        fId: 4,
        O: {
          0: { name: "Age", singleLine: true, multiple: false, options: [] },
          1: { name: "Gender", singleLine: true, multiple: false, options: [] },
          2: { name: "Location", singleLine: false, multiple: false },
          3: { name: "Origin", singleLine: false, multiple: false, providesDiscounts: true },
        },
      },
      origins: { fId: 0, O: {} },
      // CP currency with a 1000-point budget.
      currencies: {
        fId: 1,
        O: {
          0: {
            name: "CP",
            abbrev: "CP",
            budget: 1000,
            essential: true,
            discountFreeThreshold: 100,
          },
        },
      },
      // Perks (type 0 = PurchaseType.Perk) and Items (type 1 = PurchaseType.Item).
      // defaultCurrency 0 refers to CP above.
      purchaseSubtypes: {
        fId: 2,
        O: {
          0: {
            name: "Perk",
            stipend: [],
            type: 0,
            essential: true,
            allowSubpurchases: false,
            placement: "normal",
            defaultCurrency: 0,
          },
          1: {
            name: "Item",
            stipend: [],
            type: 1,
            essential: true,
            allowSubpurchases: false,
            placement: "normal",
            defaultCurrency: 0,
          },
        },
      },
      availableCurrencyExchanges: [],
      availablePurchases: { fId: 0, O: {} },
      availableCompanions: { fId: 0, O: {} },
      availableDrawbacks: { fId: 0, O: {} },
      availableScenarios: { fId: 0, O: {} },
    };

    const jumpdoc = await Models.JumpDoc.create({
      contents,
      name,
      ownerUid: uid,
      publicUid: customAlphabet(alphanumeric, 16)(),
      pdf: String(pdfObjId),
      edits: 0,
      version: "1.0",
    });

    await Models.PDF.create({
      _id: pdfObjId,
      ownerUid: uid,
      usedInDocId: String(jumpdoc._id),
      path: url,
      backblazeFileId: key,
      bytes: pdfBytes,
    });

    await Models.User.updateOne(
      { firebaseUid: uid },
      { $inc: { "pdfUsage.currentBytes": pdfBytes } },
    );

    return { publicUid: jumpdoc.publicUid };
  });

/**
 * Returns the B2 PDF URL for a jumpdoc so the client can download it directly.
 * No auth required — assumes the caller has knowledge of the publicUid.
 */
export const getJumpDocPdfUrl = createServerFn({ method: "POST" })
  .inputValidator((data: { publicUid: string }) => data)
  .handler(async ({ data }) => {
    await connectToDatabase();
    const doc = await Models.JumpDoc.findOne(
      { publicUid: data.publicUid },
      { name: 1, pdf: 1 },
    ).lean();
    if (!doc) throw new Error("Not found");
    const pdf = await Models.PDF.findById(doc.pdf, { path: 1 }).lean();
    return { pdfUrl: (pdf?.path as string) ?? null, name: (doc.name as string) ?? "Untitled" };
  });

/**
 * Builds a .jumpdoc zip (data.json + meta.json + pdf.pdf + optional thumb) and
 * returns it as a base64 string. The PDF is fetched from B2 server-side.
 */
export const buildJumpDocZip = createServerFn({ method: "POST" })
  .inputValidator((data: { publicUid: string }) => data)
  .handler(async ({ data }) => {
    await connectToDatabase();
    const doc = await Models.JumpDoc.findOne({ publicUid: data.publicUid }).lean();
    if (!doc) throw new Error("Not found");

    const pdf = await Models.PDF.findById(doc.pdf, { path: 1 }).lean();
    if (!pdf?.path) throw new Error("PDF not found");

    const [pdfRes, imageDoc] = await Promise.all([
      fetch(pdf.path as string),
      doc.imageId ? Models.Image.findById(doc.imageId, { path: 1 }).lean() : Promise.resolve(null),
    ]);
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

    const name = (doc.name as string) ?? "Untitled";
    const meta = { name, author: doc.author ?? [], version: "1.0" };

    const zip = new AdmZip();
    zip.addFile("data.json", Buffer.from(JSON.stringify(doc.contents, null, 2), "utf-8"));
    zip.addFile("meta.json", Buffer.from(JSON.stringify(meta, null, 2), "utf-8"));
    zip.addFile("pdf.pdf", pdfBuffer);

    if (imageDoc?.path) {
      const imgRes = await fetch(imageDoc.path as string);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      const ext = (imageDoc.path as string).split(".").pop() ?? "jpg";
      zip.addFile(`thumb.${ext}`, imgBuffer);
    }

    return { zipBase64: zip.toBuffer().toString("base64"), name };
  });

/**
 * Imports a .jumpdoc zip uploaded by the user.
 * Extracts data.json (contents), meta.json (name/attributes/nsfw), and re-uploads
 * the PDF to B2 under the caller's quota. Thumbnail is uploaded best-effort.
 * The resulting JumpDoc is unpublished so the user can review before publishing.
 */
export const importJumpDoc = createServerFn({ method: "POST" })
  .inputValidator((data: { idToken: string; zipBase64: string }) => data)
  .handler(async ({ data }): Promise<{ publicUid: string }> => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(data.idToken);

    const zip = new AdmZip(Buffer.from(data.zipBase64, "base64"));

    const dataEntry = zip.getEntry("data.json");
    const pdfEntry = zip.getEntry("pdf.pdf");
    if (!dataEntry || !pdfEntry)
      throw new Error("Invalid .jumpdoc file: missing data.json or pdf.pdf");

    const contents = JSON.parse(dataEntry.getData().toString("utf-8")) as Record<string, unknown>;
    const meta = zip.getEntry("meta.json")
      ? (JSON.parse(zip.getEntry("meta.json")!.getData().toString("utf-8")) as Record<
          string,
          unknown
        >)
      : {};

    const name = (meta.name ?? contents.name ?? "Untitled") as string;
    const attributes = (meta.attributes as Record<string, string[]> | undefined) ?? {
      genre: [],
      medium: [],
      franchise: [],
      // supernaturalElements: [],
    };
    const nsfw = (meta.nsfw as boolean | undefined) ?? false;

    // Compress then upload PDF under the caller's quota.
    const rawPdfBuffer = pdfEntry.getData();
    const pdfBuffer = await compressPdf(rawPdfBuffer);
    const pdfBytes = pdfBuffer.length;
    const user = await Models.User.findOne({ firebaseUid: uid }, { pdfUsage: 1 }).lean();
    if (!user) throw new Error("User not found");
    if (user.pdfUsage.currentBytes + pdfBytes > user.pdfUsage.maxBytes) {
      const limitMb = Math.round(user.pdfUsage.maxBytes / 1024 / 1024);
      throw new Error(`PDF storage quota exceeded (limit: ${limitMb} MB)`);
    }
    const pdfKey = `pdfs/${uid}/${customAlphabet(alphanumeric, 16)()}.pdf`;
    const { url: pdfUrl } = await uploadFile(pdfKey, pdfBuffer, "application/pdf");
    contents.url = pdfUrl;

    // Upload thumbnail best-effort.
    let imageId: string | null = null;
    const thumbEntry = zip.getEntries().find((e) => e.entryName.startsWith("thumb."));
    if (thumbEntry) {
      try {
        const compressed = await sharp(thumbEntry.getData())
          .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
          .avif({ quality: 65 })
          .toBuffer();
        const imgUser = await Models.User.findOne({ firebaseUid: uid }, { imageUsage: 1 }).lean();
        if (
          imgUser &&
          imgUser.imageUsage.currentBytes + compressed.length <= imgUser.imageUsage.maxBytes
        ) {
          const imgKey = `images/${uid}/${customAlphabet(alphanumeric, 16)()}.avif`;
          const { url } = await uploadFile(imgKey, compressed, "image/avif");
          const imgDoc = await Models.Image.create({
            ownerUid: uid,
            usedIn: [],
            path: url,
            uploadType: "native",
            backblazeFileId: imgKey,
            bytes: compressed.length,
          });
          await Models.User.updateOne(
            { firebaseUid: uid },
            { $inc: { "imageUsage.currentBytes": compressed.length } },
          );
          imageId = String(imgDoc._id);
        }
      } catch {
        // Best-effort — don't fail the import if thumb upload fails.
      }
    }

    const pdfObjId = new mongoose.Types.ObjectId();
    const jumpdoc = await Models.JumpDoc.create({
      contents,
      name,
      author: ((contents.author as string) ?? "").split(",").map((s) => s.trim()),
      ownerUid: uid,
      publicUid: customAlphabet(alphanumeric, 16)(),
      pdf: String(pdfObjId),
      edits: 0,
      version: "1.0",
      published: false,
      nsfw,
      attributes,
      ...(imageId ? { imageId } : {}),
    });

    await Models.PDF.create({
      _id: pdfObjId,
      ownerUid: uid,
      usedInDocId: String(jumpdoc._id),
      path: pdfUrl,
      backblazeFileId: pdfKey,
      bytes: pdfBytes,
    });
    await Models.User.updateOne(
      { firebaseUid: uid },
      { $inc: { "pdfUsage.currentBytes": pdfBytes } },
    );

    if (imageId) {
      await Models.Image.updateOne(
        { _id: imageId },
        { $push: { usedIn: { docType: "jumpdoc", docId: String(jumpdoc._id) } } },
      );
    }

    return { publicUid: jumpdoc.publicUid as string };
  });

// On web, handleAutoSave calls handleSave() directly — this stub is never invoked.
export async function autosaveJumpDoc(): Promise<never> {
  throw new Error("autosaveJumpDoc is only available in Electron");
}
