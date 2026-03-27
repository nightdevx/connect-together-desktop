import type { DesktopApi } from "../../shared/desktop-api-types";

export type {
  ApiErrorPayload,
  DesktopApi,
  DesktopPreferences,
  DesktopRealtimeEvent,
  DesktopResult,
  DesktopRtcConfig,
  DesktopRuntimeConfig,
  DesktopUpdateState,
  DesktopUpdateStatus,
  LobbyMemberSnapshot,
  LobbyStateSnapshot,
  RegisteredUserSnapshot,
  SessionSnapshot,
} from "../../shared/desktop-api-types";

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}
