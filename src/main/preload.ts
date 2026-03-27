import { contextBridge, ipcRenderer } from "electron";
import type {
  DesktopApi,
  DesktopRealtimeEvent,
  DesktopUpdateState,
} from "../shared/desktop-api-types";

const desktopApi: DesktopApi = {
  getAppVersion: async () => {
    return ipcRenderer.invoke("desktop:get-version");
  },
  windowMinimize: async () => {
    return ipcRenderer.invoke("desktop:window-minimize");
  },
  windowToggleMaximize: async () => {
    return ipcRenderer.invoke("desktop:window-toggle-maximize");
  },
  windowClose: async () => {
    return ipcRenderer.invoke("desktop:window-close");
  },
  restartApp: async () => {
    return ipcRenderer.invoke("desktop:app-relaunch");
  },
  getWindowState: async () => {
    return ipcRenderer.invoke("desktop:get-window-state");
  },
  onWindowStateChanged: (handler) => {
    const listener = (_event: unknown, payload: unknown) => {
      handler(payload as { isMaximized: boolean });
    };

    ipcRenderer.on("desktop:window-state-changed", listener);
    return () => {
      ipcRenderer.removeListener("desktop:window-state-changed", listener);
    };
  },
  getDesktopPreferences: async () => {
    return ipcRenderer.invoke("desktop:get-preferences");
  },
  updateDesktopPreferences: async (patch) => {
    return ipcRenderer.invoke("desktop:update-preferences", patch);
  },
  getUpdateState: async () => {
    return ipcRenderer.invoke("desktop:update-state");
  },
  checkForUpdates: async () => {
    return ipcRenderer.invoke("desktop:update-check");
  },
  applyUpdate: async () => {
    return ipcRenderer.invoke("desktop:update-apply");
  },
  getRuntimeConfig: async () => {
    return ipcRenderer.invoke("desktop:get-runtime-config");
  },
  register: async (payload) => {
    return ipcRenderer.invoke("desktop:auth-register", payload);
  },
  login: async (payload) => {
    return ipcRenderer.invoke("desktop:auth-login", payload);
  },
  logout: async () => {
    return ipcRenderer.invoke("desktop:auth-logout");
  },
  getSession: async () => {
    return ipcRenderer.invoke("desktop:auth-session");
  },
  getProfile: async () => {
    return ipcRenderer.invoke("desktop:auth-profile");
  },
  getRegisteredUsers: async () => {
    return ipcRenderer.invoke("desktop:auth-users");
  },
  updateProfile: async (payload) => {
    return ipcRenderer.invoke("desktop:auth-update-profile", payload);
  },
  changePassword: async (payload) => {
    return ipcRenderer.invoke("desktop:auth-change-password", payload);
  },
  getLobbyState: async () => {
    return ipcRenderer.invoke("desktop:lobby-state");
  },
  realtimeConnect: async () => {
    return ipcRenderer.invoke("desktop:realtime-connect");
  },
  lobbyJoin: async () => {
    return ipcRenderer.invoke("desktop:lobby-join");
  },
  lobbyLeave: async () => {
    return ipcRenderer.invoke("desktop:lobby-leave");
  },
  lobbyMute: async (muted) => {
    return ipcRenderer.invoke("desktop:lobby-mute", muted);
  },
  lobbyDeafen: async (deafened) => {
    return ipcRenderer.invoke("desktop:lobby-deafen", deafened);
  },
  lobbySpeaking: async (speaking) => {
    return ipcRenderer.invoke("desktop:lobby-speaking", speaking);
  },
  sendRtcSignal: async (payload) => {
    return ipcRenderer.invoke("desktop:rtc-signal", payload);
  },
  mediaGetRtpCapabilities: async () => {
    return ipcRenderer.invoke("desktop:media-rtp-capabilities");
  },
  mediaCreateTransport: async (payload) => {
    return ipcRenderer.invoke("desktop:media-create-transport", payload);
  },
  mediaConnectTransport: async (payload) => {
    return ipcRenderer.invoke("desktop:media-connect-transport", payload);
  },
  mediaCreateProducer: async (payload) => {
    return ipcRenderer.invoke("desktop:media-create-producer", payload);
  },
  mediaListProducers: async () => {
    return ipcRenderer.invoke("desktop:media-list-producers");
  },
  mediaListCaptureSources: async (payload) => {
    return ipcRenderer.invoke("desktop:media-list-capture-sources", payload);
  },
  mediaCreateConsumer: async (payload) => {
    return ipcRenderer.invoke("desktop:media-create-consumer", payload);
  },
  mediaResumeConsumer: async (payload) => {
    return ipcRenderer.invoke("desktop:media-resume-consumer", payload);
  },
  mediaCreateLiveKitToken: async (payload) => {
    return ipcRenderer.invoke("desktop:media-livekit-token", payload);
  },
  onRealtimeEvent: (handler) => {
    const listener = (_event: unknown, payload: unknown) => {
      handler(payload as DesktopRealtimeEvent);
    };

    ipcRenderer.on("desktop:realtime-event", listener);
    return () => {
      ipcRenderer.removeListener("desktop:realtime-event", listener);
    };
  },
  onUpdateEvent: (handler) => {
    const listener = (_event: unknown, payload: unknown) => {
      handler(payload as DesktopUpdateState);
    };

    ipcRenderer.on("desktop:update-event", listener);
    return () => {
      ipcRenderer.removeListener("desktop:update-event", listener);
    };
  },
};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}
