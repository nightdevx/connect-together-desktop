import type {
  DesktopApi,
  RegisteredUserSnapshot,
} from "../../types/desktop-api";
import type { DomRefs } from "../../ui/dom";
import type { LobbyController } from "../lobby/lobby-controller";

const USER_DIRECTORY_REFRESH_MS = 5000;

interface DirectoryControllerDeps {
  dom: DomRefs;
  desktopApi: DesktopApi;
  lobbyController: LobbyController;
  getSelfUserId: () => string | null;
  setStatus: (message: string, isError: boolean) => void;
  getErrorMessage: (error?: { message?: string }) => string;
  onUsersRefreshed?: (users: RegisteredUserSnapshot[]) => void;
}

export interface DirectoryController {
  renderUserDirectory: () => void;
  refreshRegisteredUsers: (silent?: boolean) => Promise<void>;
  startFriendsPresenceAutoRefresh: () => void;
  stopFriendsPresenceAutoRefresh: () => void;
  clearUsers: () => void;
}

export const createDirectoryController = (
  deps: DirectoryControllerDeps,
): DirectoryController => {
  const {
    dom,
    desktopApi,
    lobbyController,
    getSelfUserId,
    setStatus,
    getErrorMessage,
    onUsersRefreshed,
  } = deps;
  let registeredUsers: RegisteredUserSnapshot[] = [];
  let usersDirectoryRefreshTimer: number | null = null;

  const renderUserDirectory = (): void => {
    const selfUserId = getSelfUserId();
    const visibleUsers = registeredUsers.filter(
      (user) => user.userId !== selfUserId,
    );
    const activeMembers = lobbyController.getMembersMap();
    dom.usersDirectoryCount.textContent = `${visibleUsers.length}`;
    dom.usersDirectoryList.innerHTML = "";

    if (visibleUsers.length === 0) {
      const empty = document.createElement("li");
      empty.className =
        "directory-item min-h-[52px] rounded-xl border border-border bg-surface-2/40 px-4 py-3 flex items-center justify-between gap-3";

      const identity = document.createElement("div");
      identity.className = "directory-identity min-w-0 flex flex-col gap-0.5";

      const name = document.createElement("div");
      name.className =
        "directory-name text-sm font-semibold text-text-secondary truncate";
      name.textContent = "Henüz arkadaş görünmüyor";

      const subline = document.createElement("div");
      subline.className = "directory-subline text-xs text-text-muted truncate";
      subline.textContent = "Yeni kullanıcılar burada listelenecek.";

      identity.appendChild(name);
      identity.appendChild(subline);
      empty.appendChild(identity);
      dom.usersDirectoryList.appendChild(empty);
      return;
    }

    for (const user of visibleUsers) {
      const lobbyMember = activeMembers.get(user.userId);
      const inLobby = lobbyMember !== undefined;
      const appOnline = user.appOnline === true;
      const online = inLobby || appOnline;
      const speaking =
        lobbyMember?.speaking === true && lobbyMember.muted !== true;
      const item = document.createElement("li");
      item.className =
        "directory-item min-h-[52px] rounded-xl border border-border bg-surface-2/40 px-4 py-3 flex items-center justify-between gap-3";
      item.dataset.userId = user.userId;
      item.classList.toggle("active", online);

      const identity = document.createElement("div");
      identity.className = "directory-identity min-w-0 flex flex-col gap-0.5";

      const displayName =
        user.displayName.trim().length > 0 ? user.displayName : user.username;

      const name = document.createElement("div");
      name.className =
        "directory-name text-sm font-semibold text-text-primary truncate";
      name.textContent = displayName;

      const subline = document.createElement("div");
      subline.className = "directory-subline text-xs text-text-muted truncate";
      subline.textContent = `@${user.username} • ${user.role === "admin" ? "admin" : "üye"}`;

      identity.appendChild(name);
      identity.appendChild(subline);

      const presence = document.createElement("div");
      presence.className =
        "directory-presence flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-muted flex-shrink-0 flex-wrap justify-end";

      const createPresenceBadge = (
        label: string,
        tone: "online" | "talking" | "offline",
      ): HTMLElement => {
        const badge = document.createElement("span");
        badge.className =
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5";

        if (tone === "talking") {
          badge.classList.add(
            "border-amber-400/60",
            "text-amber-100",
            "bg-amber-400/20",
          );
        } else if (tone === "online") {
          badge.classList.add(
            "border-emerald-400/55",
            "text-emerald-100",
            "bg-emerald-400/15",
          );
        } else {
          badge.classList.add(
            "border-border",
            "text-text-muted",
            "bg-surface-2/50",
          );
        }

        const dot = document.createElement("span");
        dot.className = "w-1.5 h-1.5 rounded-full";
        if (tone === "talking") {
          dot.classList.add("bg-amber-300");
        } else if (tone === "online") {
          dot.classList.add("bg-emerald-300");
        } else {
          dot.classList.add("bg-text-muted");
        }

        const text = document.createElement("span");
        text.textContent = label;

        badge.appendChild(dot);
        badge.appendChild(text);
        return badge;
      };

      if (speaking) {
        presence.appendChild(createPresenceBadge("konuşmada", "talking"));
      } else if (online) {
        presence.appendChild(createPresenceBadge("çevrimiçi", "online"));
      } else {
        presence.appendChild(createPresenceBadge("çevrimdışı", "offline"));
      }

      item.appendChild(identity);
      item.appendChild(presence);
      dom.usersDirectoryList.appendChild(item);
    }
  };

  const refreshRegisteredUsers = async (silent = false): Promise<void> => {
    const result = await desktopApi.getRegisteredUsers();
    if (!result.ok || !result.data) {
      if (!silent) {
        setStatus(
          `Arkadaş listesi alınamadı: ${getErrorMessage(result.error)}`,
          true,
        );
      }
      if (result.error?.statusCode === 401) {
        registeredUsers = [];
        renderUserDirectory();
      }
      return;
    }

    registeredUsers = result.data.users;
    onUsersRefreshed?.(registeredUsers);
    renderUserDirectory();
    if (!silent) {
      setStatus("Arkadaş listesi güncellendi", false);
    }
  };

  const stopFriendsPresenceAutoRefresh = (): void => {
    if (usersDirectoryRefreshTimer !== null) {
      window.clearInterval(usersDirectoryRefreshTimer);
      usersDirectoryRefreshTimer = null;
    }
  };

  const startFriendsPresenceAutoRefresh = (): void => {
    stopFriendsPresenceAutoRefresh();
    if (!getSelfUserId()) {
      return;
    }

    usersDirectoryRefreshTimer = window.setInterval(() => {
      void refreshRegisteredUsers(true);
    }, USER_DIRECTORY_REFRESH_MS);
  };

  const clearUsers = (): void => {
    registeredUsers = [];
    renderUserDirectory();
  };

  return {
    renderUserDirectory,
    refreshRegisteredUsers,
    startFriendsPresenceAutoRefresh,
    stopFriendsPresenceAutoRefresh,
    clearUsers,
  };
};
