import type { UserProfile } from "../shared/contracts";

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
