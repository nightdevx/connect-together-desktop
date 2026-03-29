import type { UserProfile } from "../../shared/contracts";
import type { BackendClient } from "../backend-client";
import type { RealtimeClient } from "../realtime-client";
import type { SessionStore } from "../session-store";
import type {
  DesktopPreferences,
  DesktopResult,
  DesktopRuntimeConfig,
  DesktopUpdateState,
  SessionSnapshot,
} from "../types";

export interface RegisterDesktopIpcHandlersDeps {
  backendClient: BackendClient;
  realtimeClient: RealtimeClient;
  sessionStore: SessionStore;
  getAppVersion: () => string;
  getRuntimeConfig: () => DesktopRuntimeConfig;
  getDesktopPreferences: () => DesktopPreferences;
  updateDesktopPreferences: (
    patch: Partial<DesktopPreferences>,
  ) => DesktopPreferences;
  getUpdateState: () => DesktopUpdateState;
  checkForUpdates: () => Promise<DesktopUpdateState>;
  applyUpdate: () => Promise<{ accepted: boolean; state: DesktopUpdateState }>;
  emitRealtimeEvent: (payload: unknown) => void;
  emitUpdateEvent: (payload: DesktopUpdateState) => void;
}

export type OkResult = <T>(data: T) => DesktopResult<T>;
export type FailResult = <T>(error: unknown) => DesktopResult<T>;

export interface DesktopIpcModuleHelpers {
  ok: OkResult;
  fail: FailResult;
  getSessionSnapshot: () => SessionSnapshot;
  ensureValidString: (
    value: unknown,
    field: string,
    minLength: number,
    maxLength?: number,
  ) => string;
  ensureObject: (value: unknown, field: string) => Record<string, unknown>;
  persistAuthResult: (result: {
    user: UserProfile;
    tokens: { accessToken: string; refreshToken: string };
  }) => void;
  withAccessToken: <T>(
    operation: (accessToken: string) => Promise<T>,
  ) => Promise<T>;
  connectRealtimeForCurrentSession: () => void;
  ensureRealtimeConnected: () => void;
  getActiveLobbyId: () => string;
  setActiveLobbyId: (lobbyId: string) => void;
  isAutoJoinLobbyEnabled: () => boolean;
  setAutoJoinLobbyEnabled: (value: boolean) => void;
  clearSessionAndRealtime: () => void;
}
