import { createServerFn } from "@tanstack/react-start";
import sharp from "sharp";
import { connectToDatabase, Models } from "@/server/db";
import { verifyIdToken } from "@/server/auth";
import { uploadFile, deleteFile } from "@/server/storage";
import { customAlphabet } from "nanoid";
import { alphanumeric } from "nanoid-dictionary";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImageSummary = {
  _id: string;
  path: string;
  bytes: number;
  uploadType: "native" | "imagechest";
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

/**
 * Resolves a single image _id to its public path/URL.
 * No authentication required — image paths are public.
 * Returns null if the image doesn't exist.
 */
export const getImagePath = createServerFn({ method: "POST" })
  .inputValidator((imgId: string) => imgId)
  .handler(async ({ data: imgId }): Promise<string | null> => {
    await connectToDatabase();
    const img = await Models.Image.findById(imgId, { path: 1 }).lean();
    return img ? (img.path as string) : null;
  });

/**
 * Batch-resolves multiple image _ids to their public paths.
 * No authentication required — image paths are public.
 * Returns a Record<imgId, url> for every id that was found.
 */
export const getImagePaths = createServerFn({ method: "POST" })
  .inputValidator((imgIds: string[]) => imgIds)
  .handler(async ({ data: imgIds }): Promise<Record<string, string>> => {
    if (imgIds.length === 0) return {};
    await connectToDatabase();
    const images = await Models.Image.find({ _id: { $in: imgIds } }, { path: 1 }).lean();
    const result: Record<string, string> = {};
    for (const img of images) result[String(img._id)] = img.path as string;
    return result;
  });

/**
 * Returns all images owned by the authenticated user, newest first.
 */
export const listUserImages = createServerFn({ method: "POST" })
  .inputValidator((idToken: string) => idToken)
  .handler(async ({ data: idToken }): Promise<ImageSummary[]> => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(idToken);

    const images = await Models.Image.find(
      { ownerUid: uid },
      { path: 1, bytes: 1, uploadType: 1, createdAt: 1 },
    )
      .sort({ createdAt: -1 })
      .lean();

    return images.map((img) => ({
      _id: String(img._id),
      path: img.path as string,
      bytes: img.bytes,
      uploadType: img.uploadType as "native" | "imagechest",
      createdAt: (img.createdAt as Date).toISOString(),
    }));
  });

// ---------------------------------------------------------------------------

/**
 * Uploads a native image to Backblaze B2, creates an Image record,
 * and updates the user's imageUsage quota.
 * `fileData` is the image encoded as a base64 string.
 * The image is compressed server-side to PNG (quality 65) before upload.
 */
export const uploadImage = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { idToken: string; fileName: string; fileData: string; bytes: number }) => data,
  )
  .handler(async ({ data }): Promise<ImageSummary> => {
    if (data.bytes > 50 * 1048576)
      throw new Error("File too large. Max size before compression: 50 MB");

    await connectToDatabase();
    const { uid } = await verifyIdToken(data.idToken);

    const raw = Buffer.from(data.fileData, "base64");
    const compressed = await sharp(raw)
      .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
      .avif({ quality: 80 })
      .toBuffer();
    const bytes = compressed.length;

    const user = await Models.User.findOne({ firebaseUid: uid }, { imageUsage: 1 }).lean();
    if (!user) throw new Error("User not found");
    if (user.imageUsage.currentBytes + bytes > user.imageUsage.maxBytes) {
      const limitMb = Math.round(user.imageUsage.maxBytes / 1024 / 1024);
      const usedMb = Math.round(user.imageUsage.currentBytes / 1024 / 1024);
      throw new Error(
        `Image storage quota exceeded (${usedMb} MB used of ${limitMb} MB limit)`,
      );
    }

    const key = `images/${uid}/${customAlphabet(alphanumeric, 16)()}.avif`;
    const { url } = await uploadFile(key, compressed, "image/avif");

    const image = await Models.Image.create({
      ownerUid: uid,
      usedIn: [],
      path: url,
      uploadType: "native",
      backblazeFileId: key,
      bytes,
    });

    await Models.User.updateOne(
      { firebaseUid: uid },
      { $inc: { "imageUsage.currentBytes": bytes } },
    );

    return {
      _id: String(image._id),
      path: url,
      bytes,
      uploadType: "native",
      createdAt: (image.createdAt as Date).toISOString(),
    };
  });

// ---------------------------------------------------------------------------

export type ImageUsedInEntry = {
  docType: "chain" | "jumpdoc";
  docId: string;
  publicUid: string;
  /** Denormalized name for jumpdocs; null for chains (no server-side denormalized name). */
  name: string | null;
};

/**
 * Returns the documents that reference a given image.
 * Requires ownership — returns [] if the image isn't found or not owned by the caller.
 * Projects only publicUid + name (for jumpdocs); never fetches chain contents.
 */
export const getImageUsedIn = createServerFn({ method: "POST" })
  .inputValidator((data: { idToken: string; imageId: string }) => data)
  .handler(async ({ data }): Promise<ImageUsedInEntry[]> => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(data.idToken);

    const image = await Models.Image.findById(data.imageId, { ownerUid: 1, usedIn: 1 }).lean();
    if (!image || image.ownerUid !== uid) return [];

    const usedIn = (image.usedIn ?? []) as Array<{ docType: string; docId: string }>;
    if (usedIn.length === 0) return [];

    const jumpDocIds = usedIn.filter((e) => e.docType === "jumpdoc").map((e) => e.docId);
    const chainIds = usedIn.filter((e) => e.docType === "chain").map((e) => e.docId);

    const [jumpDocs, chains] = await Promise.all([
      jumpDocIds.length > 0
        ? Models.JumpDoc.find({ _id: { $in: jumpDocIds } }, { publicUid: 1, name: 1 }).lean()
        : [],
      chainIds.length > 0
        ? Models.Chain.find({ _id: { $in: chainIds } }, { publicUid: 1, name: 1 }).lean()
        : [],
    ]);

    const jumpDocMap = new Map(jumpDocs.map((d) => [String(d._id), d]));
    const chainMap = new Map(chains.map((d) => [String(d._id), d]));

    return usedIn.map((e) => {
      if (e.docType === "jumpdoc") {
        const doc = jumpDocMap.get(e.docId);
        return { docType: "jumpdoc", docId: e.docId, publicUid: doc?.publicUid ?? "", name: doc?.name ?? null };
      } else {
        const doc = chainMap.get(e.docId);
        return { docType: "chain", docId: e.docId, publicUid: doc?.publicUid ?? "", name: (doc as { name?: string } | undefined)?.name ?? null };
      }
    });
  });

// ---------------------------------------------------------------------------

/**
 * Uploads an image to ImgChest as a hidden post using the user's stored API key.
 * ImgChest images are not counted against the user's imageUsage quota.
 * `fileData` is the image encoded as a base64 string.
 */
export const uploadImgChestImage = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { idToken: string; fileName: string; fileData: string; bytes: number }) => data,
  )
  .handler(async ({ data }): Promise<ImageSummary> => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(data.idToken);

    const user = await Models.User.findOne({ firebaseUid: uid }).lean();
    const apiKey = (user?.apiKeys as Record<string, string> | undefined)?.["imgChest"];
    if (!apiKey) throw new Error("No ImgChest API key configured");

    const fileBuffer = Buffer.from(data.fileData, "base64");
    const formData = new FormData();
    formData.append("privacy", "hidden");
    formData.append("nsfw", "true");
    formData.append("images[]", new Blob([fileBuffer]), data.fileName);

    const response = await fetch("https://api.imgchest.com/v1/post", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ImgChest upload failed (${response.status}): ${text}`);
    }

    const json = (await response.json()) as {
      data: { id: string; delete_url?: string; images: { link: string }[] };
    };
    const postId = json.data.id;
    const deleteURL = json.data.delete_url ?? "";
    const imageUrl = json.data.images[0]?.link;
    if (!imageUrl) throw new Error("ImgChest returned no image URL");

    const image = await Models.Image.create({
      ownerUid: uid,
      usedIn: [],
      path: imageUrl,
      uploadType: "imagechest",
      imageChestParameters: { postId, deleteURL },
      bytes: data.bytes,
    });

    return {
      _id: String(image._id),
      path: imageUrl,
      bytes: data.bytes,
      uploadType: "imagechest",
      createdAt: (image.createdAt as Date).toISOString(),
    };
  });

// ---------------------------------------------------------------------------

export type DeleteImageResult =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "unauthorized" };

/**
 * Deletes an image by its MongoDB _id.
 * For native images: removes the file from Backblaze B2 and decrements imageUsage.
 * For ImgChest images: deletes the remote post via ImgChest's API.
 */
export const deleteImage = createServerFn({ method: "POST" })
  .inputValidator((data: { idToken: string; imageId: string }) => data)
  .handler(async ({ data }): Promise<DeleteImageResult> => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(data.idToken);

    const image = await Models.Image.findById(data.imageId).lean();
    if (!image) return { status: "not_found" };
    if (image.ownerUid !== uid) return { status: "unauthorized" };

    if (image.uploadType === "native") {
      if (image.backblazeFileId) {
        await deleteFile(image.backblazeFileId);
      }
      await Models.User.updateOne(
        { firebaseUid: uid },
        { $inc: { "imageUsage.currentBytes": -image.bytes } },
      );
    } else {
      const params = image.imageChestParameters as
        | { postId?: string; deleteURL?: string }
        | undefined;
      const postId = params?.postId;
      if (postId) {
        const user = await Models.User.findOne({ firebaseUid: uid }).lean();
        const apiKey = (user?.apiKeys as Record<string, string> | undefined)?.["imgChest"];
        if (apiKey) {
          await fetch(`https://api.imgchest.com/v1/post/${postId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${apiKey}` },
          }).catch(() => {
            console.warn(`ImgChest DELETE failed for post ${postId}`);
          });
        }
      }
    }

    await Models.Image.findByIdAndDelete(data.imageId);

    return { status: "ok" };
  });

/**
 * Removes an ImgChest image record from the database without touching the remote post.
 * Only valid for imagechest uploadType images owned by the caller.
 */
export const unlinkImage = createServerFn({ method: "POST" })
  .inputValidator((data: { idToken: string; imageId: string }) => data)
  .handler(async ({ data }): Promise<DeleteImageResult> => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(data.idToken);

    const image = await Models.Image.findById(data.imageId).lean();
    if (!image) return { status: "not_found" };
    if (image.ownerUid !== uid) return { status: "unauthorized" };
    if (image.uploadType !== "imagechest") return { status: "not_found" };

    await Models.Image.findByIdAndDelete(data.imageId);
    return { status: "ok" };
  });
