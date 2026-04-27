export type ConversationSummary = {
  salientJumpDocUid: string;
  updatedAt: string;
  jumpDocName: string;
  jumpDocImageUrl: string | null;
  hasUnread: boolean;
};

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
      participantNames: Record<string, string>;
      participantReadUpTo: Record<string, number>;
      salientJumpDocUid: string;
    }
  | { status: "not_found" | "unauthorized" };

export async function getUnreadCount(_params: unknown): Promise<number> {
  return 0;
}

export async function listConversations(_params: unknown): Promise<ConversationSummary[]> {
  return [];
}

export async function loadConversation(_params: unknown): Promise<LoadConversationResult> {
  return { status: "not_found" };
}

export async function sendConversationMessage(
  _params: unknown,
): Promise<{ status: "ok"; timestamp: string } | { status: "not_found" | "unauthorized" }> {
  return { status: "not_found" };
}

export async function markConversationRead(
  _params: unknown,
): Promise<{ status: "ok" | "not_found" | "unauthorized" }> {
  return { status: "ok" };
}
