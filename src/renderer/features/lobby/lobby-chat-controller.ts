import type { LobbyChatMessage } from "../../../shared/contracts";
import type { DomRefs } from "../../ui/dom";

export interface LobbyChatController {
  setSelfUserId: (userId: string | null) => void;
  setDisplayNameMap: (displayNames: Map<string, string>) => void;
  replaceMessages: (messages: LobbyChatMessage[]) => void;
  appendMessage: (message: LobbyChatMessage) => void;
  clear: () => void;
  setSending: (sending: boolean) => void;
}

const formatMessageClock = (createdAt: string): string => {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return "--:--";
  }

  return parsed.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const sortMessagesByTimestamp = (
  left: LobbyChatMessage,
  right: LobbyChatMessage,
): number => {
  const leftTime = new Date(left.createdAt).getTime();
  const rightTime = new Date(right.createdAt).getTime();

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
  }

  return left.id.localeCompare(right.id);
};

export const createLobbyChatController = (
  dom: DomRefs,
): LobbyChatController => {
  const messagesById = new Map<string, LobbyChatMessage>();
  const displayNameByUserId = new Map<string, string>();
  let selfUserId: string | null = null;

  const resolveAuthorName = (message: LobbyChatMessage): string => {
    if (selfUserId && message.userId === selfUserId) {
      return "Sen";
    }

    const mapped = displayNameByUserId.get(message.userId)?.trim();
    if (mapped && mapped.length > 0) {
      return mapped;
    }

    const fromMessage = message.username.trim();
    if (fromMessage.length > 0) {
      return fromMessage;
    }

    return "Bilinmeyen";
  };

  const isNearBottom = (): boolean => {
    const remaining =
      dom.lobbyChatList.scrollHeight -
      (dom.lobbyChatList.scrollTop + dom.lobbyChatList.clientHeight);
    return remaining <= 48;
  };

  const renderMessageList = (forceScrollBottom: boolean): void => {
    const shouldScrollBottom = forceScrollBottom || isNearBottom();
    dom.lobbyChatList.innerHTML = "";

    const allMessages = Array.from(messagesById.values()).sort(
      sortMessagesByTimestamp,
    );

    if (allMessages.length === 0) {
      const empty = document.createElement("li");
      empty.className = "lobby-chat-empty";
      empty.textContent = "Henüz mesaj yok. Lobiye ilk mesajı sen yaz.";
      dom.lobbyChatList.appendChild(empty);
      return;
    }

    for (const message of allMessages) {
      const row = document.createElement("li");
      const isOwnMessage = selfUserId !== null && message.userId === selfUserId;
      row.className = isOwnMessage
        ? "lobby-chat-message lobby-chat-message--self"
        : "lobby-chat-message";
      row.dataset.messageId = message.id;

      const meta = document.createElement("div");
      meta.className = "lobby-chat-meta";

      const author = document.createElement("strong");
      author.className = "lobby-chat-author";
      author.textContent = resolveAuthorName(message);

      const timestamp = document.createElement("time");
      timestamp.className = "lobby-chat-time";
      timestamp.dateTime = message.createdAt;
      timestamp.textContent = formatMessageClock(message.createdAt);

      meta.appendChild(author);
      meta.appendChild(timestamp);

      const body = document.createElement("p");
      body.className = "lobby-chat-body";
      body.textContent = message.body;

      row.appendChild(meta);
      row.appendChild(body);
      dom.lobbyChatList.appendChild(row);
    }

    if (shouldScrollBottom) {
      dom.lobbyChatList.scrollTop = dom.lobbyChatList.scrollHeight;
    }
  };

  return {
    setSelfUserId: (userId) => {
      selfUserId = userId;
      renderMessageList(false);
    },
    setDisplayNameMap: (displayNames) => {
      displayNameByUserId.clear();
      for (const [userId, displayName] of displayNames.entries()) {
        const normalized = displayName.trim();
        if (normalized.length === 0) {
          continue;
        }

        displayNameByUserId.set(userId, normalized);
      }

      renderMessageList(false);
    },
    replaceMessages: (messages) => {
      messagesById.clear();
      for (const message of messages) {
        if (!message.id) {
          continue;
        }

        messagesById.set(message.id, message);
      }

      renderMessageList(true);
    },
    appendMessage: (message) => {
      if (!message.id) {
        return;
      }

      messagesById.set(message.id, message);
      renderMessageList(false);
    },
    clear: () => {
      messagesById.clear();
      renderMessageList(true);
    },
    setSending: (sending) => {
      dom.lobbyChatInput.disabled = sending;
      dom.lobbyChatSendButton.disabled = sending;
      dom.lobbyChatSendButton.textContent = sending ? "Gönderiliyor" : "Gönder";
    },
  };
};
