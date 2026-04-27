import { useEffect, useRef, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import Markdown, { type Components } from "react-markdown";
import { Send, Loader2 } from "lucide-react";
import { Scrollbar } from "react-scrollbars-custom";
import {
  loadConversation,
  sendConversationMessage,
  markConversationRead,
  type ConversationMessage,
} from "@/api/conversations";
import { AutoResizeTextarea } from "@/ui/AutoResizeTextarea";

type Props = {
  salientJumpDocUid: string;
  firebaseUser: FirebaseUser | null;
};

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  return isToday
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" }) +
        " · " +
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const mdComponents: Components = {
  h1: ({ children }) => <p className="font-bold text-ink mt-3 first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="font-semibold text-ink mt-3 first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="font-medium text-ink mt-2 first:mt-0">{children}</p>,
  p: ({ children }) => <p className="mt-1 first:mt-0 leading-relaxed">{children}</p>,
};

export function Conversation({ salientJumpDocUid, firebaseUser }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});
  const [participantReadUpTo, setParticipantReadUpTo] = useState<Record<string, number>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const currentUid = firebaseUser?.uid ?? null;

  // Load conversation and mark as read on mount.
  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const idToken = await firebaseUser.getIdToken();
        const result = await loadConversation({ data: { salientJumpDocUid, idToken } });
        if (cancelled) return;
        if (result.status === "ok") {
          setMessages(result.messages);
          setParticipantNames(result.participantNames);
          setParticipantReadUpTo(result.participantReadUpTo);
          // Fire-and-forget — no need to block rendering on this.
          void markConversationRead({ data: { salientJumpDocUid, idToken } });
        } else {
          setError(
            result.status === "unauthorized"
              ? "You don't have access to this conversation."
              : "Conversation not found.",
          );
        }
      } catch {
        if (!cancelled) setError("Failed to load conversation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [salientJumpDocUid, firebaseUser]);

  // Scroll to bottom when messages change.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || !firebaseUser || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const idToken = await firebaseUser.getIdToken();
      const result = await sendConversationMessage({
        data: { salientJumpDocUid, idToken, content: trimmed },
      });
      if (result.status === "ok") {
        setMessages((prev) => [
          ...prev,
          {
            timestamp: result.timestamp,
            content: trimmed,
            accompanyingChange: false,
            senderUid: currentUid ?? "",
          },
        ]);
        setInput("");
      } else {
        setSendError(
          result.status === "unauthorized"
            ? "You don't have permission to reply."
            : "Conversation not found.",
        );
      }
    } catch {
      setSendError("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Loader2 size={18} className="animate-spin text-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  // Build a map of message index → names of participants who last read up to that message.
  const seenAt: Record<number, string[]> = {};
  for (const [uid, readUpTo] of Object.entries(participantReadUpTo)) {
    const idx = readUpTo - 1;
    if (idx >= 0 && idx < messages.length) {
      (seenAt[idx] ??= []).push(participantNames[uid] ?? "Unknown");
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Message list */}
      <Scrollbar
        style={{ flex: 1, minHeight: 0 }}
        noScrollX
        trackYProps={{ style: { width: "6px", background: "var(--color-edge)", borderRadius: "3px" } }}
        thumbYProps={{ style: { background: "var(--color-muted)", borderRadius: "3px" } }}
        contentProps={{ style: { display: "flex", flexDirection: "column", gap: "1rem", padding: "1rem" } }}
      >
        {messages.length === 0 && (
          <p className="text-sm text-ghost text-center py-8">No messages yet.</p>
        )}
        {messages.map((msg, i) => {
          const isOwn = msg.senderUid === currentUid;
          const senderName = isOwn
            ? "You"
            : (participantNames[msg.senderUid] || "Unknown");
          if (msg.accompanyingChange) {
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <span className="text-xs text-muted text-center">
                  Moderator {senderName} made an alteration to a jumpdoc you converted
                </span>
                <div className="rounded-lg px-3 py-2.5 text-sm text-ink bg-tint border border-edge max-w-xl w-full">
                  <Markdown components={mdComponents}>{msg.content}</Markdown>
                </div>
                {seenAt[i] && (
                  <span className="text-[10px] text-muted text-center">
                    {seenAt[i].join(", ")} last seen here.
                  </span>
                )}
              </div>
            );
          }

          return (
            <div key={i} className={`flex flex-col gap-1 max-w-xl ${isOwn ? "self-end items-end" : "self-start items-start"}`}>
              {/* Header: sender + timestamp */}
              <div className={`flex gap-2 items-center ${isOwn ? "justify-end" : "justify-start"}`}>
                <span className="text-xs font-semibold text-ink">{senderName}</span>
                <span className="text-xs text-muted">{formatTimestamp(msg.timestamp)}</span>
              </div>
              {/* Message bubble */}
              <div
                className={`rounded-lg px-3 py-2.5 text-sm text-ink max-w-max ${
                  isOwn ? "bg-accent2-tint border border-accent2/50" : "bg-accent-tint border border-accent"
                }`}
              >
                <Markdown components={mdComponents}>{msg.content}</Markdown>
              </div>
              {seenAt[i] && (
                <span className={`text-[10px] text-muted ${isOwn ? "text-right" : "text-left"}`}>
                    {seenAt[i].join(", ")} last seen here.
                </span>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </Scrollbar>

      <div className="shrink-0 border-t border-edge px-4 py-3 flex flex-col gap-2">
        {sendError && <p className="text-xs text-danger">{sendError}</p>}
        <div className="flex items-end gap-2">
          <AutoResizeTextarea
            minRows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Write a reply…"
            disabled={sending}
            className="flex-1 rounded border border-edge bg-tint px-3 py-2 text-sm text-ink resize-none focus:outline-none focus:border-trim placeholder:text-ghost disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim() || sending || !firebaseUser}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded bg-accent-tint text-accent border border-accent/40 hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
