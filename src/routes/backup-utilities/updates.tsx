import { connectToDatabase, IJumpDoc, Models } from "@/server/db";
import { createFileRoute } from "@tanstack/react-router";

type SearchParams = { cutoff: number; secret: string };
type UpdateRecord = { updatedAt: number; id: string };

type JumpDocSummary = Pick<IJumpDoc, "publicUid" | "updatedAt">;

export const Route = createFileRoute("/backup-utilities/updates")({
  validateSearch: (s): SearchParams => ({
    cutoff: +(s.cutoff ?? -1),
    secret: String(s.secret),
  }),
  server: {
    handlers: {
      GET: async ({ request }) => {
        await connectToDatabase();

        const search = new URL(request.url).searchParams;
        const cutoff = +(search.get("cutoff") ?? -1);
        const secret = search.get("secret") ?? "";

        if (secret !== process.env.MASS_DOWNLOAD_SECRET)
          return new Response("Invalid secret", { status: 401 });
        if (cutoff < 0) return new Response("Invalid cutoff", { status: 400 });

        const updatedEntries = await Models.JumpDoc.find({
          $or: [
            { updatedAt: { $gt: new Date(cutoff) } },
            { firstPublishedAt: { $gt: new Date(cutoff) } },
          ],
          published: true,
        })
          .select({ publicUid: 1, updatedAt: 1, _id: 0 } as const)
          .lean<JumpDocSummary[]>();

        let updates: UpdateRecord[] = updatedEntries.map(a => ({
          updatedAt: a.updatedAt.getTime(),
          id: a.publicUid,
        }));

        return new Response(JSON.stringify(updates), {
          headers: {
            "Content-Type": "application/json",
          },
        });
      },
    },
  },
});
