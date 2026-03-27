import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

import type { DesktopRtcConfig } from "./types";

const isDevelopmentRuntime = (): boolean => {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL?.trim();
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  return Boolean(devServerUrl) || nodeEnv === "development";
};

const resolveExplicitEnvFilePath = (): string | undefined => {
  const rawValue = process.env.CT_ENV_FILE?.trim();
  if (!rawValue) {
    return undefined;
  }

  if (path.isAbsolute(rawValue)) {
    return rawValue;
  }

  return path.join(process.cwd(), rawValue);
};

const resolveEnvCandidates = (): string[] => {
  const candidates: string[] = [];
  const pushUnique = (value: string | undefined) => {
    if (!value) {
      return;
    }

    const normalized = path.resolve(value);
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  // Allow explicit override for env file selection.
  pushUnique(resolveExplicitEnvFilePath());

  if (isDevelopmentRuntime()) {
    // Dev build output: dist/main -> project root is two levels up.
    pushUnique(path.join(__dirname, "../../.env.development"));
    // Support running from workspace root in development.
    pushUnique(path.join(process.cwd(), ".env.development"));
  }

  // Dev build output: dist/main -> project root is two levels up.
  pushUnique(path.join(__dirname, "../../.env"));

  // Packaged build: resources/.env (from electron-builder extraResources).
  if (process.resourcesPath) {
    pushUnique(path.join(process.resourcesPath, ".env"));
  }

  // Allow overriding by placing .env next to exe.
  pushUnique(path.join(path.dirname(process.execPath), ".env"));

  // Last fallback for manual launches.
  pushUnique(path.join(process.cwd(), ".env"));

  return candidates;
};

const loadEnvFromKnownPaths = (): string | null => {
  for (const candidate of resolveEnvCandidates()) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    const result = dotenv.config({ path: candidate, override: false });
    if (!result.error) {
      return candidate;
    }
  }

  return null;
};

export const loadedEnvPath = loadEnvFromKnownPaths();

const readEnv = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
};

export const backendBaseUrl =
  readEnv("CT_BACKEND_URL", "BACKEND_URL") || "http://127.0.0.1:4001";

export const liveKitDefaultRoom =
  readEnv("CT_LIVEKIT_ROOM", "LIVEKIT_DEFAULT_ROOM") || "main-lobby";

export const desktopRtcConfig = buildDesktopRtcConfig();

function buildDesktopRtcConfig(): DesktopRtcConfig {
  const urls = (readEnv("CT_ICE_URLS", "DESKTOP_ICE_URLS") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const normalizedUrls =
    urls.length > 0
      ? urls
      : [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:global.stun.twilio.com:3478",
        ];

  const username = readEnv("CT_ICE_USERNAME", "DESKTOP_ICE_USERNAME");
  const credential = readEnv("CT_ICE_CREDENTIAL", "DESKTOP_ICE_CREDENTIAL");

  return {
    iceServers: [
      {
        urls: normalizedUrls,
        ...(username ? { username } : {}),
        ...(credential ? { credential } : {}),
      },
    ],
  };
}
