import type { DesktopApi, DesktopPreferences } from "../../types/desktop-api";
import type { DomRefs } from "../../ui/dom";

type WorkspacePage = "users" | "lobby" | "settings";
type SettingsTab =
  | "profile"
  | "security"
  | "voice"
  | "camera"
  | "broadcast"
  | "session";

interface WorkspaceControllerDeps {
  dom: DomRefs;
  desktopApi: DesktopApi;
  setStatus: (message: string, isError: boolean) => void;
  onPageChanged?: (page: WorkspacePage) => void;
  onSettingsTabChanged?: (tab: SettingsTab) => void;
}

export interface WorkspaceController {
  setWorkspacePage: (page: WorkspacePage) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  updateDesktopPreferenceToggles: () => void;
  getActiveWorkspacePage: () => WorkspacePage;
  getActiveSettingsTab: () => SettingsTab;
  bindEvents: () => void;
  initialize: () => Promise<void>;
  cleanup: () => void;
}

export const createWorkspaceController = (
  deps: WorkspaceControllerDeps,
): WorkspaceController => {
  const { dom, desktopApi, setStatus } = deps;
  let activeWorkspacePage: WorkspacePage = "lobby";
  let activeSettingsTab: SettingsTab = "profile";
  let closeToTrayOnClose = false;
  let launchAtStartup = false;
  let unsubscribeWindowState: (() => void) | null = null;

  const setSettingsTab = (tab: SettingsTab): void => {
    activeSettingsTab = tab;

    dom.settingsTabProfile.classList.toggle("active", tab === "profile");
    dom.settingsTabSecurity.classList.toggle("active", tab === "security");
    dom.settingsTabVoice.classList.toggle("active", tab === "voice");
    dom.settingsTabCamera.classList.toggle("active", tab === "camera");
    dom.settingsTabBroadcast.classList.toggle("active", tab === "broadcast");
    dom.settingsTabSession.classList.toggle("active", tab === "session");

    dom.settingsPanelProfile.classList.toggle("hidden", tab !== "profile");
    dom.settingsPanelSecurity.classList.toggle("hidden", tab !== "security");
    dom.settingsPanelVoice.classList.toggle("hidden", tab !== "voice");
    dom.settingsPanelCamera.classList.toggle("hidden", tab !== "camera");
    dom.settingsPanelBroadcast.classList.toggle("hidden", tab !== "broadcast");
    dom.settingsPanelSession.classList.toggle("hidden", tab !== "session");

    if (deps.onSettingsTabChanged) {
      deps.onSettingsTabChanged(tab);
    }
  };

  const setWorkspacePage = (page: WorkspacePage): void => {
    activeWorkspacePage = page;
    const showLobby = page === "lobby";
    const showUsers = page === "users";
    const showSettings = page === "settings";

    dom.usersSidebar.classList.toggle("hidden", !showUsers);
    dom.lobbySidebar.classList.toggle("hidden", !showLobby);
    dom.settingsSidebar.classList.toggle("hidden", !showSettings);
    dom.usersPage.classList.toggle("hidden", !showUsers);
    dom.lobbyPage.classList.toggle("hidden", !showLobby);
    dom.settingsPage.classList.toggle("hidden", !showSettings);
    dom.navUsers.classList.toggle("active", showUsers);
    dom.navLobby.classList.toggle("active", showLobby);
    dom.navSettings.classList.toggle("active", showSettings);

    if (showSettings) {
      setSettingsTab(activeSettingsTab);
    }

    if (deps.onPageChanged) {
      deps.onPageChanged(page);
    }
  };

  const applyWindowState = (isMaximized: boolean): void => {
    document.body.classList.toggle("window-maximized", isMaximized);
    dom.windowMaximize.title = isMaximized ? "Geri Yükle" : "Büyüt";
    dom.windowMaximize.setAttribute(
      "aria-label",
      isMaximized ? "Geri Yükle" : "Büyüt",
    );
  };

  const updateDesktopPreferenceToggles = (): void => {
    dom.closeToTrayToggle.classList.toggle("enabled", closeToTrayOnClose);
    dom.closeToTrayToggle.textContent = closeToTrayOnClose ? "Açık" : "Kapalı";

    dom.launchAtStartupToggle.classList.toggle("enabled", launchAtStartup);
    dom.launchAtStartupToggle.textContent = launchAtStartup ? "Açık" : "Kapalı";
  };

  const bindEvents = (): void => {
    dom.windowMinimize.addEventListener("click", () => {
      void desktopApi.windowMinimize();
    });

    dom.windowMaximize.addEventListener("click", async () => {
      try {
        const state = await desktopApi.windowToggleMaximize();
        applyWindowState(state.isMaximized);
      } catch {
        // no-op
      }
    });

    dom.windowClose.addEventListener("click", () => {
      void desktopApi.windowClose();
    });

    dom.closeToTrayToggle.addEventListener("click", async () => {
      closeToTrayOnClose = !closeToTrayOnClose;
      try {
        const next = await desktopApi.updateDesktopPreferences({
          closeToTrayOnClose,
        });
        closeToTrayOnClose = next.closeToTrayOnClose;
        launchAtStartup = next.launchAtStartup;
        updateDesktopPreferenceToggles();
        setStatus(
          closeToTrayOnClose
            ? "Kapat tusu tepsiye gonderme moduna alindi"
            : "Kapat tusu uygulamayi tamamen kapatacak",
          false,
        );
      } catch {
        closeToTrayOnClose = !closeToTrayOnClose;
        updateDesktopPreferenceToggles();
        setStatus("Tepsi ayari guncellenemedi", true);
      }
    });

    dom.launchAtStartupToggle.addEventListener("click", async () => {
      launchAtStartup = !launchAtStartup;
      try {
        const next = await desktopApi.updateDesktopPreferences({
          launchAtStartup,
        });
        closeToTrayOnClose = next.closeToTrayOnClose;
        launchAtStartup = next.launchAtStartup;
        updateDesktopPreferenceToggles();
        setStatus(
          launchAtStartup
            ? "Windows baslangicinda otomatik calisma acildi"
            : "Windows baslangicinda otomatik calisma kapatildi",
          false,
        );
      } catch {
        launchAtStartup = !launchAtStartup;
        updateDesktopPreferenceToggles();
        setStatus("Baslangic ayari guncellenemedi", true);
      }
    });

    dom.navUsers.addEventListener("click", () => {
      setWorkspacePage("users");
    });

    dom.navLobby.addEventListener("click", () => {
      setWorkspacePage("lobby");
    });

    dom.navSettings.addEventListener("click", () => {
      setWorkspacePage("settings");
    });

    dom.settingsTabProfile.addEventListener("click", () => {
      setSettingsTab("profile");
    });

    dom.settingsTabSecurity.addEventListener("click", () => {
      setSettingsTab("security");
    });

    dom.settingsTabVoice.addEventListener("click", () => {
      setSettingsTab("voice");
    });

    dom.settingsTabCamera.addEventListener("click", () => {
      setSettingsTab("camera");
    });

    dom.settingsTabBroadcast.addEventListener("click", () => {
      setSettingsTab("broadcast");
    });

    dom.settingsTabSession.addEventListener("click", () => {
      setSettingsTab("session");
    });
  };

  const initialize = async (): Promise<void> => {
    unsubscribeWindowState = desktopApi.onWindowStateChanged((payload) => {
      applyWindowState(payload.isMaximized);
    });

    try {
      const initialWindowState = await desktopApi.getWindowState();
      applyWindowState(initialWindowState.isMaximized);
    } catch {
      // no-op
    }

    try {
      const preferences: DesktopPreferences =
        await desktopApi.getDesktopPreferences();
      closeToTrayOnClose = preferences.closeToTrayOnClose;
      launchAtStartup = preferences.launchAtStartup;
    } catch {
      closeToTrayOnClose = false;
      launchAtStartup = false;
    }

    updateDesktopPreferenceToggles();
    setWorkspacePage(activeWorkspacePage);
  };

  const cleanup = (): void => {
    if (unsubscribeWindowState) {
      unsubscribeWindowState();
    }
  };

  return {
    setWorkspacePage,
    setSettingsTab,
    updateDesktopPreferenceToggles,
    getActiveWorkspacePage: () => activeWorkspacePage,
    getActiveSettingsTab: () => activeSettingsTab,
    bindEvents,
    initialize,
    cleanup,
  };
};
