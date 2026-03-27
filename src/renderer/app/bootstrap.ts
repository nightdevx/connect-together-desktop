import type { RtcSignalPayload } from "../../shared/contracts";
import { createAuthViewController } from "../features/auth/auth-view-controller";
import { createUiSoundController } from "../features/audio/ui-sound-controller";
import { createLobbyController } from "../features/lobby/lobby-controller";
import { createVoiceController } from "../features/voice/voice-controller";
import { createUpdaterViewController } from "../features/updater/updater-view-controller";
import { createWorkspaceController } from "../features/workspace/workspace-controller";
import { createDiagnosticsController } from "../features/diagnostics/diagnostics-controller";
import { createDirectoryController } from "../features/directory/directory-controller";
import type {
  CameraShareOptions,
  ScreenShareOptions,
} from "../features/voice/voice-video-share";
import type {
  DesktopApi,
  LobbyMemberSnapshot,
  DesktopRuntimeConfig,
  DesktopUpdateState,
  RegisteredUserSnapshot,
  SessionSnapshot,
} from "../types/desktop-api";
import type { DomRefs } from "../ui/dom";
import { bindAuthAndProfileForms } from "./bootstrap-auth-bindings";
import { bindContextMenuAndParticipantAudioControls } from "./bootstrap-context-menu-bindings";
import { bindMediaAndShareControls } from "./bootstrap-media-bindings";
import { subscribeBootstrapRealtimeOrchestrator } from "./bootstrap-realtime-orchestrator";
import {
  createBootstrapShareModalController,
  type ScreenCaptureKind,
} from "./bootstrap-share-modal-controller";
import { bindLogoutControl } from "./bootstrap-session-bindings";
import { initializeUpdaterAndSession } from "./bootstrap-updater-session-init";
import { bindVoiceSettingsControls } from "./bootstrap-voice-settings-bindings";
import { createLifecycleScope } from "./lifecycle-scope";

const getErrorMessage = (error?: { message?: string }): string => {
  return error?.message ?? "bilinmeyen hata";
};

type SpeakingDetectionMode = "auto" | "manual";
const UI_SOUNDS_STORAGE_KEY = "ct.desktop.ui-sounds-enabled";
const RNNOISE_ENABLED_STORAGE_KEY = "ct.desktop.rnnoise-enabled";
const SPEAKING_MODE_STORAGE_KEY = "ct.desktop.speaking-detection-mode";
const SPEAKING_THRESHOLD_STORAGE_KEY = "ct.desktop.speaking-threshold-percent";
const CAMERA_RESOLUTION_STORAGE_KEY = "ct.desktop.camera-share-resolution";
const CAMERA_FPS_STORAGE_KEY = "ct.desktop.camera-share-fps";
const SCREEN_RESOLUTION_STORAGE_KEY = "ct.desktop.screen-share-resolution";
const SCREEN_FPS_STORAGE_KEY = "ct.desktop.screen-share-fps";
const SCREEN_MODE_STORAGE_KEY = "ct.desktop.screen-share-mode";
const INPUT_GAIN_STORAGE_KEY = "ct.desktop.input-gain-percent";
const MEDIA_DEBUG_LOG_STORAGE_KEY = "ct.desktop.media-debug-log";
const PARTICIPANT_AUDIO_SETTINGS_STORAGE_KEY =
  "ct.desktop.participant-audio-settings";
const MAX_MEDIA_DEBUG_LOG_ENTRIES = 280;
const MAX_TOAST_COUNT = 4;
const TOAST_AUTO_HIDE_MS = 4200;
const DEFAULT_SPEAKING_THRESHOLD_PERCENT = 24;

interface ParticipantAudioSetting {
  muted: boolean;
  volumePercent: number;
}

interface MediaDebugLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  scope: "audio" | "camera" | "screen" | "livekit" | "system";
  event: string;
  message: string;
  details?: Record<string, unknown>;
}

const parseResolution = (value: string): { width: number; height: number } => {
  const [widthRaw, heightRaw] = value.split("x");
  const width = Number(widthRaw);
  const height = Number(heightRaw);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return { width: 1280, height: 720 };
  }

  return {
    width,
    height,
  };
};

const normalizeScreenCaptureKind = (
  value: string | null,
): ScreenCaptureKind => {
  if (value === "screen" || value === "window") {
    return value;
  }

  return "any";
};

const getDesktopApiOrThrow = (): DesktopApi => {
  const api = window.desktopApi;
  if (!api || typeof api.getRuntimeConfig !== "function") {
    throw new Error(
      "Desktop API bulunamadi. Uygulamayi Electron ile baslatin (npm run dev).",
    );
  }

  return api;
};

const clampThresholdPercent = (value: number): number => {
  return Math.max(1, Math.min(100, Math.round(value)));
};

const clampParticipantVolumePercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 100;
  }

  return Math.max(0, Math.min(200, Math.round(value)));
};

const clampInputGainPercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 100;
  }

  return Math.max(0, Math.min(200, Math.round(value)));
};

const normalizeDetectionMode = (
  value: string | null,
): SpeakingDetectionMode => {
  return value === "manual" ? "manual" : "auto";
};

const DIAG_STATUS_ICON_PATHS = {
  idle: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5a1 1 0 1 0-2 0v5c0 .38.21.72.55.89l3 1.8a1 1 0 1 0 1-1.72L13 11.44V7Z",
  ok: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.3 7.7a1 1 0 0 0-1.42-1.4l-3.9 3.94-1.86-1.86a1 1 0 1 0-1.42 1.41l2.57 2.58a1 1 0 0 0 1.42 0l4.61-4.67Z",
  warn: "M12 3.5 2.9 19.1a1 1 0 0 0 .86 1.5h16.48a1 1 0 0 0 .86-1.5L12.97 3.5a1.1 1.1 0 0 0-1.94 0ZM13 9a1 1 0 1 0-2 0v4a1 1 0 1 0 2 0V9Zm-1 8.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z",
  error:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.7 13.7a1 1 0 0 1-1.4 0L12 13.41l-2.3 2.3a1 1 0 1 1-1.4-1.42l2.29-2.29-2.3-2.3a1 1 0 0 1 1.42-1.4l2.29 2.29 2.3-2.3a1 1 0 1 1 1.4 1.42l-2.29 2.29 2.3 2.3a1 1 0 0 1 0 1.4Z",
} as const;

type DiagnosticsBannerState = keyof typeof DIAG_STATUS_ICON_PATHS;

export const bootstrapDesktopApp = async (dom: DomRefs): Promise<void> => {
  const desktopApi = getDesktopApiOrThrow();
  const runtimeConfig: DesktopRuntimeConfig =
    await desktopApi.getRuntimeConfig();
  const lifecycle = createLifecycleScope();

  let isMuted = false;
  let isHeadphoneMuted = false;
  let isSpeaking = false;
  let voiceConnected = false;
  let cameraSharing = false;
  let screenSharing = false;
  let realtimeConnectionStatus: "connected" | "disconnected" | "error" =
    "disconnected";
  let realtimeLatencyMs: number | null = null;
  let realtimePacketLossPercent = 0;
  let realtimeTransport = "unknown";
  let realtimeReconnectAttempts = 0;
  let latestLobbyRevision = 0;
  let voiceJoinLatencyMs: number | null = null;
  const latencySamplesMs: number[] = [];
  let selfUserId: string | null = null;
  const uiSoundController = createUiSoundController();
  let uiSoundsEnabled = true;
  let rnnoiseEnabled = true;
  let speakingDetectionMode: SpeakingDetectionMode = "auto";
  let manualSpeakingThresholdPercent = DEFAULT_SPEAKING_THRESHOLD_PERCENT;
  let effectiveSpeakingThresholdPercent = DEFAULT_SPEAKING_THRESHOLD_PERCENT;
  let cameraResolution = "1280x720";
  let cameraFps = "30";
  let inputGainPercent = 100;
  let screenResolution = "1920x1080";
  let screenFps = "30";
  let screenShareMode: ScreenCaptureKind = "any";
  let cameraTestStream: MediaStream | null = null;
  let screenTestStream: MediaStream | null = null;
  let mediaDebugLogEntries: MediaDebugLogEntry[] = [];
  let participantAudioSettings = new Map<string, ParticipantAudioSetting>();
  let participantAudioMenuUserId: string | null = null;
  let latestDesktopUpdateState: DesktopUpdateState | null = null;
  const displayNameByUserId = new Map<string, string>();
  let remoteMediaAnnouncementInitialized = false;
  const remoteMediaStateByUserId = new Map<
    string,
    { cameraEnabled: boolean; screenSharing: boolean }
  >();

  try {
    uiSoundsEnabled = localStorage.getItem(UI_SOUNDS_STORAGE_KEY) !== "0";
    rnnoiseEnabled = localStorage.getItem(RNNOISE_ENABLED_STORAGE_KEY) !== "0";

    speakingDetectionMode = normalizeDetectionMode(
      localStorage.getItem(SPEAKING_MODE_STORAGE_KEY),
    );

    const storedThreshold = Number(
      localStorage.getItem(SPEAKING_THRESHOLD_STORAGE_KEY),
    );
    if (!Number.isNaN(storedThreshold)) {
      manualSpeakingThresholdPercent = clampThresholdPercent(storedThreshold);
      effectiveSpeakingThresholdPercent = manualSpeakingThresholdPercent;
    }

    cameraResolution =
      localStorage.getItem(CAMERA_RESOLUTION_STORAGE_KEY) ?? "1280x720";
    cameraFps = localStorage.getItem(CAMERA_FPS_STORAGE_KEY) ?? "30";
    inputGainPercent = clampInputGainPercent(
      Number(localStorage.getItem(INPUT_GAIN_STORAGE_KEY) ?? "100"),
    );
    screenResolution =
      localStorage.getItem(SCREEN_RESOLUTION_STORAGE_KEY) ?? "1920x1080";
    screenFps = localStorage.getItem(SCREEN_FPS_STORAGE_KEY) ?? "30";
    screenShareMode = normalizeScreenCaptureKind(
      localStorage.getItem(SCREEN_MODE_STORAGE_KEY),
    );

    const rawParticipantAudioSettings = localStorage.getItem(
      PARTICIPANT_AUDIO_SETTINGS_STORAGE_KEY,
    );
    if (rawParticipantAudioSettings) {
      const parsed = JSON.parse(rawParticipantAudioSettings) as Record<
        string,
        Partial<ParticipantAudioSetting>
      >;
      for (const [userId, setting] of Object.entries(parsed)) {
        if (!userId) {
          continue;
        }

        participantAudioSettings.set(userId, {
          muted: setting.muted === true,
          volumePercent: clampParticipantVolumePercent(
            Number(setting.volumePercent ?? 100),
          ),
        });
      }
    }

    const rawMediaDebugLog = localStorage.getItem(MEDIA_DEBUG_LOG_STORAGE_KEY);
    if (rawMediaDebugLog) {
      const parsed = JSON.parse(rawMediaDebugLog) as Array<
        Partial<MediaDebugLogEntry>
      >;

      mediaDebugLogEntries = parsed
        .filter((entry) => {
          return (
            typeof entry?.timestamp === "string" &&
            typeof entry?.level === "string" &&
            typeof entry?.scope === "string" &&
            typeof entry?.event === "string" &&
            typeof entry?.message === "string"
          );
        })
        .map((entry) => ({
          timestamp: entry.timestamp as string,
          level: entry.level as "info" | "warn" | "error",
          scope: entry.scope as
            | "audio"
            | "camera"
            | "screen"
            | "livekit"
            | "system",
          event: entry.event as string,
          message: entry.message as string,
          ...(entry.details ? { details: entry.details } : {}),
        }))
        .slice(-MAX_MEDIA_DEBUG_LOG_ENTRIES);
    }
  } catch {
    uiSoundsEnabled = true;
    rnnoiseEnabled = true;
    speakingDetectionMode = "auto";
    manualSpeakingThresholdPercent = DEFAULT_SPEAKING_THRESHOLD_PERCENT;
    effectiveSpeakingThresholdPercent = DEFAULT_SPEAKING_THRESHOLD_PERCENT;
    cameraResolution = "1280x720";
    cameraFps = "30";
    inputGainPercent = 100;
    screenResolution = "1920x1080";
    screenFps = "30";
    screenShareMode = "any";
    mediaDebugLogEntries = [];
    participantAudioSettings = new Map<string, ParticipantAudioSetting>();
  }

  uiSoundController.setEnabled(uiSoundsEnabled);

  let toastSequence = 0;
  let lastToastMessage = "";
  let lastToastAt = 0;

  const shouldShowToast = (message: string, isError: boolean): boolean => {
    if (isError) {
      return true;
    }

    const mutedInfoPatterns = [
      /Lobiye bir üye katıldı/i,
      /Bir üye lobiden ayrıldı/i,
      /Lobi güncellemeleri websocket üzerinden alınıyor/i,
    ];

    if (mutedInfoPatterns.some((pattern) => pattern.test(message))) {
      return false;
    }

    const now = Date.now();
    if (lastToastMessage === message && now - lastToastAt < 2500) {
      return false;
    }

    lastToastMessage = message;
    lastToastAt = now;
    return true;
  };

  const dismissToast = (toastElement: HTMLElement): void => {
    toastElement.classList.remove("visible");
    window.setTimeout(() => {
      toastElement.remove();
    }, 220);
  };

  const showToast = (
    message: string,
    tone: "info" | "error",
    autoDismissMs = TOAST_AUTO_HIDE_MS,
  ): void => {
    const toastElement = document.createElement("article");
    toastElement.className = `app-toast app-toast--${tone}`;
    toastElement.dataset.toastId = `${++toastSequence}`;

    const messageElement = document.createElement("p");
    messageElement.className = "app-toast-message";
    messageElement.textContent = message;

    const closeButton = document.createElement("button");
    closeButton.className = "app-toast-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Bildirimi kapat");
    closeButton.textContent = "Kapat";
    closeButton.addEventListener("click", () => {
      dismissToast(toastElement);
    });

    toastElement.appendChild(messageElement);
    toastElement.appendChild(closeButton);
    dom.toastContainer.appendChild(toastElement);

    const overflowToasts =
      dom.toastContainer.querySelectorAll<HTMLElement>(".app-toast");
    if (overflowToasts.length > MAX_TOAST_COUNT) {
      const removeCount = overflowToasts.length - MAX_TOAST_COUNT;
      for (let index = 0; index < removeCount; index += 1) {
        overflowToasts[index]?.remove();
      }
    }

    requestAnimationFrame(() => {
      toastElement.classList.add("visible");
    });

    window.setTimeout(() => {
      dismissToast(toastElement);
    }, autoDismissMs);
  };

  const setStatus = (message: string, isError: boolean): void => {
    const normalized = message.trim();
    if (!normalized) {
      return;
    }

    if (isError) {
      console.error(`[status] ${normalized}`);
    } else {
      console.info(`[status] ${normalized}`);
    }

    if (!shouldShowToast(normalized, isError)) {
      return;
    }

    showToast(normalized, isError ? "error" : "info", isError ? 6200 : 3800);
  };

  const shouldApplyLobbyRevision = (revision?: number): boolean => {
    if (typeof revision !== "number" || !Number.isFinite(revision)) {
      return true;
    }

    const normalized = Math.max(0, Math.floor(revision));
    if (normalized < latestLobbyRevision) {
      return false;
    }

    latestLobbyRevision = normalized;
    return true;
  };

  const resetRemoteMediaAnnouncementState = (): void => {
    remoteMediaAnnouncementInitialized = false;
    remoteMediaStateByUserId.clear();
  };

  const syncRemoteMediaAnnouncements = (
    members: LobbyMemberSnapshot[],
  ): void => {
    const selfId = authController.getSelfUserId();
    const nextState = new Map<
      string,
      { cameraEnabled: boolean; screenSharing: boolean }
    >();
    let shouldPlayAnnouncement = false;

    for (const member of members) {
      const nextMemberState = {
        cameraEnabled: member.cameraEnabled === true,
        screenSharing: member.screenSharing === true,
      };
      nextState.set(member.userId, nextMemberState);

      if (member.userId === selfId || !remoteMediaAnnouncementInitialized) {
        continue;
      }

      const previous = remoteMediaStateByUserId.get(member.userId);
      if (!previous) {
        if (nextMemberState.cameraEnabled || nextMemberState.screenSharing) {
          shouldPlayAnnouncement = true;
        }
        continue;
      }

      if (
        (!previous.cameraEnabled && nextMemberState.cameraEnabled) ||
        (!previous.screenSharing && nextMemberState.screenSharing)
      ) {
        shouldPlayAnnouncement = true;
      }
    }

    remoteMediaStateByUserId.clear();
    for (const [userId, state] of nextState.entries()) {
      remoteMediaStateByUserId.set(userId, state);
    }

    if (!remoteMediaAnnouncementInitialized) {
      remoteMediaAnnouncementInitialized = true;
      return;
    }

    if (shouldPlayAnnouncement) {
      uiSoundController.play("participant-share-on");
    }
  };

  const updaterController = createUpdaterViewController({
    dom,
    desktopApi,
    setStatus,
    getErrorMessage,
  });
  updaterController.bindEvents();

  const workspaceController = createWorkspaceController({
    dom,
    desktopApi,
    setStatus,
    onPageChanged: (page) => {
      if (page === "users") {
        void refreshLobby(true);
        void directoryController.refreshRegisteredUsers(true);
      }
    },
  });

  const lobbyController = createLobbyController(dom);
  const syncDisplayNameMapFromUsers = (
    users: RegisteredUserSnapshot[],
  ): void => {
    displayNameByUserId.clear();
    for (const user of users) {
      const displayName = user.displayName.trim();
      if (displayName.length > 0) {
        displayNameByUserId.set(user.userId, displayName);
      }
    }

    lobbyController.setDisplayNameMap(displayNameByUserId);
  };

  const applyLocalDisplayName = (userId: string, displayName: string): void => {
    const normalized = displayName.trim();
    if (normalized.length === 0) {
      displayNameByUserId.delete(userId);
    } else {
      displayNameByUserId.set(userId, normalized);
    }

    lobbyController.setDisplayNameMap(displayNameByUserId);
  };

  const directoryController = createDirectoryController({
    dom,
    desktopApi,
    lobbyController,
    getSelfUserId: () => selfUserId,
    setStatus,
    getErrorMessage,
    onUsersRefreshed: (users) => {
      syncDisplayNameMapFromUsers(users);
      void voiceController.onLobbyUpdated();
    },
  });

  const diagnosticsController = createDiagnosticsController({
    dom,
    setStatus,
    getMetrics: () => ({
      voiceConnected,
      realtimeConnectionStatus,
      realtimeLatencyMs,
      realtimePacketLossPercent,
      realtimeReconnectAttempts,
      latencySamplesMs,
    }),
  });
  diagnosticsController.bindEvents();

  const setConnectionState = (
    message: string,
    tone: "ok" | "warn" | "error",
  ): void => {
    dom.connectionState.textContent = message;
    dom.connectionBadge.dataset.state = tone;
  };

  const setVoiceState = (message: string, isError: boolean): void => {
    dom.voiceState.textContent = message;
    dom.voiceState.style.color = isError ? "#ffaaaa" : "#93a8be";
  };

  const persistMediaDebugLogs = (): void => {
    try {
      localStorage.setItem(
        MEDIA_DEBUG_LOG_STORAGE_KEY,
        JSON.stringify(mediaDebugLogEntries),
      );
    } catch {
      // no-op
    }
  };

  const stringifyMediaDebugDetails = (
    details?: Record<string, unknown>,
  ): string => {
    if (!details) {
      return "";
    }

    try {
      return JSON.stringify(details);
    } catch {
      return "[detay serilestirilemedi]";
    }
  };

  const formatMediaDebugEntry = (entry: MediaDebugLogEntry): string => {
    const detailsText = stringifyMediaDebugDetails(entry.details);
    const base = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.scope}] ${entry.event} - ${entry.message}`;
    return detailsText ? `${base}\n  details: ${detailsText}` : base;
  };

  const renderMediaDebugLogOutput = (): void => {
    if (mediaDebugLogEntries.length === 0) {
      dom.mediaDebugLogOutput.textContent =
        "Henüz medya tanılama kaydı yok. Kamera veya ekran yayını başlattığında loglar burada görünecek.";
      return;
    }

    dom.mediaDebugLogOutput.textContent = mediaDebugLogEntries
      .map((entry) => formatMediaDebugEntry(entry))
      .join("\n\n");
  };

  const appendMediaDebugLog = (entry: MediaDebugLogEntry): void => {
    mediaDebugLogEntries.push(entry);
    if (mediaDebugLogEntries.length > MAX_MEDIA_DEBUG_LOG_ENTRIES) {
      mediaDebugLogEntries = mediaDebugLogEntries.slice(
        mediaDebugLogEntries.length - MAX_MEDIA_DEBUG_LOG_ENTRIES,
      );
    }

    renderMediaDebugLogOutput();
    persistMediaDebugLogs();
  };

  const clearMediaDebugLogs = (): void => {
    mediaDebugLogEntries = [];
    renderMediaDebugLogOutput();
    persistMediaDebugLogs();
    setStatus("Medya tanılama logları temizlendi", false);
  };

  const copyMediaDebugLogs = async (): Promise<void> => {
    const content =
      mediaDebugLogEntries.length > 0
        ? mediaDebugLogEntries
            .map((entry) => formatMediaDebugEntry(entry))
            .join("\n\n")
        : "Medya logu bulunmuyor.";

    try {
      await navigator.clipboard.writeText(content);
      setStatus("Medya tanılama logları panoya kopyalandı", false);
    } catch {
      setStatus("Medya logları kopyalanamadı", true);
    }
  };

  const ensureBackgroundRealtimeConnection = async (): Promise<void> => {
    const result = await window.desktopApi.realtimeConnect();
    if (!result.ok) {
      setStatus(
        `Arka plan realtime bağlantısı kurulamadı: ${getErrorMessage(result.error)}`,
        true,
      );
    }
  };

  const updateOutputVolumeText = (value: number): void => {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    dom.outputVolumeValue.textContent = `${clamped}%`;
    dom.outputVolume.style.setProperty("--range-fill", `${clamped}%`);
  };

  const updateInputGainText = (value: number): void => {
    const clamped = clampInputGainPercent(value);
    dom.inputGainValue.textContent = `${clamped}%`;
    dom.inputGain.style.setProperty("--range-fill", `${clamped / 2}%`);
  };

  const syncSwitchButton = (
    button: HTMLButtonElement,
    enabled: boolean,
  ): void => {
    button.classList.toggle("enabled", enabled);
    button.setAttribute("aria-checked", enabled ? "true" : "false");
    button.dataset.stateLabel = enabled ? "Açık" : "Kapalı";
  };

  const updateSpeakingThresholdUi = (): void => {
    const effectiveThreshold = clampThresholdPercent(
      effectiveSpeakingThresholdPercent,
    );
    const currentThreshold =
      speakingDetectionMode === "manual"
        ? manualSpeakingThresholdPercent
        : effectiveThreshold;

    dom.speakingThresholdMode.value = speakingDetectionMode;
    dom.speakingThreshold.value = `${currentThreshold}`;
    dom.speakingThreshold.style.setProperty(
      "--threshold-level",
      `${currentThreshold}%`,
    );
    dom.speakingThreshold.disabled = speakingDetectionMode === "auto";

    if (speakingDetectionMode === "manual") {
      dom.speakingThresholdValue.textContent = `${manualSpeakingThresholdPercent}%`;
      dom.speakingThresholdHint.textContent =
        "Manuel mod: düşük değer daha hassas, yüksek değer daha az hassastır.";
      return;
    }

    dom.speakingThresholdValue.textContent = `${effectiveSpeakingThresholdPercent}% (Otomatik)`;
    dom.speakingThresholdHint.textContent =
      "Otomatik mod: ortam gürültüsüne göre eşik canlı güncellenir.";
  };

  const updateMicInputLevelUi = (levelPercent: number): void => {
    const clamped = Math.max(0, Math.min(100, Math.round(levelPercent)));
    dom.speakingThreshold.style.setProperty("--mic-level", `${clamped}%`);
  };

  const updateUiSoundsToggle = (): void => {
    syncSwitchButton(dom.uiSoundsToggle, uiSoundsEnabled);
  };

  const updateRnnoiseToggle = (): void => {
    syncSwitchButton(dom.rnnoiseToggle, rnnoiseEnabled);
  };

  const persistUiSoundsPreference = (): void => {
    try {
      localStorage.setItem(UI_SOUNDS_STORAGE_KEY, uiSoundsEnabled ? "1" : "0");
    } catch {
      // no-op
    }
  };

  const persistRnnoisePreference = (): void => {
    try {
      localStorage.setItem(
        RNNOISE_ENABLED_STORAGE_KEY,
        rnnoiseEnabled ? "1" : "0",
      );
    } catch {
      // no-op
    }
  };

  const persistInputGainPreference = (): void => {
    try {
      localStorage.setItem(INPUT_GAIN_STORAGE_KEY, `${inputGainPercent}`);
    } catch {
      // no-op
    }
  };

  const persistSpeakingDetectionPreference = (): void => {
    try {
      localStorage.setItem(SPEAKING_MODE_STORAGE_KEY, speakingDetectionMode);
      localStorage.setItem(
        SPEAKING_THRESHOLD_STORAGE_KEY,
        `${manualSpeakingThresholdPercent}`,
      );
    } catch {
      // no-op
    }
  };

  const persistSharePreferences = (): void => {
    try {
      localStorage.setItem(CAMERA_RESOLUTION_STORAGE_KEY, cameraResolution);
      localStorage.setItem(CAMERA_FPS_STORAGE_KEY, cameraFps);
      localStorage.setItem(SCREEN_RESOLUTION_STORAGE_KEY, screenResolution);
      localStorage.setItem(SCREEN_FPS_STORAGE_KEY, screenFps);
      localStorage.setItem(SCREEN_MODE_STORAGE_KEY, screenShareMode);
    } catch {
      // no-op
    }
  };

  const persistParticipantAudioSettings = (): void => {
    try {
      localStorage.setItem(
        PARTICIPANT_AUDIO_SETTINGS_STORAGE_KEY,
        JSON.stringify(Object.fromEntries(participantAudioSettings.entries())),
      );
    } catch {
      // no-op
    }
  };

  const resolveParticipantAudioSetting = (
    userId: string,
  ): ParticipantAudioSetting => {
    const existing = participantAudioSettings.get(userId);
    if (existing) {
      return {
        muted: existing.muted,
        volumePercent: clampParticipantVolumePercent(existing.volumePercent),
      };
    }

    const fromVoice = voiceController.getRemoteParticipantAudioState(userId);
    return {
      muted: fromVoice.muted,
      volumePercent: clampParticipantVolumePercent(fromVoice.volumePercent),
    };
  };

  const applyParticipantAudioSetting = (
    userId: string,
    setting: ParticipantAudioSetting,
  ): void => {
    participantAudioSettings.set(userId, {
      muted: setting.muted,
      volumePercent: clampParticipantVolumePercent(setting.volumePercent),
    });
    voiceController.setRemoteParticipantAudioState(userId, {
      muted: setting.muted,
      volumePercent: setting.volumePercent,
    });
  };

  const updateParticipantAudioMenuUi = (
    userId: string,
    setting: ParticipantAudioSetting,
  ): void => {
    const normalizedVolume = clampParticipantVolumePercent(
      setting.volumePercent,
    );
    const displayName = lobbyController.resolveMemberName(userId);
    dom.participantAudioMenuTitle.textContent = `${displayName} ses ayarı`;
    dom.participantAudioMuteToggle.classList.toggle("active", setting.muted);
    dom.participantAudioMuteToggle.textContent = setting.muted
      ? "Susturmayı kaldır"
      : "Bu kullanıcıyı sustur";
    dom.participantAudioVolumeSlider.value = `${normalizedVolume}`;
    dom.participantAudioVolumeSlider.style.setProperty(
      "--range-fill",
      `${normalizedVolume / 2}%`,
    );
    dom.participantAudioVolumeValue.textContent = `${normalizedVolume}%`;
  };

  const closeParticipantAudioMenu = (): void => {
    participantAudioMenuUserId = null;
    dom.participantAudioMenu.classList.add("hidden");
    dom.participantAudioMenu.setAttribute("aria-hidden", "true");
  };

  const openParticipantAudioMenu = (
    userId: string,
    clientX: number,
    clientY: number,
  ): void => {
    const setting = resolveParticipantAudioSetting(userId);
    participantAudioMenuUserId = userId;

    applyParticipantAudioSetting(userId, setting);
    updateParticipantAudioMenuUi(userId, setting);

    dom.participantAudioMenu.classList.remove("hidden");
    dom.participantAudioMenu.setAttribute("aria-hidden", "false");

    const menuWidth = dom.participantAudioMenu.offsetWidth || 300;
    const menuHeight = dom.participantAudioMenu.offsetHeight || 180;
    const nextLeft = Math.min(
      Math.max(8, clientX),
      window.innerWidth - menuWidth - 8,
    );
    const nextTop = Math.min(
      Math.max(8, clientY),
      window.innerHeight - menuHeight - 8,
    );

    dom.participantAudioMenu.style.left = `${nextLeft}px`;
    dom.participantAudioMenu.style.top = `${nextTop}px`;
  };

  const handleParticipantAudioVolumeUpdate = (
    userId: string,
    volumePercent: number,
  ): void => {
    const current = resolveParticipantAudioSetting(userId);
    const next = {
      ...current,
      volumePercent: clampParticipantVolumePercent(volumePercent),
    };

    applyParticipantAudioSetting(userId, next);
    updateParticipantAudioMenuUi(userId, next);
    persistParticipantAudioSettings();
  };

  const toggleParticipantMute = (userId: string): void => {
    const current = resolveParticipantAudioSetting(userId);
    const next = {
      ...current,
      muted: !current.muted,
    };

    applyParticipantAudioSetting(userId, next);
    updateParticipantAudioMenuUi(userId, next);
    persistParticipantAudioSettings();
    setStatus(
      next.muted
        ? `${lobbyController.resolveMemberName(userId)} sizin icin susturuldu`
        : `${lobbyController.resolveMemberName(userId)} için ses açıldı`,
      false,
    );
  };

  const resolveContextMenuUserId = (
    target: EventTarget | null,
  ): string | null => {
    if (!(target instanceof HTMLElement)) {
      return null;
    }

    const row = target.closest<HTMLElement>("[data-user-id]");
    const mediaSlot = target.closest<HTMLElement>(
      "[data-participant-media-slot]",
    );
    const userId =
      row?.dataset.userId ?? mediaSlot?.dataset.participantMediaSlot;
    if (!userId || userId === selfUserId) {
      return null;
    }

    return userId;
  };

  const getCameraShareOptions = (): CameraShareOptions => {
    const resolution = parseResolution(cameraResolution);
    const fps = Number(cameraFps);
    return {
      quality: {
        width: resolution.width,
        height: resolution.height,
        fps: Number.isFinite(fps) ? fps : 30,
      },
    };
  };

  const getScreenShareOptions = (sourceId?: string): ScreenShareOptions => {
    const resolution = parseResolution(screenResolution);
    const fps = Number(screenFps);
    const options: ScreenShareOptions = {
      quality: {
        width: resolution.width,
        height: resolution.height,
        fps: Number.isFinite(fps) ? fps : 30,
      },
    };

    if (sourceId) {
      options.sourceId = sourceId;
    }

    return options;
  };

  const stopPreviewStream = (
    stream: MediaStream | null,
    video: HTMLVideoElement,
  ): void => {
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // no-op
        }
      }
    }

    video.srcObject = null;
  };

  const stopCameraTest = (): void => {
    stopPreviewStream(cameraTestStream, dom.cameraTestPreview);
    cameraTestStream = null;
    dom.cameraTestToggle.textContent = "Kamera Testini Başlat";
  };

  const stopScreenTest = (): void => {
    stopPreviewStream(screenTestStream, dom.screenTestPreview);
    screenTestStream = null;
    dom.screenTestToggle.textContent = "Ekran Testini Başlat";
  };

  const stopAllShareTests = (): void => {
    stopCameraTest();
    stopScreenTest();
  };

  lifecycle.add(() => {
    directoryController.stopFriendsPresenceAutoRefresh();
  });
  lifecycle.add(() => {
    stopAllShareTests();
  });
  lifecycle.add(() => {
    voiceController.destroy();
  });

  const updateQuickMicButton = (): void => {
    dom.quickMicToggle.classList.toggle("active", !isMuted);
    dom.quickMicToggle.dataset.stateText = isMuted ? "OFF" : "ON";
    dom.quickMicToggle.title = isMuted ? "Mikrofon Kapalı" : "Mikrofon Açık";
  };

  const updateQuickHeadphoneButton = (): void => {
    dom.quickHeadphoneToggle.classList.toggle("active", !isHeadphoneMuted);
    dom.quickHeadphoneToggle.dataset.stateText = isHeadphoneMuted
      ? "OFF"
      : "ON";
    dom.quickHeadphoneToggle.title = isHeadphoneMuted
      ? "Kulaklık Sessiz"
      : "Kulaklık Aktif";
  };

  const updateQuickConnectionButton = (): void => {
    dom.quickConnectionToggle.classList.toggle("active", voiceConnected);
    dom.quickConnectionToggle.classList.toggle("danger", voiceConnected);
    dom.quickConnectionToggle.dataset.stateText = voiceConnected ? "ON" : "OFF";
    dom.quickConnectionToggle.title = voiceConnected
      ? "Sohbetten Çık"
      : "Sohbete Bağlan";
    dom.quickConnectionLabel.textContent = voiceConnected
      ? "Sohbetten Çık"
      : "Sohbete Bağlan";
    diagnosticsController.updateConnectionDiagnostics();
  };

  const updateCameraShareButton = (): void => {
    dom.quickCameraToggle.classList.toggle("active", cameraSharing);
    dom.quickCameraToggle.dataset.stateText = cameraSharing ? "ON" : "OFF";
    dom.quickCameraToggle.title = cameraSharing
      ? "Kamerayı Kapat"
      : "Kamerayı Aç";
    dom.quickCameraToggle.disabled = !voiceConnected;
  };

  const updateScreenShareButton = (): void => {
    dom.quickScreenToggle.classList.toggle("active", screenSharing);
    dom.quickScreenToggle.dataset.stateText = screenSharing ? "ON" : "OFF";
    dom.quickScreenToggle.title = screenSharing
      ? "Paylaşımı Durdur"
      : "Ekran Paylaş";
    dom.quickScreenToggle.disabled = !voiceConnected;
  };

  const updateMuteButton = (): void => {
    updateQuickMicButton();
  };

  const updateSelfLobbyMemberState = (
    patch: Partial<LobbyMemberSnapshot>,
  ): void => {
    const selfId = authController.getSelfUserId();
    if (!selfId) {
      return;
    }

    const current = lobbyController.getMembersMap().get(selfId);
    if (!current) {
      return;
    }

    lobbyController.addOrUpdateMember({
      ...current,
      ...patch,
    });
    directoryController.renderUserDirectory();
  };

  const applySelfLobbyRealtimeOverrides = (
    member: LobbyMemberSnapshot,
  ): LobbyMemberSnapshot => {
    if (!selfUserId || member.userId !== selfUserId) {
      return member;
    }

    return {
      ...member,
      muted: isMuted,
      deafened: isHeadphoneMuted,
      speaking: isMuted ? false : isSpeaking,
    };
  };

  const syncSpeakingState = async (speaking: boolean): Promise<void> => {
    if (!voiceConnected) {
      return;
    }

    const result = await window.desktopApi.lobbySpeaking(speaking);
    if (!result.ok && result.error?.statusCode !== 404) {
      setStatus(
        `Konuşma durumu güncellenemedi: ${getErrorMessage(result.error)}`,
        true,
      );
    }
  };

  const authController = createAuthViewController({
    dom,
    setConnectionState,
    onUnauthenticated: () => {
      workspaceController.setWorkspacePage("lobby");
      workspaceController.setSettingsTab("profile");
      closeParticipantAudioMenu();
      directoryController.stopFriendsPresenceAutoRefresh();
      selfUserId = null;
      displayNameByUserId.clear();
      lobbyController.setDisplayNameMap(displayNameByUserId);
      directoryController.clearUsers();
      directoryController.renderUserDirectory();
      lobbyController.clearLobby();
      latestLobbyRevision = 0;
      resetRemoteMediaAnnouncementState();
      voiceController.cleanupForLobbyExit();
      stopAllShareTests();
      voiceConnected = false;
      cameraSharing = false;
      screenSharing = false;
      voiceJoinLatencyMs = null;
      updateQuickConnectionButton();
      updateCameraShareButton();
      updateScreenShareButton();
      dom.profileForm.reset();
      dom.passwordForm.reset();
      dom.currentUser.textContent = "-";
    },
  });

  const voiceController = createVoiceController({
    dom,
    rtcConfig: runtimeConfig.desktopRtcConfig as RTCConfiguration,
    initialRnnoiseEnabled: rnnoiseEnabled,
    initialInputGainPercent: inputGainPercent,
    setStatus,
    setVoiceState,
    onLocalSpeakingChanged: (speaking) => {
      isSpeaking = speaking;
      void syncSpeakingState(speaking && !isMuted);
    },
    onSpeakingThresholdChanged: ({ effectivePercent }) => {
      effectiveSpeakingThresholdPercent = effectivePercent;
      if (speakingDetectionMode === "auto") {
        updateSpeakingThresholdUi();
      }
    },
    onInputLevelChanged: ({ levelPercent }) => {
      updateMicInputLevelUi(levelPercent);
    },
    onCameraShareChanged: (enabled) => {
      cameraSharing = enabled;
      updateCameraShareButton();
    },
    onScreenShareChanged: (enabled) => {
      screenSharing = enabled;
      updateScreenShareButton();
    },
    getIsMuted: () => isMuted,
    getLiveKitDefaultRoom: () => runtimeConfig.liveKitDefaultRoom,
    getSelfUserId: () => authController.getSelfUserId(),
    getLobbyMembers: () => lobbyController.getMembersMap(),
    resolveMemberName: (userId: string) =>
      lobbyController.resolveMemberName(userId),
    onConnectionMetrics: ({ latencyMs, packetLossPercent, connected }) => {
      realtimeLatencyMs = connected ? latencyMs : null;
      realtimePacketLossPercent = connected
        ? Math.max(0, Math.min(100, packetLossPercent))
        : 0;
      realtimeReconnectAttempts = 0;

      if (!connected) {
        latencySamplesMs.length = 0;
      } else if (typeof latencyMs === "number" && Number.isFinite(latencyMs)) {
        latencySamplesMs.push(Math.max(0, Math.round(latencyMs)));
        if (latencySamplesMs.length > 30) {
          latencySamplesMs.shift();
        }
      }

      diagnosticsController.updateConnectionDiagnostics();
    },
    onMediaDebugLog: (entry) => {
      appendMediaDebugLog(entry);
    },
  });

  for (const [userId, setting] of participantAudioSettings.entries()) {
    voiceController.setRemoteParticipantAudioState(userId, {
      muted: setting.muted,
      volumePercent: clampParticipantVolumePercent(setting.volumePercent),
    });
  }

  const shareModalController = createBootstrapShareModalController({
    dom,
    desktopApi,
    setStatus,
    getErrorMessage,
    getScreenShareMode: () => screenShareMode,
    getScreenResolution: () => screenResolution,
    getScreenFps: () => screenFps,
    getCameraShareOptions,
    getScreenShareOptions,
    createCameraPreviewStream: (options) =>
      voiceController.createCameraTestStream(options),
  });

  const setSelectValueSafely = (
    select: HTMLSelectElement,
    value: string,
    fallback: string,
  ): string => {
    const hasValue = Array.from(select.options).some(
      (option) => option.value === value,
    );
    select.value = hasValue ? value : fallback;
    return select.value;
  };

  const applyShareSettingsUi = (): void => {
    cameraResolution = setSelectValueSafely(
      dom.cameraResolutionSelect,
      cameraResolution,
      "1280x720",
    );
    cameraFps = setSelectValueSafely(dom.cameraFpsSelect, cameraFps, "30");
    screenResolution = setSelectValueSafely(
      dom.screenResolutionSelect,
      screenResolution,
      "1920x1080",
    );
    screenFps = setSelectValueSafely(dom.screenFpsSelect, screenFps, "30");
    screenShareMode = normalizeScreenCaptureKind(screenShareMode);
    dom.screenShareModeSelect.value = screenShareMode;

    screenResolution = setSelectValueSafely(
      dom.modalScreenResolutionSelect,
      screenResolution,
      "1920x1080",
    );
    screenFps = setSelectValueSafely(dom.modalScreenFpsSelect, screenFps, "30");
    shareModalController.setScreenCaptureTab(
      screenShareMode === "window" ? "window" : "screen",
    );
  };

  const handleCameraShareToggle = async (): Promise<void> => {
    if (!voiceConnected) {
      setStatus("Önce sohbete bağlanın", true);
      return;
    }

    if (cameraSharing) {
      try {
        const enabled = await voiceController.toggleCameraShare();
        cameraSharing = enabled;
        updateCameraShareButton();
        setStatus("Kamera paylaşımı durduruldu", false);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "bilinmeyen hata";
        setStatus(`Kamera paylaşımı değiştirilemedi: ${message}`, true);
      }
      return;
    }

    const confirmed =
      await shareModalController.requestCameraShareConfirmation();
    if (!confirmed) {
      setStatus("Kamera paylaşımı iptal edildi", false);
      return;
    }

    try {
      const enabled = await voiceController.toggleCameraShare(
        getCameraShareOptions(),
      );
      cameraSharing = enabled;
      updateCameraShareButton();
      setStatus(
        enabled ? "Kamera paylaşımı başlatıldı" : "Kamera paylaşımı durduruldu",
        false,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "bilinmeyen hata";
      setStatus(`Kamera paylaşımı değiştirilemedi: ${message}`, true);
    }
  };

  const handleScreenShareToggle = async (): Promise<void> => {
    if (!voiceConnected) {
      setStatus("Önce sohbete bağlanın", true);
      return;
    }

    if (screenTestStream) {
      stopScreenTest();
    }

    if (screenSharing) {
      try {
        const enabled = await voiceController.toggleScreenShare();
        screenSharing = enabled;
        updateScreenShareButton();
        setStatus("Ekran paylaşımı durduruldu", false);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "bilinmeyen hata";
        setStatus(`Ekran paylaşımı değiştirilemedi: ${message}`, true);
      }
      return;
    }

    const selectedSource =
      await shareModalController.requestScreenCaptureSourceSelection();
    if (!selectedSource) {
      setStatus("Ekran paylaşımı seçimi iptal edildi", false);
      return;
    }

    try {
      const enabled = await voiceController.toggleScreenShare(
        getScreenShareOptions(selectedSource.id),
      );
      screenSharing = enabled;
      updateScreenShareButton();
      setStatus(
        enabled
          ? `Ekran paylaşımı başlatıldı (${selectedSource.name})`
          : "Ekran paylaşımı durduruldu",
        false,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "bilinmeyen hata";
      setStatus(`Ekran paylaşımı değiştirilemedi: ${message}`, true);
    }
  };

  const runCameraTest = async (): Promise<void> => {
    if (cameraTestStream) {
      stopCameraTest();
      setStatus("Kamera testi durduruldu", false);
      return;
    }

    try {
      cameraTestStream = await voiceController.createCameraTestStream(
        getCameraShareOptions(),
      );
      dom.cameraTestPreview.srcObject = cameraTestStream;
      await dom.cameraTestPreview.play().catch(() => {
        // no-op
      });
      dom.cameraTestToggle.textContent = "Kamera Testini Durdur";
      setStatus("Kamera testi başlatıldı", false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "bilinmeyen hata";
      setStatus(`Kamera testi başlatılamadı: ${message}`, true);
    }
  };

  const runScreenTest = async (): Promise<void> => {
    if (screenTestStream) {
      stopScreenTest();
      setStatus("Ekran testi durduruldu", false);
      return;
    }

    const selectedSource =
      await shareModalController.requestScreenCaptureSourceSelection(
        "Onayla ve Test Et",
      );
    if (!selectedSource) {
      setStatus("Ekran testi seçimi iptal edildi", false);
      return;
    }

    try {
      screenTestStream = await voiceController.createScreenTestStream(
        getScreenShareOptions(selectedSource.id),
      );
      dom.screenTestPreview.srcObject = screenTestStream;
      await dom.screenTestPreview.play().catch(() => {
        // no-op
      });
      dom.screenTestToggle.textContent = "Ekran Testini Durdur";
      setStatus(`Ekran testi başlatıldı (${selectedSource.name})`, false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "bilinmeyen hata";
      setStatus(`Ekran testi başlatılamadı: ${message}`, true);
    }
  };

  const loadProfileFromBackend = async (): Promise<void> => {
    const profileResult = await window.desktopApi.getProfile();
    if (!profileResult.ok || !profileResult.data) {
      setStatus(
        `Profil bilgisi alınamadı: ${getErrorMessage(profileResult.error)}`,
        true,
      );
      return;
    }

    const { profile } = profileResult.data;
    dom.profileDisplayName.value = profile.displayName;
    dom.profileEmail.value = profile.email ?? "";
    dom.profileBio.value = profile.bio ?? "";
    dom.currentUser.textContent = profile.displayName;
    if (selfUserId) {
      applyLocalDisplayName(selfUserId, profile.displayName);
      void voiceController.onLobbyUpdated();
    }
  };

  const connectRealtimeAndJoin = async (): Promise<boolean> => {
    const connectResult = await window.desktopApi.realtimeConnect();
    if (!connectResult.ok) {
      setStatus(
        `Realtime bağlantısı kurulamadı: ${getErrorMessage(connectResult.error)}`,
        true,
      );
      return false;
    }

    const joinResult = await window.desktopApi.lobbyJoin();
    if (!joinResult.ok) {
      setStatus(
        `Lobiye katılım başarısız: ${getErrorMessage(joinResult.error)}`,
        true,
      );
      return false;
    }

    return true;
  };

  const refreshLobby = async (silent = false): Promise<void> => {
    const result = await window.desktopApi.realtimeConnect();
    if (!result.ok) {
      if (!silent) {
        setStatus(
          `Lobi realtime bağlantısı kurulamadı: ${getErrorMessage(result.error)}`,
          true,
        );
      }
      if (result.error?.statusCode === 401) {
        authController.renderSession({ authenticated: false, user: null });
      }
      return;
    }

    if (!silent) {
      setStatus("Lobi güncellemeleri websocket üzerinden alınıyor", false);
    }
  };
  const connectToChat = async (): Promise<boolean> => {
    const joinStartedAt = performance.now();

    const realtimeReady = await connectRealtimeAndJoin();
    if (!realtimeReady) {
      voiceJoinLatencyMs = null;
      return false;
    }

    try {
      await voiceController.startVoice();
    } catch (error) {
      await window.desktopApi.lobbyLeave().catch(() => undefined);
      const message =
        error instanceof Error ? error.message : "bilinmeyen hata";
      setStatus(`Ses başlatılamadı: ${message}`, true);
      setVoiceState("Ses başlatılamadı", true);
      voiceJoinLatencyMs = null;
      return false;
    }

    const muteSync = await window.desktopApi.lobbyMute(isMuted);
    if (!muteSync.ok && muteSync.error?.statusCode !== 404) {
      setStatus(
        `Mikrofon durumu senkronlanamadı: ${getErrorMessage(muteSync.error)}`,
        true,
      );
    }

    const deafenSync = await window.desktopApi.lobbyDeafen(isHeadphoneMuted);
    if (!deafenSync.ok && deafenSync.error?.statusCode !== 404) {
      setStatus(
        `Kulaklık durumu senkronlanamadı: ${getErrorMessage(deafenSync.error)}`,
        true,
      );
    }

    await syncSpeakingState(isSpeaking && !isMuted);
    updateSelfLobbyMemberState({
      muted: isMuted,
      deafened: isHeadphoneMuted,
      speaking: isSpeaking && !isMuted,
    });

    voiceConnected = true;
    voiceJoinLatencyMs = Math.round(performance.now() - joinStartedAt);
    updateQuickConnectionButton();
    updateCameraShareButton();
    updateScreenShareButton();
    uiSoundController.play("connect");
    setStatus("Sohbete bağlanıldı", false);
    return true;
  };

  const disconnectFromChat = async (): Promise<boolean> => {
    await voiceController.stopVoice();
    isSpeaking = false;

    const muteResult = await window.desktopApi.lobbyMute(true);
    if (!muteResult.ok && muteResult.error?.statusCode !== 404) {
      setStatus(
        `Mikrofon durumu güncellenemedi: ${getErrorMessage(muteResult.error)}`,
        true,
      );
    }

    const leaveResult = await window.desktopApi.lobbyLeave();
    if (!leaveResult.ok && leaveResult.error?.statusCode !== 404) {
      setStatus(
        `Sohbetten çıkış başarısız: ${getErrorMessage(leaveResult.error)}`,
        true,
      );
      return false;
    }

    voiceController.cleanupForLobbyExit();
    resetRemoteMediaAnnouncementState();
    stopAllShareTests();
    isMuted = true;
    updateMuteButton();
    voiceConnected = false;
    voiceJoinLatencyMs = null;
    cameraSharing = false;
    screenSharing = false;
    updateQuickConnectionButton();
    updateCameraShareButton();
    updateScreenShareButton();
    uiSoundController.play("disconnect");
    setStatus("Sohbetten çıkıldı", false);
    return true;
  };

  const setMicMuted = async (
    nextMuted: boolean,
    playSound = true,
  ): Promise<boolean> => {
    if (isMuted === nextMuted) {
      updateMuteButton();
      return true;
    }

    if (!nextMuted && isHeadphoneMuted) {
      isHeadphoneMuted = false;
      voiceController.setOutputMuted(false);

      if (voiceConnected) {
        const deafenResult = await window.desktopApi.lobbyDeafen(false);
        if (!deafenResult.ok && deafenResult.error?.statusCode !== 404) {
          setStatus(
            `Kulaklık durumu güncellenemedi: ${getErrorMessage(deafenResult.error)}`,
            true,
          );
        }
      }

      updateQuickHeadphoneButton();
    }

    const prevMuted = isMuted;
    isMuted = nextMuted;

    if (voiceConnected) {
      const result = await window.desktopApi.lobbyMute(isMuted);
      if (!result.ok && result.error?.statusCode !== 404) {
        isMuted = prevMuted;
        setStatus(
          `Mikrofon durumu güncellenemedi: ${getErrorMessage(result.error)}`,
          true,
        );
        updateMuteButton();
        return false;
      }
    }

    voiceController.syncMuteState();
    if (isMuted) {
      isSpeaking = false;
      await syncSpeakingState(false);
    }
    updateSelfLobbyMemberState({
      muted: isMuted,
      speaking: isSpeaking && !isMuted,
    });
    updateMuteButton();
    if (playSound) {
      uiSoundController.play(isMuted ? "mic-off" : "mic-on");
    }
    setStatus(isMuted ? "Mikrofon kapatıldı" : "Mikrofon açıldı", false);
    return true;
  };

  const unsubscribeRealtime = subscribeBootstrapRealtimeOrchestrator({
    shouldApplyLobbyRevision,
    applySelfLobbyRealtimeOverrides,
    syncRemoteMediaAnnouncements,
    isRemoteMediaAnnouncementInitialized: () =>
      remoteMediaAnnouncementInitialized,
    getSelfUserId: () => authController.getSelfUserId(),
    setStatus,
    playUiSound: (effect) => {
      uiSoundController.play(effect);
    },
    setConnectionState,
    onConnected: () => {
      latestLobbyRevision = 0;
      realtimeConnectionStatus = "connected";
    },
    setRealtimeConnectionStatus: (status) => {
      realtimeConnectionStatus = status;
    },
    setRealtimeLatencyMs: (value) => {
      realtimeLatencyMs = value;
    },
    setRealtimePacketLossPercent: (value) => {
      realtimePacketLossPercent = value;
    },
    setRealtimeTransport: (value) => {
      realtimeTransport = value;
    },
    setRealtimeReconnectAttempts: (value) => {
      realtimeReconnectAttempts = value;
    },
    latencySamplesMs,
    resetRemoteMediaAnnouncementState,
    handleDisconnectedState: () => {
      voiceController.cleanupForLobbyExit();
      resetRemoteMediaAnnouncementState();
      stopAllShareTests();
      voiceConnected = false;
      cameraSharing = false;
      screenSharing = false;
      updateQuickConnectionButton();
      updateCameraShareButton();
      updateScreenShareButton();
    },
    updateDiagnostics: () => {
      diagnosticsController.updateConnectionDiagnostics();
    },
    onLobbyStateApplied: (members) => {
      lobbyController.renderLobby({
        members,
        size: members.length,
      });
      directoryController.renderUserDirectory();
      void voiceController.onLobbyUpdated();
    },
    onMemberJoinedApplied: (member) => {
      remoteMediaStateByUserId.set(member.userId, {
        cameraEnabled: member.cameraEnabled === true,
        screenSharing: member.screenSharing === true,
      });
      lobbyController.addOrUpdateMember(member);
      directoryController.renderUserDirectory();
      void voiceController.onLobbyUpdated();
    },
    onMemberUpdatedApplied: (member) => {
      remoteMediaStateByUserId.set(member.userId, {
        cameraEnabled: member.cameraEnabled === true,
        screenSharing: member.screenSharing === true,
      });
      lobbyController.addOrUpdateMember(member);
      directoryController.renderUserDirectory();
      void voiceController.onLobbyUpdated();
    },
    onMemberLeftApplied: (userId) => {
      remoteMediaStateByUserId.delete(userId);
      lobbyController.removeMember(userId);
      directoryController.renderUserDirectory();
      voiceController.onMemberLeft(userId);
    },
    onRtcSignal: (payload: RtcSignalPayload) => {
      void voiceController.handleIncomingSignal(payload);
    },
    onProducerAvailable: (payload) => {
      void voiceController.handleProducerAvailable(payload);
    },
    onProducerClosed: (producerId) => {
      voiceController.handleProducerClosed(producerId);
    },
  });
  lifecycle.add(unsubscribeRealtime);

  authController.bindNavigationEvents();

  workspaceController.bindEvents();
  await workspaceController.initialize();
  lifecycle.add(() => {
    workspaceController.cleanup();
  });

  dom.gpuRestartButton.addEventListener("click", async () => {
    const previousLabel = dom.gpuRestartButton.textContent;
    dom.gpuRestartButton.disabled = true;
    dom.gpuRestartButton.textContent = "Yeniden baslatiliyor...";
    setStatus("Uygulama yeniden baslatiliyor...", false);

    try {
      const result = await desktopApi.restartApp();
      if (!result.ok) {
        throw result.error;
      }
    } catch (error) {
      dom.gpuRestartButton.disabled = false;
      dom.gpuRestartButton.textContent = previousLabel;
      setStatus(
        `Uygulama yeniden baslatilamadi: ${getErrorMessage(error as { message?: string })}`,
        true,
      );
    }
  });

  bindContextMenuAndParticipantAudioControls({
    dom,
    lifecycle,
    getParticipantAudioMenuUserId: () => participantAudioMenuUserId,
    closeParticipantAudioMenu,
    resolveContextMenuUserId,
    openParticipantAudioMenu,
    toggleParticipantMute,
    updateParticipantAudioVolume: handleParticipantAudioVolumeUpdate,
  });

  const handleQuickHeadphoneToggle = async (): Promise<void> => {
    isHeadphoneMuted = !isHeadphoneMuted;
    voiceController.setOutputMuted(isHeadphoneMuted);

    if (voiceConnected) {
      const deafenResult =
        await window.desktopApi.lobbyDeafen(isHeadphoneMuted);
      if (!deafenResult.ok && deafenResult.error?.statusCode !== 404) {
        setStatus(
          `Kulaklık durumu güncellenemedi: ${getErrorMessage(deafenResult.error)}`,
          true,
        );
      }
    }

    if (isHeadphoneMuted) {
      await setMicMuted(true, false);
    }

    updateSelfLobbyMemberState({
      deafened: isHeadphoneMuted,
      speaking: isSpeaking && !isMuted,
    });

    uiSoundController.play(isHeadphoneMuted ? "headphone-off" : "headphone-on");
    updateQuickHeadphoneButton();
    setStatus(
      isHeadphoneMuted
        ? "Kulaklık çıkışı sessize alındı"
        : "Kulaklık çıkışı tekrar açıldı",
      false,
    );
  };

  const handleUiSoundsToggle = (): void => {
    uiSoundsEnabled = !uiSoundsEnabled;
    uiSoundController.setEnabled(uiSoundsEnabled);
    updateUiSoundsToggle();
    persistUiSoundsPreference();
    setStatus(
      uiSoundsEnabled
        ? "Arayüz sesleri etkinleştirildi"
        : "Arayüz sesleri kapatıldı",
      false,
    );
  };

  const handleRnnoiseToggle = async (): Promise<void> => {
    const nextValue = !rnnoiseEnabled;
    dom.rnnoiseToggle.disabled = true;
    try {
      const applied = await voiceController.setRnnoiseEnabled(nextValue);
      rnnoiseEnabled = applied;
      updateRnnoiseToggle();
      persistRnnoisePreference();
      setStatus(
        rnnoiseEnabled
          ? "RNNoise gürültü engelleme etkinleştirildi"
          : "RNNoise gürültü engelleme kapatıldı",
        false,
      );
    } catch (error) {
      updateRnnoiseToggle();
      const message =
        error instanceof Error ? error.message : "bilinmeyen hata";
      setStatus(`RNNoise ayarı değiştirilemedi: ${message}`, true);
    } finally {
      dom.rnnoiseToggle.disabled = false;
    }
  };

  dom.quickConnectionToggle.addEventListener("click", async () => {
    if (voiceConnected) {
      await disconnectFromChat();
      await refreshLobby();
      return;
    }

    const connected = await connectToChat();
    if (connected) {
      await refreshLobby();
    }
  });

  bindVoiceSettingsControls({
    dom,
    onQuickMicToggle: async () => {
      await setMicMuted(!isMuted);
    },
    onQuickHeadphoneToggle: handleQuickHeadphoneToggle,
    onUiSoundsToggle: handleUiSoundsToggle,
    onRnnoiseToggle: handleRnnoiseToggle,
    onMicrophoneChange: async (deviceId) => {
      try {
        await voiceController.handleMicrophoneChange(deviceId);
      } catch {
        setStatus("Mikrofon değiştirilemedi", true);
      }
    },
    onMicTestToggle: async () => {
      try {
        return await voiceController.toggleMicTest();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "bilinmeyen hata";
        setStatus(`Ses testi başlatılamadı: ${message}`, true);
        return false;
      }
    },
    onOutputVolumeInput: (value) => {
      voiceController.setOutputVolume(value);
      updateOutputVolumeText(value);
    },
    onInputGainInput: (value) => {
      inputGainPercent = clampInputGainPercent(value);
      updateInputGainText(inputGainPercent);
    },
    onInputGainChange: (value) => {
      inputGainPercent = clampInputGainPercent(value);
      updateInputGainText(inputGainPercent);
      persistInputGainPreference();
      void voiceController
        .setInputGain(inputGainPercent)
        .then(() => {
          setStatus(
            `Mikrofon ses kazancı %${inputGainPercent} olarak ayarlandı`,
            false,
          );
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : "bilinmeyen hata";
          setStatus(`Mikrofon ses kazancı ayarlanamadı: ${message}`, true);
        });
    },
    onSpeakingModeChange: (value) => {
      speakingDetectionMode = normalizeDetectionMode(value);
      voiceController.setSpeakingDetectionMode(speakingDetectionMode);
      updateSpeakingThresholdUi();
      persistSpeakingDetectionPreference();
      setStatus(
        speakingDetectionMode === "auto"
          ? "Ses algılama otomatik moda alındı"
          : "Ses algılama manuel moda alındı",
        false,
      );
    },
    onSpeakingThresholdInput: (value) => {
      manualSpeakingThresholdPercent = clampThresholdPercent(value);
      voiceController.setManualSpeakingThreshold(
        manualSpeakingThresholdPercent,
      );
      updateSpeakingThresholdUi();
      persistSpeakingDetectionPreference();
    },
    onSpeakingThresholdChange: () => {
      setStatus(
        `Manuel konuşma eşiği %${manualSpeakingThresholdPercent} olarak ayarlandı`,
        false,
      );
    },
    defaultSpeakingThresholdPercent: DEFAULT_SPEAKING_THRESHOLD_PERCENT,
  });

  bindMediaAndShareControls({
    dom,
    normalizeScreenCaptureKind,
    setCameraResolution: (value) => {
      cameraResolution = value;
    },
    setCameraFps: (value) => {
      cameraFps = value;
    },
    setScreenResolution: (value) => {
      screenResolution = value;
    },
    setScreenFps: (value) => {
      screenFps = value;
    },
    getScreenShareMode: () => screenShareMode,
    setScreenShareMode: (value) => {
      screenShareMode = value;
    },
    setScreenCaptureTab: shareModalController.setScreenCaptureTab,
    persistSharePreferences,
    onQuickCameraToggle: () => {
      void handleCameraShareToggle();
    },
    onQuickScreenToggle: () => {
      void handleScreenShareToggle();
    },
    onCameraTestToggle: () => {
      void runCameraTest();
    },
    onScreenTestToggle: () => {
      void runScreenTest();
    },
    completeScreenModalSelection:
      shareModalController.completeScreenModalSelection,
    refreshScreenCaptureSources: () => {
      void shareModalController.refreshScreenCaptureSources();
    },
    renderScreenCaptureSourceList:
      shareModalController.renderScreenCaptureSourceList,
    clearMediaDebugLogs,
    copyMediaDebugLogs: () => {
      void copyMediaDebugLogs();
    },
  });

  lifecycle.on(window, "keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === "Escape") {
      if (participantAudioMenuUserId !== null) {
        closeParticipantAudioMenu();
      }
      shareModalController.completeScreenModalSelection(false);
    }
  });

  const handleAuthenticatedSession = async (): Promise<void> => {
    directoryController.startFriendsPresenceAutoRefresh();
    await ensureBackgroundRealtimeConnection();
    await loadProfileFromBackend();
    await directoryController.refreshRegisteredUsers(true);
    await refreshLobby();
  };

  bindAuthAndProfileForms({
    dom,
    desktopApi,
    setStatus,
    getErrorMessage,
    renderSession: authController.renderSession,
    setSelfUserId: (userId) => {
      selfUserId = userId;
    },
    onSessionAuthenticated: async () => {
      workspaceController.setWorkspacePage("lobby");
      await handleAuthenticatedSession();
    },
    onProfileDisplayNameUpdated: async (displayName) => {
      if (selfUserId) {
        applyLocalDisplayName(selfUserId, displayName);
        directoryController.renderUserDirectory();
        await voiceController.onLobbyUpdated();
      }

      await directoryController.refreshRegisteredUsers(true);
    },
  });

  bindLogoutControl({
    dom,
    desktopApi,
    setStatus,
    getErrorMessage,
    onLogoutSuccess: async (session: SessionSnapshot) => {
      voiceController.cleanupForLobbyExit();
      resetRemoteMediaAnnouncementState();
      stopAllShareTests();
      voiceConnected = false;
      cameraSharing = false;
      screenSharing = false;
      updateQuickConnectionButton();
      updateCameraShareButton();
      updateScreenShareButton();
      directoryController.stopFriendsPresenceAutoRefresh();
      authController.renderSession(session);
      selfUserId = null;
      displayNameByUserId.clear();
      lobbyController.setDisplayNameMap(displayNameByUserId);
      directoryController.clearUsers();
      closeParticipantAudioMenu();
      directoryController.renderUserDirectory();
      workspaceController.setWorkspacePage("lobby");
      setConnectionState("Giriş gerekli", "warn");
    },
  });

  await initializeUpdaterAndSession({
    dom,
    desktopApi,
    updaterController,
    setStatus,
    getErrorMessage,
    renderSession: authController.renderSession,
    setSelfUserId: (userId) => {
      selfUserId = userId;
    },
    onAuthenticatedSession: handleAuthenticatedSession,
    onUnauthenticatedSession: () => {
      directoryController.stopFriendsPresenceAutoRefresh();
    },
    addCleanup: (cleanup) => {
      lifecycle.add(cleanup);
    },
  });

  const mediaDevicesForEvents = navigator.mediaDevices;
  if (
    mediaDevicesForEvents &&
    typeof mediaDevicesForEvents.addEventListener === "function"
  ) {
    const handleDeviceChange = () => {
      void voiceController.listMicrophones();
    };
    lifecycle.on(mediaDevicesForEvents, "devicechange", handleDeviceChange);
  }

  lifecycle.on(window, "beforeunload", () => {
    lifecycle.dispose();
  });

  authController.setAuthPage("login");
  diagnosticsController.initialize();
  applyShareSettingsUi();
  appendMediaDebugLog({
    timestamp: new Date().toISOString(),
    level: "info",
    scope: "system",
    event: "session-start",
    message: "Medya tanılama oturumu başlatıldı",
    details: {
      cameraResolution,
      cameraFps,
      screenResolution,
      screenFps,
      screenShareMode,
    },
  });
  renderMediaDebugLogOutput();
  shareModalController.closeScreenModal();
  dom.inputGain.value = `${inputGainPercent}`;
  voiceController.setOutputVolume(Number(dom.outputVolume.value || "100"));
  voiceController.setOutputMuted(isHeadphoneMuted);
  void voiceController.setInputGain(inputGainPercent);
  voiceController.setManualSpeakingThreshold(manualSpeakingThresholdPercent);
  voiceController.setSpeakingDetectionMode(speakingDetectionMode);
  updateOutputVolumeText(Number(dom.outputVolume.value || "100"));
  updateInputGainText(inputGainPercent);
  updateSpeakingThresholdUi();
  updateMicInputLevelUi(0);
  updateQuickHeadphoneButton();
  updateQuickConnectionButton();
  updateCameraShareButton();
  updateScreenShareButton();
  updateUiSoundsToggle();
  updateRnnoiseToggle();
  diagnosticsController.updateConnectionDiagnostics();
  void voiceController.listMicrophones();
  updateMuteButton();
};
