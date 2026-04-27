import { createServerFn } from "@tanstack/react-start";
import { connectToDatabase, Models } from "@/server/db";
import { verifyIdToken } from "@/server/auth";

export type ConversationSummary = {
  salientJumpDocUid: string;
  updatedAt: string;
  jumpDocName: string;
  jumpDocImageUrl: string | null;
  hasUnread: boolean;
};

export const getUnreadCount = createServerFn({ method: "POST" })
  .inputValidator((data: { idToken: string }) => data)
  .handler(async ({ data }): Promise<number> => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(data.idToken);
    return Models.Conversation.countDocuments({
      participants: uid,
      read: { $elemMatch: { userUid: uid, caughtUp: false } },
    });
  });

export const listConversations = createServerFn({ method: "POST" })
  .inputValidator((data: { idToken: string }) => data)
  .handler(async ({ data }): Promise<ConversationSummary[]> => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(data.idToken);

    const convs = await Models.Conversation.find({ participants: uid })
      .sort({ updatedAt: -1 })
      .lean();

    if (convs.length === 0) return [];

    const docUids = convs.map((c) => c.salientJumpDocUid);
    const docs = await Models.JumpDoc.find(
      { publicUid: { $in: docUids } },
      { publicUid: 1, name: 1, imageId: 1 },
    ).lean();

    const imageIds = docs.flatMap((d) => (d.imageId ? [String(d.imageId)] : []));
    const images =
      imageIds.length > 0
        ? await Models.Image.find({ _id: { $in: imageIds } }, { path: 1 }).lean()
        : [];

    const imagePathById = new Map(images.map((img) => [String(img._id), img.path as string]));
    const docByUid = new Map(docs.map((d) => [d.publicUid, d]));

    return convs.map((conv) => {
      const doc = docByUid.get(conv.salientJumpDocUid);
      const imageUrl = doc?.imageId
        ? (imagePathById.get(String(doc.imageId)) ?? null)
        : null;
      const readEntry = conv.read.find((r: { userUid: string }) => r.userUid === uid);
      // Unread if the user has no read entry and there are messages, or if not caughtUp.
      const hasUnread = readEntry ? !readEntry.caughtUp : conv.messages.length > 0;
      return {
        salientJumpDocUid: conv.salientJumpDocUid,
        updatedAt: (conv.updatedAt as unknown as Date).toISOString(),
        jumpDocName: doc?.name ?? "[Deleted JumpDoc]",
        jumpDocImageUrl: imageUrl,
        hasUnread,
      };
    });
  });

// ---------------------------------------------------------------------------

export type ConversationMessage = {
  timestamp: string;
  content: string;
  accompanyingChange: boolean;
  senderUid: string;
};

export type LoadConversationResult =
  | {
      status: "ok";
      messages: ConversationMessage[];
      /** firebaseUid → displayName for all participants */
      participantNames: Record<string, string>;
      /** firebaseUid → readUpTo (1-indexed message count) for non-current-user participants */
      participantReadUpTo: Record<string, number>;
      salientJumpDocUid: string;
    }
  | { status: "not_found" | "unauthorized" };

export const loadConversation = createServerFn({ method: "POST" })
  .inputValidator((data: { salientJumpDocUid: string; idToken: string }) => data)
  .handler(async ({ data }): Promise<LoadConversationResult> => {
    await connectToDatabase();
    const { uid } = await verifyIdToken(data.idToken);

    const conv = await Models.Conversation.findOne({
      salientJumpDocUid: data.salientJumpDocUid,
    }).lean();
    if (!conv) return { status: "not_found" };

    const user = await Models.User.findOne({ firebaseUid: uid }, { permissions: 1 }).lean();
    const isAdmin = user?.permissions?.includes("admin") ?? false;
    if (!conv.participants.includes(uid) && !isAdmin) return { status: "unauthorized" };

    const users = await Models.User.find(
      { firebaseUid: { $in: conv.participants } },
      { firebaseUid: 1, displayName: 1 },
    ).lean();

    const participantNames: Record<string, string> = {};
    for (const u of users) participantNames[u.firebaseUid] = u.displayName ?? "";

    const participantReadUpTo: Record<string, number> = {};
    for (const r of conv.read as { userUid: string; readUpTo: number }[]) {
      if (r.userUid !== uid) participantReadUpTo[r.userUid] = r.readUpTo;
    }

    return {
      status: "ok",
      messages: conv.messages.map((m: { timestamp: Date; content: string; accompanyingChange: boolean; senderUid: string }) => ({
        timestamp: m.timestamp.toISOString(),
        content: m.content,
        accompanyingChange: m.accompanyingChange,
        senderUid: m.senderUid,
      })),
      participantNames,
      participantReadUpTo,
      salientJumpDocUid: conv.salientJumpDocUid,
    };
  });

// ---------------------------------------------------------------------------

export const sendConversationMessage = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { salientJumpDocUid: string; idToken: string; content: string }) => data,
  )
  .handler(
    async ({
      data,
    }): Promise<
      { status: "ok"; timestamp: string } | { status: "not_found" | "unauthorized" }
    > => {
      await connectToDatabase();
      const { uid } = await verifyIdToken(data.idToken);

      const conv = await Models.Conversation.findOne({
        salientJumpDocUid: data.salientJumpDocUid,
      }).lean();
      if (!conv) return { status: "not_found" };
      if (!conv.participants.includes(uid)) return { status: "unauthorized" };

      const timestamp = new Date();
      const newMessageCount = conv.messages.length + 1;

      // Rebuild the read array: sender is caught up, others are not (preserving their readUpTo).
      const newRead = conv.participants.map((p: string) => {
        const existing = conv.read.find((r: { userUid: string; readUpTo: number }) => r.userUid === p);
        return p === uid
          ? { userUid: p, caughtUp: true, readUpTo: newMessageCount }
          : { userUid: p, caughtUp: false, readUpTo: existing?.readUpTo ?? 0 };
      });

      await Models.Conversation.updateOne(
        { _id: conv._id },
        {
          $push: {
            messages: { timestamp, content: data.content, accompanyingChange: false, senderUid: uid },
          },
          $set: { read: newRead },
        },
      );

      return { status: "ok", timestamp: timestamp.toISOString() };
    },
  );

// ---------------------------------------------------------------------------

export const markConversationRead = createServerFn({ method: "POST" })
  .inputValidator((data: { salientJumpDocUid: string; idToken: string }) => data)
  .handler(
    async ({
      data,
    }): Promise<{ status: "ok" | "not_found" | "unauthorized" }> => {
      await connectToDatabase();
      const { uid } = await verifyIdToken(data.idToken);

      const conv = await Models.Conversation.findOne({
        salientJumpDocUid: data.salientJumpDocUid,
      }).lean();
      if (!conv) return { status: "not_found" };
      if (!conv.participants.includes(uid)) return { status: "unauthorized" };

      const messageCount = conv.messages.length;
      const hasEntry = conv.read.some((r: { userUid: string }) => r.userUid === uid);

      if (hasEntry) {
        await Models.Conversation.updateOne(
          { _id: conv._id, "read.userUid": uid },
          { $set: { "read.$.caughtUp": true, "read.$.readUpTo": messageCount } },
        );
      } else {
        await Models.Conversation.updateOne(
          { _id: conv._id },
          { $push: { read: { userUid: uid, caughtUp: true, readUpTo: messageCount } } },
        );
      }

      return { status: "ok" };
    },
  );
