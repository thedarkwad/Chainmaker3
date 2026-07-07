import { connectToDatabase, IJumpDoc, Models } from "@/server/db";
import { createFileRoute } from "@tanstack/react-router";
import { stringify } from "csv-stringify/sync";

type SearchParams = { cutoff: number; secret: string };

type JumpDocSummary = Pick<
  IJumpDoc,
  "publicUid" | "updatedAt" | "name" | "nsfw"
>;

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
          .select({
            nsfw: 1,
            name: 1,
            publicUid: 1,
            updatedAt: 1,
            _id: 0,
          } as const)
          .lean<JumpDocSummary[]>();

        let updates = updatedEntries.map(a => [
          a.name,
          a.nsfw ? "NSFW" : "SFW",
          String(a.updatedAt.getTime()),
          a.publicUid,
        ]);

        return new Response(
          stringify(
            [["name", "nsfw", "lastUpdated", "publicId"]].concat(updates),
          ),
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      },
    },
  },
});
