import { connectToDatabase, Models } from "@/server/db";
import { createFileRoute } from "@tanstack/react-router";
import AdmZip from "adm-zip";

export const Route = createFileRoute("/backup-utilities/jumpdoc/$docId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        await connectToDatabase();

        const doc = await Models.JumpDoc.findOne({
          publicUid: params.docId,
        }).lean();

        if (!doc) {
          return new Response("Not found", { status: 404 });
        }

        const pdf = await Models.PDF.findById(doc.pdf, {
          path: 1,
        }).lean();

        if (!pdf?.path) {
          return new Response("PDF not found", { status: 404 });
        }

        const [pdfRes, imageDoc] = await Promise.all([
          fetch(pdf.path as string),
          doc.imageId
            ? Models.Image.findById(doc.imageId, { path: 1 }).lean()
            : Promise.resolve(null),
        ]);

        const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

        const name = (doc.name as string) ?? "Untitled";

        const meta = {
          name,
          author: doc.author ?? [],
          version: "1.0",
          attributes: doc.attributes ?? {},
          nsfw: doc.nsfw ?? false,
        };

        const zip = new AdmZip();

        zip.addFile(
          "data.json",
          Buffer.from(JSON.stringify(doc.contents, null, 2), "utf8"),
        );

        zip.addFile(
          "meta.json",
          Buffer.from(JSON.stringify(meta, null, 2), "utf8"),
        );

        zip.addFile("pdf.pdf", pdfBuffer);

        if (imageDoc?.path) {
          const imgRes = await fetch(imageDoc.path as string);
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          const ext = imageDoc.path.split(".").pop() ?? "jpg";

          zip.addFile(`thumb.${ext}`, imgBuffer);
        }

        const buffer = zip.toBuffer();

        return new Response(buffer, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${name}.jumpdoc"`,
            "Content-Length": String(buffer.length),
          },
        });
      },
    },
  },
});