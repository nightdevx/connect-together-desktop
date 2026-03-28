import type {
  ChangePasswordRequest,
  LobbyChatMessage,
  LobbyMember,
  LoginRequest,
  MediaProducerKind,
  MediaSourceType,
  RegisterRequest,
  RtcSignalPayload,
  UpdateProfileRequest,
  UserDirectoryEntry,
  UserProfile,
  UserSettingsProfile,
} from "./contracts";

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
  user: UserProfile | null;
}

export type LobbyMemberSnapshot = LobbyMember;

export interface LobbyStateSnapshot {
  members: LobbyMemberSnapshot[];
  size: number;
  revision?: number;
}

export type RegisteredUserSnapshot = UserDirectoryEntry;

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
  messages?: LobbyChatMessage[];
  chatMessage?: LobbyChatMessage;
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
  register: (
    payload: RegisterRequest,
  ) => Promise<DesktopResult<SessionSnapshot>>;
  login: (payload: LoginRequest) => Promise<DesktopResult<SessionSnapshot>>;
  logout: () => Promise<DesktopResult<SessionSnapshot>>;
  getSession: () => Promise<DesktopResult<SessionSnapshot>>;
  getProfile: () => Promise<DesktopResult<{ profile: UserSettingsProfile }>>;
  getRegisteredUsers: () => Promise<
    DesktopResult<{ users: RegisteredUserSnapshot[] }>
  >;
  updateProfile: (
    payload: UpdateProfileRequest,
  ) => Promise<DesktopResult<{ profile: UserSettingsProfile }>>;
  changePassword: (
    payload: ChangePasswordRequest,
  ) => Promise<DesktopResult<{ changed: boolean }>>;
  getLobbyState: () => Promise<DesktopResult<LobbyStateSnapshot>>;
  chatListLobbyMessages: (payload?: {
    limit?: number;
  }) => Promise<DesktopResult<{ messages: LobbyChatMessage[] }>>;
  chatSendLobbyMessage: (payload: {
    body: string;
  }) => Promise<DesktopResult<{ message: LobbyChatMessage }>>;
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
