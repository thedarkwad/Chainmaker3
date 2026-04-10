import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTheme } from "@/providers/ThemeProvider";
import { AppHeader } from "@/app/components/AppHeader";
import { UserDropdown } from "@/app/components/UserDropdown";
import { PortalNav } from "@/app/components/PortalNav";
import { ImageGallery } from "@/app/components/ImageGallery";
import { useCurrentUser } from "@/app/state/auth";
import { getImageUsedIn, type ImageSummary, type ImageUsedInEntry } from "@/api/images";

export const Route = createFileRoute("/userimages")({
  component: UserImagesPage,
});

function relativeTime(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  return `${Math.floor(months / 12)} year${Math.floor(months / 12) === 1 ? "" : "s"} ago`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

function ImageInfoPanel({
  image,
  firebaseUser,
}: {
  image: ImageSummary;
  firebaseUser: { getIdToken: () => Promise<string> };
}) {
  const [usedIn, setUsedIn] = useState<ImageUsedInEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setUsedIn([]);
    firebaseUser.getIdToken().then((idToken) =>
      getImageUsedIn({ data: { idToken, imageId: image._id } })
        .then(setUsedIn)
        .finally(() => setLoading(false)),
    );
  }, [image._id, firebaseUser]);

  return (
    <aside className="h-[50vh] sm:h-auto sm:w-72 shrink-0 border-t sm:border-t-0 sm:border-l border-edge overflow-y-auto flex flex-col">
      <div className="p-4 flex flex-col gap-4">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wide">Image Info</h2>

        {/* Preview */}
        <img
          src={image.path}
          alt="Selected image"
          className="w-1/2 sm:w-full self-center sm:self-auto aspect-square object-cover rounded-lg border border-edge"
        />

        {/* Metadata */}
        <div className="flex flex-col gap-1.5 text-xs text-ink">
          <div className="flex justify-between">
            <span className="text-muted">Uploaded</span>
            <span>{relativeTime(image.createdAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Size</span>
            <span>{formatBytes(image.bytes)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Source</span>
            <span className="capitalize">{image.uploadType}</span>
          </div>
        </div>

        {/* Used in */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Used in</p>
          {loading ? (
            <p className="text-xs text-ghost italic">Loading…</p>
          ) : usedIn.length === 0 ? (
            <p className="text-xs text-ghost italic">Not used in any documents.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {usedIn.map((entry) => {
                const label = entry.name ?? (entry.docType === "chain" ? "Chain" : "JumpDoc");
                const to =
                  entry.docType === "jumpdoc"
                    ? `/jumpdoc/${entry.publicUid}`
                    : `/chain/${entry.publicUid}`;
                return (
                  <Link
                    key={entry.docId}
                    to={to}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface border border-edge text-xs text-ink hover:border-trim hover:text-accent transition-colors"
                  >
                    <span className="text-ghost text-[10px]">
                      {entry.docType === "jumpdoc" ? "JD" : "CH"}
                    </span>
                    {label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function UserImagesPage() {
  const { settings, updateSettings } = useTheme();
  const { firebaseUser, loading } = useCurrentUser();
  const [selectedImage, setSelectedImage] = useState<ImageSummary | null>(null);

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <title>Your Images | ChainMaker</title>
      <AppHeader
        nav={<PortalNav />}
        actions={<UserDropdown />}
        settings={settings}
        onUpdateSettings={updateSettings}
      />
      <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
        {/* Main gallery area */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl p-4 flex flex-col gap-4">
            {loading ? (
              <p className="text-sm text-muted text-center py-16">Loading…</p>
            ) : !firebaseUser ? (
              <div className="flex flex-col items-center justify-center gap-2 py-24 text-ghost">
                <p className="text-sm font-medium text-ink">Not Authorized</p>
                <p className="text-xs">Sign in to view your images.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <h1 className="text-base font-semibold text-ink">Your Images</h1>
                <p className="text-xs text-ghost">
                  Upload and manage images for your chains and jumpdocs.
                </p>
                <div className="mt-3 bg-surface border border-edge rounded-lg p-4">
                  <ImageGallery onSelect={setSelectedImage} pageSize={28} />
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Side panel */}
        {selectedImage && firebaseUser && (
          <ImageInfoPanel image={selectedImage} firebaseUser={firebaseUser} />
        )}
      </div>
    </div>
  );
}
