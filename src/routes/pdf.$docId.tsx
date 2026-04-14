import { getJumpDocPdfUrl } from "@/api/jumpdocs";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/pdf/$docId")({
  component: RouteComponent,
  loader: async ({ params }) => {
    let url = (
      await getJumpDocPdfUrl({
        data: { publicUid: params.docId },
      })
    )?.pdfUrl;
    throw redirect({ href: url,  });
  },
});

function RouteComponent() {
  return <div></div>;
}
