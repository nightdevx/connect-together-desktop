import type {
  LobbyMemberSnapshot,
  LobbyStateSnapshot,
} from "../../types/desktop-api";
import type { DomRefs } from "../../ui/dom";

export interface LobbyController {
  getMembersMap: () => Map<string, LobbyMemberSnapshot>;
  resolveMemberName: (userId: string) => string;
  getDisplayNameMap: () => Map<string, string>;
  setDisplayNameMap: (displayNames: Map<string, string>) => void;
  renderLobby: (lobby: LobbyStateSnapshot) => void;
  addOrUpdateMember: (member: LobbyMemberSnapshot) => void;
  removeMember: (userId: string) => void;
  clearLobby: () => void;
}

export const createLobbyController = (dom: DomRefs): LobbyController => {
  const lobbyMemberMap = new Map<string, LobbyMemberSnapshot>();
  const displayNameByUserId = new Map<string, string>();

  const resolveDisplayName = (userId: string, fallback: string): string => {
    const mapped = displayNameByUserId.get(userId)?.trim();
    if (mapped && mapped.length > 0) {
      return mapped;
    }

    return fallback;
  };

  const createStatusIcon = (
    type: "mic" | "headphone",
    isOn: boolean,
  ): HTMLElement => {
    const icon = document.createElement("span");
    icon.className = `presence-icon ${type} ${isOn ? "on" : "off"} w-5 h-5 rounded-full border inline-flex items-center justify-center`;
    icon.title =
      type === "mic"
        ? isOn
          ? "Mikrofon açık"
          : "Mikrofon kapalı"
        : isOn
          ? "Kulaklık açık"
          : "Kulaklık kapalı";
    icon.setAttribute("aria-label", icon.title);

    icon.innerHTML =
      type === "mic"
        ? isOn
          ? '<svg class="w-3 h-3 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Zm5-3a1 1 0 0 1 2 0 7 7 0 0 1-6 6.93V20h3a1 1 0 1 1 0 2H8a1 1 0 0 1 0-2h3v-2.07A7 7 0 0 1 5 11a1 1 0 0 1 2 0 5 5 0 0 0 10 0Z"/></svg>'
          : '<svg class="w-3 h-3 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18.9 17.5A7 7 0 0 1 13 19.93V22h3a1 1 0 1 1 0 2H8a1 1 0 0 1 0-2h3v-2.07A7 7 0 0 1 5 13a1 1 0 1 1 2 0 5 5 0 0 0 8.73 3.4ZM15 8v2.17l-6-6V8a3 3 0 0 0 6 0ZM2.3 20.3a1 1 0 1 0 1.4 1.4l18-18a1 1 0 1 0-1.4-1.4l-18 18Z"/></svg>'
        : isOn
          ? '<svg class="w-3 h-3 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4a8 8 0 0 0-8 8v4a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H6v-1a6 6 0 1 1 12 0v1h-2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1a3 3 0 0 0 3-3v-4a8 8 0 0 0-8-8Z"/></svg>'
          : '<svg class="w-3 h-3 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4a8 8 0 0 0-7.69 10.2A3 3 0 0 0 4 15v1a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2v-2.17l-4-4V11a6 6 0 0 1 10.73-3.67l1.43 1.43A7.95 7.95 0 0 0 12 4ZM20 16v-2a8.16 8.16 0 0 0-.4-2.52L22 13.88V16a3 3 0 0 1-3 3h-1a2 2 0 0 1-2-2v-.88l2 2A3 3 0 0 0 20 16Zm-16.7 4.3a1 1 0 0 0 1.4 1.4l16-16a1 1 0 1 0-1.4-1.4l-16 16Z"/></svg>';

    return icon;
  };

  const getInitials = (name: string): string => {
    return name.charAt(0).toUpperCase();
  };

  const createMediaPlaceholder = (displayName: string): HTMLDivElement => {
    const placeholder = document.createElement("div");
    placeholder.className = "participant-media-placeholder";

    const initials = document.createElement("span");
    initials.className = "participant-media-placeholder-initial";
    initials.textContent = getInitials(displayName);

    const text = document.createElement("span");
    text.className = "participant-media-placeholder-text";
    text.textContent = "Kamera veya ekran kapali";

    placeholder.appendChild(initials);
    placeholder.appendChild(text);
    return placeholder;
  };

  const createStageCard = (
    member: LobbyMemberSnapshot,
    slotKey: string,
    showPresence: boolean,
  ): HTMLElement => {
    const card = document.createElement("article");
    card.className =
      "participant-card participant-tile rounded-2xl border border-border bg-surface-2/30";
    card.dataset.userId = member.userId;
    if (member.speaking && !member.muted) {
      card.classList.add("speaking");
    }

    const mediaSlot = document.createElement("div");
    mediaSlot.className = "participant-media-slot";
    mediaSlot.dataset.participantMediaSlot = slotKey;

    const displayName = resolveDisplayName(member.userId, member.username);
    const mediaPlaceholder = createMediaPlaceholder(displayName);
    mediaSlot.appendChild(mediaPlaceholder);

    const cardFooter = document.createElement("div");
    cardFooter.className = "participant-card-footer";

    const cardName = document.createElement("div");
    cardName.className = "participant-card-name";
    cardName.textContent = displayName;
    cardFooter.appendChild(cardName);

    if (showPresence) {
      const cardBottom = document.createElement("div");
      cardBottom.className = "participant-card-presence";
      cardBottom.appendChild(createStatusIcon("mic", !member.muted));
      cardBottom.appendChild(createStatusIcon("headphone", !member.deafened));
      cardFooter.appendChild(cardBottom);
    }

    card.appendChild(mediaSlot);
    card.appendChild(cardFooter);
    return card;
  };

  const patchMemberStateInDom = (member: LobbyMemberSnapshot): boolean => {
    const displayName = resolveDisplayName(member.userId, member.username);
    const isSpeaking = member.speaking && !member.muted;
    let foundAny = false;

    for (const row of Array.from(
      dom.members.querySelectorAll<HTMLElement>(".member-item"),
    )) {
      if (row.dataset.userId !== member.userId) {
        continue;
      }

      foundAny = true;
      row.classList.toggle("speaking", isSpeaking);

      const avatar = row.querySelector<HTMLElement>(".member-item-avatar");
      if (avatar) {
        avatar.textContent = getInitials(displayName);
      }

      const name = row.querySelector<HTMLElement>(".member-item-name");
      if (name) {
        name.textContent = displayName;
      }

      const presence = row.querySelector<HTMLElement>(".member-item-presence");
      if (presence) {
        presence.innerHTML = "";
        presence.appendChild(createStatusIcon("mic", !member.muted));
        presence.appendChild(createStatusIcon("headphone", !member.deafened));
      }
    }

    for (const card of Array.from(
      dom.participantGrid.querySelectorAll<HTMLElement>(".participant-card"),
    )) {
      if (card.dataset.userId !== member.userId) {
        continue;
      }

      foundAny = true;
      card.classList.toggle("speaking", isSpeaking);

      const cardName = card.querySelector<HTMLElement>(
        ".participant-card-name",
      );
      if (cardName) {
        cardName.textContent = displayName;
      }

      const cardPresence = card.querySelector<HTMLElement>(
        ".participant-card-presence",
      );
      if (cardPresence) {
        cardPresence.innerHTML = "";
        cardPresence.appendChild(createStatusIcon("mic", !member.muted));
        cardPresence.appendChild(
          createStatusIcon("headphone", !member.deafened),
        );
      }
    }

    return foundAny;
  };

  const renderFromMap = (): void => {
    dom.memberCount.textContent = String(lobbyMemberMap.size);
    dom.participantGrid.dataset.count = String(lobbyMemberMap.size);
    dom.members.innerHTML = "";
    dom.participantGrid.innerHTML = "";

    if (lobbyMemberMap.size === 0) {
      const emptyText = document.createElement("p");
      emptyText.className = "participant-empty-state";
      emptyText.textContent =
        "Henüz katılımcı yok.\nLobiye katılan kullanıcılar burada görünecek.";
      dom.participantGrid.appendChild(emptyText);
      return;
    }

    for (const member of lobbyMemberMap.values()) {
      // Sidebar member item
      const li = document.createElement("li");
      li.className =
        "member-item min-h-[44px] rounded-xl border border-border bg-surface-2/40 px-3 flex items-center justify-between transition-all duration-200";
      li.dataset.userId = member.userId;
      if (member.speaking && !member.muted) {
        li.classList.add("speaking");
      }

      const identity = document.createElement("div");
      identity.className = "flex items-center gap-2.5 min-w-0";

      const avatar = document.createElement("div");
      avatar.className =
        "member-item-avatar avatar w-7 h-7 rounded-lg text-xs flex-shrink-0";
      const displayName = resolveDisplayName(member.userId, member.username);

      avatar.textContent = getInitials(displayName);

      const name = document.createElement("span");
      name.className =
        "member-item-name text-sm font-medium text-text-primary truncate";
      name.textContent = displayName;

      const presence = document.createElement("span");
      presence.className =
        "member-item-presence flex items-center gap-1.5 flex-shrink-0";
      presence.appendChild(createStatusIcon("mic", !member.muted));
      presence.appendChild(createStatusIcon("headphone", !member.deafened));

      identity.appendChild(avatar);
      identity.appendChild(name);
      identity.appendChild(presence);

      li.appendChild(identity);
      dom.members.appendChild(li);

      // Stage participant card(s)
      if (member.cameraEnabled && member.screenSharing) {
        dom.participantGrid.appendChild(
          createStageCard(member, `${member.userId}:camera`, true),
        );
        dom.participantGrid.appendChild(
          createStageCard(member, `${member.userId}:screen`, false),
        );
        continue;
      }

      if (member.screenSharing) {
        dom.participantGrid.appendChild(
          createStageCard(member, `${member.userId}:screen`, true),
        );
        continue;
      }

      if (member.cameraEnabled) {
        dom.participantGrid.appendChild(
          createStageCard(member, `${member.userId}:camera`, true),
        );
        continue;
      }

      dom.participantGrid.appendChild(
        createStageCard(member, member.userId, true),
      );
    }
  };

  const renderLobby = (lobby: LobbyStateSnapshot): void => {
    lobbyMemberMap.clear();
    for (const member of lobby.members) {
      lobbyMemberMap.set(member.userId, member);
    }

    renderFromMap();
  };

  const addOrUpdateMember = (member: LobbyMemberSnapshot): void => {
    const previous = lobbyMemberMap.get(member.userId);
    lobbyMemberMap.set(member.userId, member);

    if (previous) {
      const mediaLayoutChanged =
        previous.cameraEnabled !== member.cameraEnabled ||
        previous.screenSharing !== member.screenSharing;

      if (!mediaLayoutChanged && patchMemberStateInDom(member)) {
        return;
      }
    }

    renderFromMap();
  };

  const removeMember = (userId: string): void => {
    lobbyMemberMap.delete(userId);
    renderFromMap();
  };

  const clearLobby = (): void => {
    lobbyMemberMap.clear();
    renderFromMap();
  };

  const resolveMemberName = (userId: string): string => {
    const member = lobbyMemberMap.get(userId);
    return member ? resolveDisplayName(userId, member.username) : userId;
  };

  return {
    getMembersMap: () => lobbyMemberMap,
    resolveMemberName,
    getDisplayNameMap: () => new Map(displayNameByUserId),
    setDisplayNameMap: (displayNames) => {
      displayNameByUserId.clear();
      for (const [userId, displayName] of displayNames.entries()) {
        const normalized = displayName.trim();
        if (normalized.length === 0) {
          continue;
        }
        displayNameByUserId.set(userId, normalized);
      }
      renderFromMap();
    },
    renderLobby,
    addOrUpdateMember,
    removeMember,
    clearLobby,
  };
};
