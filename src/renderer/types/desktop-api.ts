import type {
  MediaProducerKind,
  MediaSourceType,
  RtcSignalPayload,
} from "../../shared/contracts";

export interface ApiErrorPayload {
  code: string;
  message: string;
  statusCode: number;
}

export interface DesktopResult<T> {
  ok: boolean;
  data?: T;
  error?: ApiErrorPayload;
}

export interface SessionSnapshot {
  authenticated: boolean;
  user: {
    id: string;
    username: string;
  } | null;
}

export interface LobbyMemberSnapshot {
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
}

export interface LobbyStateSnapshot {
  members: LobbyMemberSnapshot[];
  size: number;
  revision?: number;
}

export interface RegisteredUserSnapshot {
  userId: string;
  username: string;
  displayName: string;
  role: "admin" | "member";
  createdAt: string;
  appOnline?: boolean;
}

export interface DesktopRtcConfig {
  iceServers: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;
}

export interface DesktopRuntimeConfig {
  backendBaseUrl: string;
  liveKitDefaultRoom: string;
  desktopRtcConfig: DesktopRtcConfig;
}

export interface DesktopPreferences {
  closeToTrayOnClose: boolean;
  launchAtStartup: boolean;
  gpuAccelerationEnabled: boolean;
}

export type DesktopUpdateStatus =
  | "idle"
  | "disabled"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

export interface DesktopUpdateState {
  status: DesktopUpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  downloadProgressPercent: number | null;
  message: string | null;
  checkedAt: string | null;
}

export interface DesktopRealtimeEvent {
  type: string;
  revision?: number;
  status?: string;
  detail?: string;
  latencyMs?: number | null;
  packetLossPercent?: number;
  transport?: string;
  reconnectAttempts?: number;
  connected?: boolean;
  members?: LobbyMemberSnapshot[];
  member?: LobbyMemberSnapshot;
  payload?: RtcSignalPayload & {
    producerId?: string;
    userId?: string;
    kind?: MediaProducerKind;
    sourceType?: MediaSourceType;
  };
  userId?: string;
  producerId?: string;
  code?: string;
  message?: string;
}

export interface DesktopApi {
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
  register: (payload: {
    username: string;
    password: string;
  }) => Promise<DesktopResult<SessionSnapshot>>;
  login: (payload: {
    username: string;
    password: string;
  }) => Promise<DesktopResult<SessionSnapshot>>;
  logout: () => Promise<DesktopResult<SessionSnapshot>>;
  getSession: () => Promise<DesktopResult<SessionSnapshot>>;
  getProfile: () => Promise<
    DesktopResult<{
      profile: {
        displayName: string;
        email: string | null;
        bio: string | null;
        updatedAt: string;
      };
    }>
  >;
  getRegisteredUsers: () => Promise<
    DesktopResult<{
      users: RegisteredUserSnapshot[];
    }>
  >;
  updateProfile: (payload: {
    displayName: string;
    email?: string | null;
    bio?: string | null;
  }) => Promise<
    DesktopResult<{
      profile: {
        displayName: string;
        email: string | null;
        bio: string | null;
        updatedAt: string;
      };
    }>
  >;
  changePassword: (payload: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<DesktopResult<{ changed: boolean }>>;
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
    handler: (event: DesktopRealtimeEvent) => void,
  ) => () => void;
  onUpdateEvent: (handler: (state: DesktopUpdateState) => void) => () => void;
}

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}
