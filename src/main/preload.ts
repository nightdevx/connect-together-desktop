import { contextBridge, ipcRenderer } from "electron";
import type {
  ChangePasswordRequest,
  LoginRequest,
  MediaProducerKind,
  MediaSourceType,
  RegisterRequest,
  RtcSignalPayload,
  UpdateProfileRequest,
  UserDirectoryEntry,
  UserProfile,
  UserSettingsProfile,
} from "../shared/contracts";

interface ApiErrorPayload {
  code: string;
  message: string;
  statusCode: number;
}

interface DesktopResult<T> {
  ok: boolean;
  data?: T;
  error?: ApiErrorPayload;
}

interface SessionSnapshot {
  authenticated: boolean;
  user: UserProfile | null;
}

interface DesktopRtcConfig {
  iceServers: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;
}

interface DesktopRuntimeConfig {
  backendBaseUrl: string;
  liveKitDefaultRoom: string;
  desktopRtcConfig: DesktopRtcConfig;
}

interface DesktopPreferences {
  closeToTrayOnClose: boolean;
  launchAtStartup: boolean;
  gpuAccelerationEnabled: boolean;
}

type DesktopUpdateStatus =
  | "idle"
  | "disabled"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

interface DesktopUpdateState {
  status: DesktopUpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  downloadProgressPercent: number | null;
  message: string | null;
  checkedAt: string | null;
}

interface LobbyStateSnapshot {
  members: Array<{
    userId: string;
    username: string;
    joinedAt: string;
    muted: boolean;
    deafened: boolean;
    speaking: boolean;
    cameraEnabled: boolean;
    screenSharing: boolean;
    cameraProducerId: string | null;
    screenProducerId: string | null;
  }>;
  size: number;
}

interface DesktopApi {
  getAppVersion: () => Promise<string>;
  windowMinimize: () => Promise<void>;
  windowToggleMaximize: () => Promise<{ isMaximized: boolean }>;
  windowClose: () => Promise<void>;
  restartApp: () => Promise<DesktopResult<{ accepted: boolean }>>;
  getWindowState: () => Promise<{ isMaximized: boolean }>;
  onWindowStateChanged: (
    handler: (payload: { isMaximized: boolean }) => void,
  ) => () => void;
  getDesktopPreferences: () => Promise<DesktopPreferences>;
  updateDesktopPreferences: (
    patch: Partial<DesktopPreferences>,
  ) => Promise<DesktopPreferences>;
  getUpdateState: () => Promise<DesktopUpdateState>;
  checkForUpdates: () => Promise<DesktopResult<{ state: DesktopUpdateState }>>;
  applyUpdate: () => Promise<
    DesktopResult<{ accepted: boolean; state: DesktopUpdateState }>
  >;
  getRuntimeConfig: () => Promise<DesktopRuntimeConfig>;
  register: (
    payload: RegisterRequest,
  ) => Promise<DesktopResult<SessionSnapshot>>;
  login: (payload: LoginRequest) => Promise<DesktopResult<SessionSnapshot>>;
  logout: () => Promise<DesktopResult<SessionSnapshot>>;
  getSession: () => Promise<DesktopResult<SessionSnapshot>>;
  getProfile: () => Promise<DesktopResult<{ profile: UserSettingsProfile }>>;
  getRegisteredUsers: () => Promise<
    DesktopResult<{ users: UserDirectoryEntry[] }>
  >;
  updateProfile: (
    payload: UpdateProfileRequest,
  ) => Promise<DesktopResult<{ profile: UserSettingsProfile }>>;
  changePassword: (
    payload: ChangePasswordRequest,
  ) => Promise<DesktopResult<{ changed: boolean }>>;
  getLobbyState: () => Promise<DesktopResult<LobbyStateSnapshot>>;
  realtimeConnect: () => Promise<DesktopResult<{ connected: boolean }>>;
  lobbyJoin: () => Promise<DesktopResult<{ accepted: boolean }>>;
  lobbyLeave: () => Promise<DesktopResult<{ accepted: boolean }>>;
  lobbyMute: (muted: boolean) => Promise<DesktopResult<{ accepted: boolean }>>;
  lobbyDeafen: (
    deafened: boolean,
  ) => Promise<DesktopResult<{ accepted: boolean }>>;
  lobbySpeaking: (
    speaking: boolean,
  ) => Promise<DesktopResult<{ accepted: boolean }>>;
  sendRtcSignal: (payload: {
    toUserId: string;
    type: RtcSignalPayload["type"];
    data: unknown;
  }) => Promise<DesktopResult<{ accepted: boolean }>>;
  mediaGetRtpCapabilities: () => Promise<
    DesktopResult<{ rtpCapabilities: unknown }>
  >;
  mediaCreateTransport: (payload: { direction: "send" | "recv" }) => Promise<
    DesktopResult<{
      transport: {
        id: string;
        iceParameters: unknown;
        iceCandidates: unknown[];
        dtlsParameters: unknown;
      };
    }>
  >;
  mediaConnectTransport: (payload: {
    transportId: string;
    dtlsParameters: unknown;
  }) => Promise<DesktopResult<{ connected: boolean }>>;
  mediaCreateProducer: (payload: {
    transportId: string;
    kind: MediaProducerKind;
    sourceType?: MediaSourceType;
    rtpParameters: unknown;
  }) => Promise<
    DesktopResult<{
      producerId: string;
      kind: MediaProducerKind;
      sourceType: MediaSourceType;
    }>
  >;
  mediaListProducers: () => Promise<
    DesktopResult<{
      producers: Array<{
        peerId: string;
        producerId: string;
        kind: MediaProducerKind;
        sourceType: MediaSourceType;
      }>;
    }>
  >;
  mediaListCaptureSources: (payload?: {
    kinds?: Array<"screen" | "window">;
  }) => Promise<
    DesktopResult<{
      sources: Array<{
        id: string;
        name: string;
        kind: "screen" | "window";
        displayId: string | null;
        thumbnailDataUrl: string | null;
      }>;
    }>
  >;
  mediaCreateConsumer: (payload: {
    transportId: string;
    producerId: string;
    rtpCapabilities: unknown;
  }) => Promise<
    DesktopResult<{
      consumer: {
        id: string;
        producerId: string;
        kind: "audio" | "video";
        rtpParameters: unknown;
        type: string;
        producerPaused: boolean;
      };
    }>
  >;
  mediaResumeConsumer: (payload: {
    consumerId: string;
  }) => Promise<DesktopResult<{ resumed: boolean }>>;
  mediaCreateLiveKitToken: (payload?: { room?: string }) => Promise<
    DesktopResult<{
      serverUrl: string;
      room: string;
      identity: string;
      name: string;
      token: string;
      expiresAt: string;
    }>
  >;
  onRealtimeEvent: (
    handler: (event: {
      type: string;
      status?: string;
      detail?: string;
      latencyMs?: number | null;
      packetLossPercent?: number;
      transport?: string;
      reconnectAttempts?: number;
      connected?: boolean;
      members?: LobbyStateSnapshot["members"];
      member?: LobbyStateSnapshot["members"][number];
      payload?: RtcSignalPayload;
      userId?: string;
      producerId?: string;
      kind?: MediaProducerKind;
      sourceType?: MediaSourceType;
      code?: string;
      message?: string;
    }) => void,
  ) => () => void;
  onUpdateEvent: (handler: (state: DesktopUpdateState) => void) => () => void;
}

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
      handler(
        payload as {
          type: string;
          revision?: number;
          status?: string;
          detail?: string;
          latencyMs?: number | null;
          packetLossPercent?: number;
          transport?: string;
          reconnectAttempts?: number;
          connected?: boolean;
          members?: LobbyStateSnapshot["members"];
          member?: LobbyStateSnapshot["members"][number];
          payload?: RtcSignalPayload;
          userId?: string;
          producerId?: string;
          kind?: MediaProducerKind;
          sourceType?: MediaSourceType;
          code?: string;
          message?: string;
        },
      );
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
