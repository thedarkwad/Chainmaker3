import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MessageCircle, Loader2, Inbox, RefreshCw } from "lucide-react";
import { useTheme } from "@/providers/ThemeProvider";
import { useCurrentUser } from "@/app/state/auth";
import { AppHeader } from "@/app/components/AppHeader";
import { PortalNav } from "@/app/components/PortalNav";
import { UserDropdown } from "@/app/components/UserDropdown";
import { Conversation } from "@/app/components/Conversation";
import { CollapsibleSidebar } from "@/ui/CollapsibleSidebar";
import {
  listConversations,
  type ConversationSummary,
} from "@/api/conversations";

export const Route = createFileRoute("/messages")({
  component: MessagesPage,
});

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function ConversationItem({
  conv,
  selected,
  onClick,
}: {
  conv: ConversationSummary;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors rounded-lg ${
        selected
          ? "bg-accent-tint border border-accent-ring/60"
          : "hover:bg-tint border border-transparent"
      }`}
    >
      {/* Jumpdoc thumbnail */}
      <div className="shrink-0 w-9 h-9 rounded overflow-hidden bg-tint border border-edge flex items-center justify-center">
        {conv.jumpDocImageUrl ? (
          <img
            src={conv.jumpDocImageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <MessageCircle size={16} className="text-ghost" />
        )}
      </div>

      {/* Name + time */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span
          className={`text-sm truncate leading-tight ${
            conv.hasUnread ? "font-semibold text-ink" : "font-medium text-ink"
          }`}
        >
          {conv.jumpDocName}
        </span>
        <span className="text-xs text-muted">{timeAgo(conv.updatedAt)}</span>
      </div>

      {/* Unread indicator */}
      {conv.hasUnread && (
        <span className="shrink-0 w-2 h-2 rounded-full bg-accent" />
      )}
    </button>
  );
}

function MessagesPage() {
  const { settings, updateSettings } = useTheme();
  const { firebaseUser, loading: authLoading } = useCurrentUser();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Auth guard.
  useEffect(() => {
    if (!authLoading && !firebaseUser) {
      navigate({ to: "/" });
    }
  }, [authLoading, firebaseUser, navigate]);

  // Load conversation list.
  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    (async () => {
      setListLoading(true);
      setListError(null);
      try {
        const idToken = await firebaseUser.getIdToken();
        const result = await listConversations({ data: { idToken } });
        if (cancelled) return;
        setConversations(result);
        if (result.length > 0 && !selectedUid) {
          setSelectedUid(result[0]!.salientJumpDocUid);
        }
      } catch {
        if (!cancelled) setListError("Failed to load conversations.");
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  function handleSelect(uid: string) {
    setSelectedUid(uid);
    // Mark as read locally so the unread dot clears immediately.
    setConversations(prev =>
      prev.map(c =>
        c.salientJumpDocUid === uid ? { ...c, hasUnread: false } : c,
      ),
    );
  }

  const selectedConv =
    conversations.find(c => c.salientJumpDocUid === selectedUid) ?? null;

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <title>Messages | ChainMaker</title>
      <AppHeader
        nav={<PortalNav />}
        actions={<UserDropdown />}
        settings={settings}
        onUpdateSettings={updateSettings}
      />

      <div className="flex flex-1 min-h-0">
        <CollapsibleSidebar label="Messages">
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5 min-h-0">
            {listLoading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={18} className="animate-spin text-muted" />
              </div>
            )}
            {!listLoading && listError && (
              <p className="text-xs text-danger px-2 py-4">{listError}</p>
            )}
            {!listLoading && !listError && conversations.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
                <Inbox size={24} className="text-ghost" />
                <p className="text-xs text-muted">No conversations yet.</p>
              </div>
            )}
            {conversations.map(conv => (
              <ConversationItem
                key={conv.salientJumpDocUid}
                conv={conv}
                selected={conv.salientJumpDocUid === selectedUid}
                onClick={() => handleSelect(conv.salientJumpDocUid)}
              />
            ))}
          </div>
        </CollapsibleSidebar>

        {/* Main content */}
        <main className="flex-1 min-w-0 flex flex-col min-h-0 max-w-5xl">
          {selectedUid ? (
            <>
              {/* Header strip with jumpdoc name */}
              {selectedConv && (
                <div className="shrink-0 px-4 py-3 border-b border-edge flex items-center gap-2">
                  {selectedConv.jumpDocImageUrl && (
                    <img
                      src={selectedConv.jumpDocImageUrl}
                      alt=""
                      className="w-6 h-6 rounded object-cover border border-edge"
                    />
                  )}
                  <span className="flex-1 text-sm font-semibold text-ink truncate">
                    {selectedConv.jumpDocName}
                  </span>
                  <button
                    type="button"
                    title="Refresh"
                    onClick={() => setRefreshKey(k => k + 1)}
                    className="shrink-0 p-1.5 rounded text-muted hover:text-ink transition-colors"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              )}
              <div className="bg-surface m-2 p-1 border border-edge rounded flex flex-col flex-1 min-h-0">
                <Conversation
                  key={`${selectedUid}-${refreshKey}`}
                  salientJumpDocUid={selectedUid}
                  firebaseUser={firebaseUser}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center gap-3 flex-col text-center p-8">
              <MessageCircle size={32} className="text-ghost" />
              <p className="text-sm text-muted">
                Select a conversation to read it.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
