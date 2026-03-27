import type { RtcSignalPayload } from "../../shared/contracts";
import { createAuthViewController } from "../features/auth/auth-view-controller";
import { createUiSoundController } from "../features/audio/ui-sound-controller";
import { createLobbyController } from "../features/lobby/lobby-controller";
import { subscribeRealtimeEvents } from "../features/realtime/realtime-controller";
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
  DesktopPreferences,
  DesktopRuntimeConfig,
  DesktopUpdateState,
  RegisteredUserSnapshot,
} from "../types/desktop-api";
import type { DomRefs } from "../ui/dom";

const getErrorMessage = (error?: { message?: string }): string => {
  return error?.message ?? "bilinmeyen hata";
};

type SettingsTab = "profile" | "security" | "voice" | "session";
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
const PARTICIPANT_AUDIO_SETTINGS_STORAGE_KEY =
  "ct.desktop.participant-audio-settings";
const DEFAULT_SPEAKING_THRESHOLD_PERCENT = 24;
const FRIENDS_PRESENCE_REFRESH_MS = 2000;
const USER_DIRECTORY_REFRESH_MS = 5000;

type ScreenCaptureKind = "any" | "screen" | "window";
type ShareModalMode = "camera" | "screen";

interface CaptureSourceItem {
  id: string;
  name: string;
  kind: "screen" | "window";
  displayId: string | null;
  thumbnailDataUrl: string | null;
}

interface ParticipantAudioSetting {
  muted: boolean;
  volumePercent: number;
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

  let isMuted = false;
  let isHeadphoneMuted = false;
  let isSpeaking = false;
  let voiceConnected = false;
  let liveKitLobbyStateActive = false;
  let cameraSharing = false;
  let screenSharing = false;
  let realtimeConnectionStatus: "connected" | "disconnected" | "error" =
    "disconnected";
  let realtimeLatencyMs: number | null = null;
  let realtimePacketLossPercent = 0;
  let realtimeTransport = "unknown";
  let realtimeReconnectAttempts = 0;
  let voiceJoinLatencyMs: number | null = null;
  const latencySamplesMs: number[] = [];
  let selfUserId: string | null = null;
  let registeredUsers: RegisteredUserSnapshot[] = [];
  let friendsPresenceRefreshTimer: number | null = null;
  let usersDirectoryRefreshTimer: number | null = null;
  const uiSoundController = createUiSoundController();
  let activeWorkspacePage: "users" | "lobby" | "settings" = "lobby";
  let activeSettingsTab: SettingsTab = "profile";
  let uiSoundsEnabled = true;
  let rnnoiseEnabled = true;
  let speakingDetectionMode: SpeakingDetectionMode = "auto";
  let manualSpeakingThresholdPercent = DEFAULT_SPEAKING_THRESHOLD_PERCENT;
  let effectiveSpeakingThresholdPercent = DEFAULT_SPEAKING_THRESHOLD_PERCENT;
  let closeToTrayOnClose = false;
  let launchAtStartup = false;
  let cameraResolution = "1280x720";
  let cameraFps = "30";
  let screenResolution = "1920x1080";
  let screenFps = "30";
  let screenShareMode: ScreenCaptureKind = "any";
  let modalScreenCaptureKind: "screen" | "window" = "screen";
  let cameraTestStream: MediaStream | null = null;
  let screenTestStream: MediaStream | null = null;
  let screenCaptureSources: CaptureSourceItem[] = [];
  let selectedScreenCaptureSourceId: string | null = null;
  let participantAudioSettings = new Map<string, ParticipantAudioSetting>();
  let participantAudioMenuUserId: string | null = null;
  let latestDesktopUpdateState: DesktopUpdateState | null = null;

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
  } catch {
    uiSoundsEnabled = true;
    rnnoiseEnabled = true;
    speakingDetectionMode = "auto";
    manualSpeakingThresholdPercent = DEFAULT_SPEAKING_THRESHOLD_PERCENT;
    effectiveSpeakingThresholdPercent = DEFAULT_SPEAKING_THRESHOLD_PERCENT;
    cameraResolution = "1280x720";
    cameraFps = "30";
    screenResolution = "1920x1080";
    screenFps = "30";
    screenShareMode = "any";
    participantAudioSettings = new Map<string, ParticipantAudioSetting>();
  }

  uiSoundController.setEnabled(uiSoundsEnabled);

  const setStatus = (message: string, isError: boolean): void => {
    dom.status.textContent = message;
    dom.status.dataset.tone = isError ? "error" : "ok";
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
        void directoryController.refreshRegisteredUsers(true);
      }
    },
  });

  const lobbyController = createLobbyController(dom);
  let refreshLobbyForDirectory: ((silent?: boolean) => Promise<void>) | null =
    null;

  const directoryController = createDirectoryController({
    dom,
    desktopApi,
    lobbyController,
    getSelfUserId: () => selfUserId,
    setStatus,
    getErrorMessage,
    refreshLobby: async (silent = true) => {
      if (refreshLobbyForDirectory) {
        await refreshLobbyForDirectory(silent);
      }
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

  const setSettingsTab = (tab: SettingsTab): void => {
    activeSettingsTab = tab;

    dom.settingsTabProfile.classList.toggle("active", tab === "profile");
    dom.settingsTabSecurity.classList.toggle("active", tab === "security");
    dom.settingsTabVoice.classList.toggle("active", tab === "voice");
    dom.settingsTabSession.classList.toggle("active", tab === "session");

    dom.settingsPanelProfile.classList.toggle("hidden", tab !== "profile");
    dom.settingsPanelSecurity.classList.toggle("hidden", tab !== "security");
    dom.settingsPanelVoice.classList.toggle("hidden", tab !== "voice");
    dom.settingsPanelSession.classList.toggle("hidden", tab !== "session");
  };

  const setWorkspacePage = (page: "users" | "lobby" | "settings"): void => {
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

    if (showUsers) {
      directoryController.renderUserDirectory();
    }

    if (showSettings) {
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
    dom.outputVolumeValue.textContent = `${value}%`;
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
    dom.uiSoundsToggle.classList.toggle("enabled", uiSoundsEnabled);
    dom.uiSoundsToggle.textContent = uiSoundsEnabled ? "Açık" : "Kapalı";
  };

  const updateRnnoiseToggle = (): void => {
    dom.rnnoiseToggle.classList.toggle("enabled", rnnoiseEnabled);
    dom.rnnoiseToggle.textContent = rnnoiseEnabled ? "Açık" : "Kapalı";
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
    const displayName = lobbyController.resolveMemberName(userId);
    dom.participantAudioMenuTitle.textContent = `${displayName} ses ayarı`;
    dom.participantAudioMuteToggle.classList.toggle("active", setting.muted);
    dom.participantAudioMuteToggle.textContent = setting.muted
      ? "Susturmayı kaldır"
      : "Bu kullanıcıyı sustur";
    dom.participantAudioVolumeSlider.value = `${clampParticipantVolumePercent(setting.volumePercent)}`;
    dom.participantAudioVolumeValue.textContent = `${clampParticipantVolumePercent(setting.volumePercent)}%`;
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

  const applyWindowState = (isMaximized: boolean): void => {
    dom.windowMaximize.classList.toggle("is-maximized", isMaximized);
    dom.windowMaximize.title = isMaximized ? "Küçült" : "Büyüt";
    dom.windowMaximize.setAttribute(
      "aria-label",
      isMaximized ? "Küçült" : "Büyüt",
    );
  };

  const unsubscribeWindowState = desktopApi.onWindowStateChanged((payload) => {
    applyWindowState(payload.isMaximized);
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
      directoryController.clearUsers();
      directoryController.renderUserDirectory();
      lobbyController.clearLobby();
      liveKitLobbyStateActive = false;
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
    onLiveKitLobbySnapshot: (members) => {
      liveKitLobbyStateActive = true;
      const currentMemberMap = lobbyController.getMembersMap();
      const mergedMembers = members.map((member) => {
        const current = currentMemberMap.get(member.userId);
        if (!current) {
          return member;
        }

        const muted = current.muted;
        const deafened = current.deafened;
        return {
          ...member,
          muted,
          deafened,
          speaking: muted ? false : member.speaking,
        };
      });

      lobbyController.renderLobby({
        members: mergedMembers,
        size: mergedMembers.length,
      });
      directoryController.renderUserDirectory();
      void voiceController.onLobbyUpdated();
    },
    onConnectionMetrics: ({ latencyMs, packetLossPercent, connected }) => {
      realtimeLatencyMs = connected ? latencyMs : null;
      realtimePacketLossPercent = connected
        ? Math.max(0, Math.min(100, packetLossPercent))
        : 0;
      realtimeTransport = connected ? "livekit" : realtimeTransport;
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
  });

  for (const [userId, setting] of participantAudioSettings.entries()) {
    voiceController.setRemoteParticipantAudioState(userId, {
      muted: setting.muted,
      volumePercent: clampParticipantVolumePercent(setting.volumePercent),
    });
  }

  let shareModalMode: ShareModalMode = "screen";
  let screenModalResolver: ((confirmed: boolean) => void) | null = null;
  let shareModalPreviewStream: MediaStream | null = null;

  const stopShareModalPreview = (): void => {
    if (shareModalPreviewStream) {
      for (const track of shareModalPreviewStream.getTracks()) {
        try {
          track.stop();
        } catch {
          // no-op
        }
      }
    }

    shareModalPreviewStream = null;
    dom.sharePreviewVideo.srcObject = null;
    dom.sharePreviewVideo.classList.add("hidden");
  };

  const setScreenModalOpen = (open: boolean): void => {
    dom.screenShareModal.classList.toggle("hidden", !open);
    dom.screenShareModal.setAttribute("aria-hidden", open ? "false" : "true");

    if (!open) {
      stopShareModalPreview();
      dom.sharePreviewImage.classList.add("hidden");
      dom.sharePreviewImage.removeAttribute("src");
      dom.sharePreviewHint.textContent = "Önizleme hazırlanıyor...";
    }
  };

  const setShareModalMode = (mode: ShareModalMode): void => {
    shareModalMode = mode;
    const screenMode = mode === "screen";

    dom.screenCaptureFilters.classList.toggle("hidden", !screenMode);
    dom.screenCaptureSourceList.classList.toggle("hidden", !screenMode);
    dom.screenCaptureTabMonitors.disabled = !screenMode;
    dom.screenCaptureTabWindows.disabled = !screenMode;
    dom.modalScreenResolutionSelect.disabled = !screenMode;
    dom.modalScreenFpsSelect.disabled = !screenMode;
    dom.screenMonitorSelect.disabled = !screenMode;
    dom.screenCaptureRefreshButton.disabled = !screenMode;

    if (screenMode) {
      dom.shareModalTitle.textContent = "Ekran Paylaşımı Seçimi";
      return;
    }

    dom.shareModalTitle.textContent = "Kamera Önizleme";
    dom.sharePreviewHint.textContent =
      "Kamera önizlemesi hazır olduğunda onaylayarak paylaşımı başlatabilirsin.";
  };

  const setScreenCaptureTab = (kind: "screen" | "window"): void => {
    modalScreenCaptureKind = kind;
    dom.screenCaptureTabMonitors.classList.toggle("active", kind === "screen");
    dom.screenCaptureTabMonitors.setAttribute(
      "aria-selected",
      kind === "screen" ? "true" : "false",
    );
    dom.screenCaptureTabWindows.classList.toggle("active", kind === "window");
    dom.screenCaptureTabWindows.setAttribute(
      "aria-selected",
      kind === "window" ? "true" : "false",
    );

    dom.screenMonitorSelect.disabled =
      shareModalMode !== "screen" || kind !== "screen";
  };

  const updateSelectedScreenPreviewImage = (): void => {
    const selected = screenCaptureSources.find(
      (source) => source.id === selectedScreenCaptureSourceId,
    );

    if (!selected) {
      dom.sharePreviewImage.classList.add("hidden");
      dom.sharePreviewImage.removeAttribute("src");
      dom.sharePreviewHint.textContent =
        "Önizleme için bir ekran veya pencere seçin.";
      return;
    }

    dom.sharePreviewVideo.classList.add("hidden");
    dom.sharePreviewImage.classList.remove("hidden");
    dom.sharePreviewImage.src =
      selected.thumbnailDataUrl ??
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='960' height='540'%3E%3Crect width='100%25' height='100%25' fill='%23111425'/%3E%3C/svg%3E";
    dom.sharePreviewHint.textContent = `${selected.name} önizleniyor.`;
  };

  const startCameraShareModalPreview = async (): Promise<boolean> => {
    stopShareModalPreview();
    dom.sharePreviewImage.classList.add("hidden");

    try {
      shareModalPreviewStream = await voiceController.createCameraTestStream(
        getCameraShareOptions(),
      );
      dom.sharePreviewVideo.classList.remove("hidden");
      dom.sharePreviewVideo.srcObject = shareModalPreviewStream;
      await dom.sharePreviewVideo.play().catch(() => {
        // no-op
      });
      dom.sharePreviewHint.textContent =
        "Kamera önizlemesi aktif. Onaylarsan paylaşım başlatılacak.";
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "bilinmeyen hata";
      setStatus(`Kamera önizlemesi açılamadı: ${message}`, true);
      return false;
    }
  };

  const renderScreenCaptureSourceList = (): void => {
    const currentKind = modalScreenCaptureKind;
    const selectedMonitor = dom.screenMonitorSelect.value;

    const filtered = screenCaptureSources.filter((source) => {
      if (source.kind !== currentKind) {
        return false;
      }

      if (
        selectedMonitor !== "all" &&
        source.kind === "screen" &&
        source.displayId !== selectedMonitor
      ) {
        return false;
      }

      return true;
    });

    dom.screenCaptureSourceList.innerHTML = "";

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className =
        "rounded-xl border border-border bg-surface-2/40 p-3 text-xs text-text-muted";
      empty.textContent = "Bu filtrede paylaşılabilir kaynak bulunamadı.";
      dom.screenCaptureSourceList.appendChild(empty);
      selectedScreenCaptureSourceId = null;
      updateSelectedScreenPreviewImage();
      return;
    }

    if (
      !selectedScreenCaptureSourceId ||
      !filtered.some((item) => item.id === selectedScreenCaptureSourceId)
    ) {
      selectedScreenCaptureSourceId = filtered[0]?.id ?? null;
    }

    for (const source of filtered) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "capture-source-card";
      card.classList.toggle(
        "selected",
        source.id === selectedScreenCaptureSourceId,
      );

      const thumb = document.createElement("img");
      thumb.className = "capture-source-thumb";
      thumb.alt = source.name;
      thumb.src =
        source.thumbnailDataUrl ??
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='100%25' height='100%25' fill='%23111425'/%3E%3C/svg%3E";

      const title = document.createElement("div");
      title.className = "text-sm text-text-primary font-medium truncate";
      title.textContent = source.name;

      const meta = document.createElement("div");
      meta.className = "capture-source-meta";
      const kind = document.createElement("span");
      kind.textContent = source.kind === "screen" ? "Tüm ekran" : "Pencere";
      const display = document.createElement("span");
      display.textContent = source.displayId
        ? `Monitör ${source.displayId}`
        : "Monitör -";
      meta.appendChild(kind);
      meta.appendChild(display);

      card.appendChild(thumb);
      card.appendChild(title);
      card.appendChild(meta);
      card.addEventListener("click", () => {
        selectedScreenCaptureSourceId = source.id;
        renderScreenCaptureSourceList();
      });

      dom.screenCaptureSourceList.appendChild(card);
    }

    updateSelectedScreenPreviewImage();
  };

  const refreshScreenCaptureSources = async (): Promise<boolean> => {
    const kinds = [modalScreenCaptureKind] as Array<"screen" | "window">;
    const result = await window.desktopApi.mediaListCaptureSources({ kinds });
    if (!result.ok || !result.data) {
      setStatus(
        `Ekran kaynakları alınamadı: ${getErrorMessage(result.error)}`,
        true,
      );
      return false;
    }

    screenCaptureSources = result.data.sources;

    const monitors = Array.from(
      new Set(
        screenCaptureSources
          .filter((source) => source.kind === "screen")
          .map((source) => source.displayId)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    dom.screenMonitorSelect.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "Tümü";
    dom.screenMonitorSelect.appendChild(allOption);

    for (const monitorId of monitors) {
      const option = document.createElement("option");
      option.value = monitorId;
      option.textContent = `Monitör ${monitorId}`;
      dom.screenMonitorSelect.appendChild(option);
    }

    if (modalScreenCaptureKind === "window") {
      dom.screenMonitorSelect.value = "all";
    }

    dom.screenMonitorSelect.disabled = modalScreenCaptureKind !== "screen";

    renderScreenCaptureSourceList();
    return true;
  };

  const requestScreenCaptureSourceSelection = async (
    confirmLabel = "Onayla ve Paylaş",
  ): Promise<CaptureSourceItem | null> => {
    setShareModalMode("screen");
    dom.screenShareModalConfirm.textContent = confirmLabel;
    const initialKind = screenShareMode === "window" ? "window" : "screen";
    setScreenCaptureTab(initialKind);
    dom.modalScreenResolutionSelect.value = screenResolution;
    dom.modalScreenFpsSelect.value = screenFps;
    const refreshed = await refreshScreenCaptureSources();
    if (!refreshed) {
      return null;
    }

    setScreenModalOpen(true);
    const confirmed = await new Promise<boolean>((resolve) => {
      screenModalResolver = resolve;
    });

    if (!confirmed) {
      return null;
    }

    const selected = screenCaptureSources.find(
      (source) => source.id === selectedScreenCaptureSourceId,
    );

    return selected ?? null;
  };

  const requestCameraShareConfirmation = async (): Promise<boolean> => {
    setShareModalMode("camera");
    dom.screenShareModalConfirm.textContent = "Onayla ve Paylaş";
    setScreenModalOpen(true);

    const confirmationPromise = new Promise<boolean>((resolve) => {
      screenModalResolver = resolve;
    });

    const previewReady = await startCameraShareModalPreview();
    if (!previewReady) {
      completeScreenModalSelection(false);
      return confirmationPromise;
    }

    if (dom.screenShareModal.classList.contains("hidden")) {
      completeScreenModalSelection(false);
    }

    return confirmationPromise;
  };

  const completeScreenModalSelection = (confirmed: boolean): void => {
    if (!screenModalResolver) {
      setScreenModalOpen(false);
      return;
    }

    if (
      confirmed &&
      shareModalMode === "screen" &&
      !selectedScreenCaptureSourceId
    ) {
      setStatus("Paylaşım için bir kaynak seçin", true);
      return;
    }

    const resolver = screenModalResolver;
    screenModalResolver = null;
    setScreenModalOpen(false);
    resolver(confirmed);
  };

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
    setScreenCaptureTab(screenShareMode === "window" ? "window" : "screen");
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

    const confirmed = await requestCameraShareConfirmation();
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

    const selectedSource = await requestScreenCaptureSourceSelection();
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
      await requestScreenCaptureSourceSelection("Onayla ve Test Et");
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
    const result = await window.desktopApi.getLobbyState();
    if (!result.ok || !result.data) {
      if (!silent) {
        setStatus(
          `Lobi bilgisi alınamadı: ${getErrorMessage(result.error)}`,
          true,
        );
      }
      if (result.error?.statusCode === 401) {
        authController.renderSession({ authenticated: false, user: null });
      }
      return;
    }

    lobbyController.renderLobby(result.data);
    directoryController.renderUserDirectory();
    await voiceController.onLobbyUpdated();
    if (!silent) {
      setStatus("Lobi yenilendi", false);
    }
  };
  refreshLobbyForDirectory = refreshLobby;

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
    liveKitLobbyStateActive = false;

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

  const unsubscribeRealtime = subscribeRealtimeEvents({
    onConnection: (status, detail) => {
      if (status === "connected") {
        realtimeConnectionStatus = "connected";
        setConnectionState("Realtime bağlı", "ok");
        diagnosticsController.updateConnectionDiagnostics();
        return;
      }

      if (status === "disconnected") {
        realtimeConnectionStatus = "disconnected";
        liveKitLobbyStateActive = false;
        realtimeLatencyMs = null;
        realtimePacketLossPercent = 0;
        latencySamplesMs.length = 0;
        setConnectionState("Realtime bağlantısı koptu", "warn");
        if (detail) {
          setStatus(`Realtime bağlantısı kesildi: ${detail}`, true);
        }
        voiceController.cleanupForLobbyExit();
        stopAllShareTests();
        voiceConnected = false;
        cameraSharing = false;
        screenSharing = false;
        updateQuickConnectionButton();
        updateCameraShareButton();
        updateScreenShareButton();
        diagnosticsController.updateConnectionDiagnostics();
        return;
      }

      realtimeConnectionStatus = "error";
      liveKitLobbyStateActive = false;
      realtimeLatencyMs = null;
      realtimePacketLossPercent = 0;
      latencySamplesMs.length = 0;
      setConnectionState("Realtime hatası", "error");
      setStatus(`Realtime hatası: ${detail || "bilinmeyen hata"}`, true);
      diagnosticsController.updateConnectionDiagnostics();
    },
    onConnectionMetrics: (payload) => {
      realtimeLatencyMs = payload.connected ? payload.latencyMs : null;
      realtimePacketLossPercent = payload.connected
        ? payload.packetLossPercent
        : 0;
      realtimeTransport = payload.transport;
      realtimeReconnectAttempts = payload.reconnectAttempts;

      if (payload.connected && typeof payload.latencyMs === "number") {
        latencySamplesMs.push(Math.max(0, Math.round(payload.latencyMs)));
        if (latencySamplesMs.length > 30) {
          latencySamplesMs.shift();
        }
      }

      if (payload.connected) {
        realtimeConnectionStatus = "connected";
      }

      diagnosticsController.updateConnectionDiagnostics();
    },
    onLobbyState: (members) => {
      liveKitLobbyStateActive = false;
      lobbyController.renderLobby({ members, size: members.length });
      directoryController.renderUserDirectory();
      void voiceController.onLobbyUpdated();
    },
    onMemberJoined: (member) => {
      setStatus("Lobiye bir üye katıldı", false);
      lobbyController.addOrUpdateMember(member);
      directoryController.renderUserDirectory();
      void voiceController.onLobbyUpdated();
    },
    onMemberLeft: (userId) => {
      setStatus("Bir üye lobiden ayrıldı", false);
      lobbyController.removeMember(userId);
      directoryController.renderUserDirectory();
      voiceController.onMemberLeft(userId);
    },
    onAutoRejoin: () => {
      setStatus("Bağlantı geri geldi, lobi üyeliği yenilendi", false);
    },
    onRtcSignal: (payload) => {
      void voiceController.handleIncomingSignal(payload as RtcSignalPayload);
    },
    onProducerAvailable: (payload) => {
      void voiceController.handleProducerAvailable(payload);
    },
    onProducerClosed: (producerId) => {
      voiceController.handleProducerClosed(producerId);
    },
    onSystemError: (message) => {
      setStatus(`Sistem hatası: ${message}`, true);
    },
  });

  authController.bindNavigationEvents();

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
      workspaceController.updateDesktopPreferenceToggles();
      setStatus(
        closeToTrayOnClose
          ? "Kapat tusu tepsiye gonderme moduna alindi"
          : "Kapat tusu uygulamayi tamamen kapatacak",
        false,
      );
    } catch {
      closeToTrayOnClose = !closeToTrayOnClose;
      workspaceController.updateDesktopPreferenceToggles();
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
      workspaceController.updateDesktopPreferenceToggles();
      setStatus(
        launchAtStartup
          ? "Windows baslangicinda otomatik calisma acildi"
          : "Windows baslangicinda otomatik calisma kapatildi",
        false,
      );
    } catch {
      launchAtStartup = !launchAtStartup;
      workspaceController.updateDesktopPreferenceToggles();
      setStatus("Baslangic ayari guncellenemedi", true);
    }
  });

  dom.navUsers.addEventListener("click", () => {
    workspaceController.setWorkspacePage("users");
    void refreshLobby(true);
    void directoryController.refreshRegisteredUsers(true);
  });

  dom.navLobby.addEventListener("click", () => {
    workspaceController.setWorkspacePage("lobby");
  });

  dom.navSettings.addEventListener("click", () => {
    workspaceController.setWorkspacePage("settings");
  });

  dom.settingsTabProfile.addEventListener("click", () => {
    workspaceController.setSettingsTab("profile");
  });

  dom.settingsTabSecurity.addEventListener("click", () => {
    workspaceController.setSettingsTab("security");
  });

  dom.settingsTabVoice.addEventListener("click", () => {
    workspaceController.setSettingsTab("voice");
  });

  dom.settingsTabSession.addEventListener("click", () => {
    workspaceController.setSettingsTab("session");
  });

  document.addEventListener("click", (event) => {
    if (participantAudioMenuUserId === null) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      closeParticipantAudioMenu();
      return;
    }

    if (dom.participantAudioMenu.contains(target)) {
      return;
    }

    closeParticipantAudioMenu();
  });

  document.addEventListener("contextmenu", (event) => {
    if (participantAudioMenuUserId === null) {
      return;
    }

    const target = event.target;
    if (target instanceof Node && dom.participantAudioMenu.contains(target)) {
      return;
    }

    if (resolveContextMenuUserId(target)) {
      return;
    }

    closeParticipantAudioMenu();
  });

  dom.quickMicToggle.addEventListener("click", async () => {
    await setMicMuted(!isMuted);
  });

  dom.quickHeadphoneToggle.addEventListener("click", async () => {
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
  });

  dom.uiSoundsToggle.addEventListener("click", () => {
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
  });

  const handleParticipantContextMenu = (event: MouseEvent): void => {
    const userId = resolveContextMenuUserId(event.target);
    if (!userId) {
      return;
    }

    event.preventDefault();
    openParticipantAudioMenu(userId, event.clientX, event.clientY);
  };

  dom.members.addEventListener("contextmenu", handleParticipantContextMenu);
  dom.participantGrid.addEventListener(
    "contextmenu",
    handleParticipantContextMenu,
  );
  dom.usersDirectoryList.addEventListener(
    "contextmenu",
    handleParticipantContextMenu,
  );

  dom.participantAudioMuteToggle.addEventListener("click", () => {
    const userId = participantAudioMenuUserId;
    if (!userId) {
      return;
    }

    toggleParticipantMute(userId);
  });

  dom.participantAudioVolumeSlider.addEventListener("input", () => {
    const userId = participantAudioMenuUserId;
    if (!userId) {
      return;
    }

    handleParticipantAudioVolumeUpdate(
      userId,
      Number(dom.participantAudioVolumeSlider.value || "100"),
    );
  });

  dom.participantAudioPreset100.addEventListener("click", () => {
    const userId = participantAudioMenuUserId;
    if (!userId) {
      return;
    }

    handleParticipantAudioVolumeUpdate(userId, 100);
  });

  dom.participantAudioPreset150.addEventListener("click", () => {
    const userId = participantAudioMenuUserId;
    if (!userId) {
      return;
    }

    handleParticipantAudioVolumeUpdate(userId, 150);
  });

  dom.participantAudioPreset200.addEventListener("click", () => {
    const userId = participantAudioMenuUserId;
    if (!userId) {
      return;
    }

    handleParticipantAudioVolumeUpdate(userId, 200);
  });

  dom.rnnoiseToggle.addEventListener("click", async () => {
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
  });

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

  dom.quickCameraToggle.addEventListener("click", () => {
    void handleCameraShareToggle();
  });

  dom.quickScreenToggle.addEventListener("click", () => {
    void handleScreenShareToggle();
  });

  dom.cameraResolutionSelect.addEventListener("change", () => {
    cameraResolution = dom.cameraResolutionSelect.value;
    persistSharePreferences();
  });

  dom.cameraFpsSelect.addEventListener("change", () => {
    cameraFps = dom.cameraFpsSelect.value;
    persistSharePreferences();
  });

  dom.screenResolutionSelect.addEventListener("change", () => {
    screenResolution = dom.screenResolutionSelect.value;
    dom.modalScreenResolutionSelect.value = screenResolution;
    persistSharePreferences();
  });

  dom.screenFpsSelect.addEventListener("change", () => {
    screenFps = dom.screenFpsSelect.value;
    dom.modalScreenFpsSelect.value = screenFps;
    persistSharePreferences();
  });

  dom.screenShareModeSelect.addEventListener("change", () => {
    screenShareMode = normalizeScreenCaptureKind(
      dom.screenShareModeSelect.value,
    );
    if (screenShareMode === "screen" || screenShareMode === "window") {
      setScreenCaptureTab(screenShareMode);
    }
    persistSharePreferences();
  });

  dom.modalScreenResolutionSelect.addEventListener("change", () => {
    screenResolution = dom.modalScreenResolutionSelect.value;
    dom.screenResolutionSelect.value = screenResolution;
    persistSharePreferences();
  });

  dom.modalScreenFpsSelect.addEventListener("change", () => {
    screenFps = dom.modalScreenFpsSelect.value;
    dom.screenFpsSelect.value = screenFps;
    persistSharePreferences();
  });

  dom.cameraTestToggle.addEventListener("click", () => {
    void runCameraTest();
  });

  dom.screenTestToggle.addEventListener("click", () => {
    void runScreenTest();
  });

  dom.screenShareModalClose.addEventListener("click", () => {
    completeScreenModalSelection(false);
  });

  dom.screenShareModalCancel.addEventListener("click", () => {
    completeScreenModalSelection(false);
  });

  dom.screenShareModalConfirm.addEventListener("click", () => {
    completeScreenModalSelection(true);
  });

  dom.screenCaptureRefreshButton.addEventListener("click", () => {
    void refreshScreenCaptureSources();
  });

  dom.screenCaptureTabMonitors.addEventListener("click", () => {
    setScreenCaptureTab("screen");
    screenShareMode = "screen";
    dom.screenShareModeSelect.value = screenShareMode;
    persistSharePreferences();
    void refreshScreenCaptureSources();
  });

  dom.screenCaptureTabWindows.addEventListener("click", () => {
    setScreenCaptureTab("window");
    screenShareMode = "window";
    dom.screenShareModeSelect.value = screenShareMode;
    persistSharePreferences();
    void refreshScreenCaptureSources();
  });

  dom.screenMonitorSelect.addEventListener("change", () => {
    renderScreenCaptureSourceList();
  });

  dom.screenShareModal.addEventListener("click", (event) => {
    if (event.target === dom.screenShareModal) {
      completeScreenModalSelection(false);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (participantAudioMenuUserId !== null) {
        closeParticipantAudioMenu();
      }
      completeScreenModalSelection(false);
    }
  });

  dom.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      username: dom.loginUsername.value,
      password: dom.loginPassword.value,
    };

    const result = await window.desktopApi.login(payload);
    if (!result.ok || !result.data) {
      setStatus(`Giriş başarısız: ${getErrorMessage(result.error)}`, true);
      return;
    }

    authController.renderSession(result.data);
    selfUserId = result.data.user?.id ?? null;
    directoryController.startFriendsPresenceAutoRefresh();
    await ensureBackgroundRealtimeConnection();
    await loadProfileFromBackend();
    workspaceController.setWorkspacePage("lobby");
    setStatus(
      "Giriş başarılı. Sohbete bağlanmak için bağlan butonunu kullan.",
      false,
    );
    await directoryController.refreshRegisteredUsers(true);
    await refreshLobby();
  });

  dom.registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      username: dom.registerUsername.value,
      password: dom.registerPassword.value,
    };

    const result = await window.desktopApi.register(payload);
    if (!result.ok || !result.data) {
      if (result.error?.code === "INVALID_INVITE_CODE") {
        setStatus(
          "Kayıt için davet kodu gerekmiyor. Backend sürecini yeniden başlatıp tekrar deneyin.",
          true,
        );
        return;
      }

      setStatus(`Kayıt başarısız: ${getErrorMessage(result.error)}`, true);
      return;
    }

    authController.renderSession(result.data);
    selfUserId = result.data.user?.id ?? null;
    directoryController.startFriendsPresenceAutoRefresh();
    await ensureBackgroundRealtimeConnection();
    await loadProfileFromBackend();
    workspaceController.setWorkspacePage("lobby");
    setStatus(
      "Kayıt ve giriş başarılı. Sohbete bağlanmak için bağlan butonunu kullan.",
      false,
    );
    await directoryController.refreshRegisteredUsers(true);
    await refreshLobby();
  });

  dom.profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const displayName = dom.profileDisplayName.value.trim();
    const email = dom.profileEmail.value.trim();
    const bio = dom.profileBio.value.trim();

    if (displayName.length < 3) {
      setStatus("Görünen ad en az 3 karakter olmalı", true);
      return;
    }

    const result = await window.desktopApi.updateProfile({
      displayName,
      email: email.length > 0 ? email : null,
      bio: bio.length > 0 ? bio : null,
    });

    if (!result.ok || !result.data) {
      setStatus(
        `Profil güncellenemedi: ${getErrorMessage(result.error)}`,
        true,
      );
      return;
    }

    dom.currentUser.textContent = result.data.profile.displayName;
    setStatus("Profil bilgileri güncellendi", false);
  });

  dom.passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const currentPassword = dom.currentPassword.value;
    const newPassword = dom.newPassword.value;
    const confirmPassword = dom.confirmPassword.value;

    if (newPassword !== confirmPassword) {
      setStatus("Yeni şifre alanları birbiriyle uyuşmuyor", true);
      return;
    }

    const result = await window.desktopApi.changePassword({
      currentPassword,
      newPassword,
    });

    if (!result.ok || !result.data) {
      setStatus(
        `Şifre değişikliği başarısız: ${getErrorMessage(result.error)}`,
        true,
      );
      return;
    }

    dom.passwordForm.reset();
    setStatus("Şifre başarıyla güncellendi", false);
  });

  dom.microphoneSelect.addEventListener("change", async () => {
    try {
      await voiceController.handleMicrophoneChange(dom.microphoneSelect.value);
    } catch {
      setStatus("Mikrofon değiştirilemedi", true);
    }
  });

  dom.micTestToggle.addEventListener("click", async () => {
    try {
      const isTesting = await voiceController.toggleMicTest();
      dom.micTestToggle.textContent = isTesting
        ? "Ses Testini Durdur"
        : "Ses Testini Başlat";
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "bilinmeyen hata";
      setStatus(`Ses testi başlatılamadı: ${message}`, true);
    }
  });

  dom.outputVolume.addEventListener("input", () => {
    const value = Number(dom.outputVolume.value || "100");
    voiceController.setOutputVolume(value);
    updateOutputVolumeText(value);
  });

  dom.speakingThresholdMode.addEventListener("change", () => {
    speakingDetectionMode = normalizeDetectionMode(
      dom.speakingThresholdMode.value,
    );
    voiceController.setSpeakingDetectionMode(speakingDetectionMode);
    updateSpeakingThresholdUi();
    persistSpeakingDetectionPreference();
    setStatus(
      speakingDetectionMode === "auto"
        ? "Ses algılama otomatik moda alındı"
        : "Ses algılama manuel moda alındı",
      false,
    );
  });

  dom.speakingThreshold.addEventListener("input", () => {
    manualSpeakingThresholdPercent = clampThresholdPercent(
      Number(
        dom.speakingThreshold.value || `${DEFAULT_SPEAKING_THRESHOLD_PERCENT}`,
      ),
    );
    voiceController.setManualSpeakingThreshold(manualSpeakingThresholdPercent);
    updateSpeakingThresholdUi();
    persistSpeakingDetectionPreference();
  });

  dom.speakingThreshold.addEventListener("change", () => {
    setStatus(
      `Manuel konuşma eşiği %${manualSpeakingThresholdPercent} olarak ayarlandı`,
      false,
    );
  });

  dom.logoutButton.addEventListener("click", async () => {
    await window.desktopApi.lobbyLeave();
    const result = await window.desktopApi.logout();
    if (!result.ok || !result.data) {
      setStatus(`Çıkış başarısız: ${getErrorMessage(result.error)}`, true);
      return;
    }

    voiceController.cleanupForLobbyExit();
    stopAllShareTests();
    voiceConnected = false;
    cameraSharing = false;
    screenSharing = false;
    updateQuickConnectionButton();
    updateCameraShareButton();
    updateScreenShareButton();
    directoryController.stopFriendsPresenceAutoRefresh();
    authController.renderSession(result.data);
    selfUserId = null;
    directoryController.clearUsers();
    closeParticipantAudioMenu();
    directoryController.renderUserDirectory();
    workspaceController.setWorkspacePage("lobby");
    setStatus("Çıkış yapıldı", false);
    setConnectionState("Giriş gerekli", "warn");
  });

  const appVersion = await desktopApi.getAppVersion();
  dom.version.textContent = appVersion;
  await updaterController.initialize();

  const unsubscribeUpdateEvents = desktopApi.onUpdateEvent((state) => {
    updaterController.renderDesktopUpdateState(state);

    if (state.status === "available") {
      const versionSuffix = state.availableVersion
        ? ` (v${state.availableVersion})`
        : "";
      setStatus(`Yeni sürüm bulundu${versionSuffix}.`, false);
      return;
    }

    if (state.status === "downloaded") {
      setStatus(
        "Yeni sürüm indirildi, uygulama otomatik yeniden başlatılıyor...",
        false,
      );
    }
  });

  const sessionResult = await desktopApi.getSession();
  if (!sessionResult.ok || !sessionResult.data) {
    authController.renderSession({ authenticated: false, user: null });
    setStatus(
      `Oturum bilgisi alınamadı: ${getErrorMessage(sessionResult.error)}`,
      true,
    );
  } else {
    authController.renderSession(sessionResult.data);
    selfUserId = sessionResult.data.user?.id ?? null;
    if (sessionResult.data.authenticated) {
      directoryController.startFriendsPresenceAutoRefresh();
      await ensureBackgroundRealtimeConnection();
      await loadProfileFromBackend();
      await directoryController.refreshRegisteredUsers(true);
      setStatus(
        "Oturum hazır. Sohbete bağlanmak için bağlan butonunu kullan.",
        false,
      );
      await refreshLobby();
    } else {
      directoryController.stopFriendsPresenceAutoRefresh();
    }
  }

  const mediaDevicesForEvents = navigator.mediaDevices;
  if (
    mediaDevicesForEvents &&
    typeof mediaDevicesForEvents.addEventListener === "function"
  ) {
    mediaDevicesForEvents.addEventListener("devicechange", () => {
      void voiceController.listMicrophones();
    });
  }

  window.addEventListener("beforeunload", () => {
    directoryController.stopFriendsPresenceAutoRefresh();
    stopAllShareTests();
    unsubscribeWindowState();
    unsubscribeUpdateEvents();
    voiceController.destroy();
    unsubscribeRealtime();
  });

  authController.setAuthPage("login");

  workspaceController.setSettingsTab(activeSettingsTab);
  diagnosticsController.initialize();
  applyShareSettingsUi();
  setScreenModalOpen(false);
  voiceController.setOutputVolume(Number(dom.outputVolume.value || "100"));
  voiceController.setOutputMuted(isHeadphoneMuted);
  voiceController.setManualSpeakingThreshold(manualSpeakingThresholdPercent);
  voiceController.setSpeakingDetectionMode(speakingDetectionMode);
  updateOutputVolumeText(Number(dom.outputVolume.value || "100"));
  updateSpeakingThresholdUi();
  updateMicInputLevelUi(0);
  updateQuickHeadphoneButton();
  updateQuickConnectionButton();
  updateCameraShareButton();
  updateScreenShareButton();
  updateUiSoundsToggle();
  updateRnnoiseToggle();
  workspaceController.updateDesktopPreferenceToggles();
  diagnosticsController.updateConnectionDiagnostics();
  void voiceController.listMicrophones();
  updateMuteButton();
};
