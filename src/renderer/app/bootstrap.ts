import type {
  DirectChatMessage,
  LobbyChatMessage,
  LobbyDescriptor,
  RtcSignalPayload,
} from "../../shared/contracts";
import { createAuthViewController } from "../features/auth/auth-view-controller";
import { createUiSoundController } from "../features/audio/ui-sound-controller";
import { createLobbyController } from "../features/lobby/lobby-controller";
import { createLobbyChatController } from "../features/lobby/lobby-chat-controller";
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
const LOBBY_CHAT_COLLAPSED_STORAGE_KEY = "ct.desktop.lobby-chat-collapsed";
const PARTICIPANT_AUDIO_SETTINGS_STORAGE_KEY =
  "ct.desktop.participant-audio-settings";
const MAX_MEDIA_DEBUG_LOG_ENTRIES = 280;
const MAX_TOAST_COUNT = 4;
const TOAST_AUTO_HIDE_MS = 4200;
const DEFAULT_SPEAKING_THRESHOLD_PERCENT = 24;
const LOBBY_MEMBERS_REFRESH_INTERVAL_MS = 2500;

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

interface MediaQualityDefaults {
  cameraResolution: string;
  cameraFps: string;
  screenResolution: string;
  screenFps: string;
}

const resolveMediaQualityDefaults = (
  profile: DesktopRuntimeConfig["mediaQualityProfile"] | undefined,
): MediaQualityDefaults => {
  switch (profile) {
    case "high":
      return {
        cameraResolution: "1920x1080",
        cameraFps: "30",
        screenResolution: "2560x1440",
        screenFps: "30",
      };
    case "low-bandwidth":
      return {
        cameraResolution: "960x540",
        cameraFps: "24",
        screenResolution: "1280x720",
        screenFps: "20",
      };
    default:
      return {
        cameraResolution: "1280x720",
        cameraFps: "30",
        screenResolution: "1920x1080",
        screenFps: "30",
      };
  }
};

const getDesktopApiOrThrow = (): DesktopApi => {
  const api = window.desktopApi;
  if (!api || typeof api.getRuntimeConfig !== "function") {
    throw new Error(
      "Desktop API bulunamadı. Uygulamayı Electron ile başlatın (npm run dev).",
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
  const mediaQualityDefaults = resolveMediaQualityDefaults(
    runtimeConfig.mediaQualityProfile,
  );
  const lifecycle = createLifecycleScope();

  let isMuted = false;
  let isHeadphoneMuted = false;
  let isSpeaking = false;
  let voiceConnected = false;
  let voiceConnectionInProgress = false;
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
  let cameraResolution = mediaQualityDefaults.cameraResolution;
  let cameraFps = mediaQualityDefaults.cameraFps;
  let inputGainPercent = 100;
  let screenResolution = mediaQualityDefaults.screenResolution;
  let screenFps = mediaQualityDefaults.screenFps;
  let screenShareMode: ScreenCaptureKind = "any";
  let cameraTestStream: MediaStream | null = null;
  let screenTestStream: MediaStream | null = null;
  let mediaDebugLogEntries: MediaDebugLogEntry[] = [];
  let participantAudioSettings = new Map<string, ParticipantAudioSetting>();
  let participantAudioMenuUserId: string | null = null;
  let latestDesktopUpdateState: DesktopUpdateState | null = null;
  const displayNameByUserId = new Map<string, string>();
  const knownUsersById = new Map<string, RegisteredUserSnapshot>();
  let activeLobbyId = runtimeConfig.liveKitDefaultRoom;
  let activeLobbyName = "Ana Lobi";
  let availableLobbies: LobbyDescriptor[] = [];
  const lobbyMembersByLobbyId = new Map<string, LobbyMemberSnapshot[]>();
  let lobbyChatCollapsed = false;
  let directMessageTargetUserId: string | null = null;
  const directMessagesById = new Map<string, DirectChatMessage>();
  let directMessageRefreshTimer: number | null = null;
  let hasOpenedUsersPageOnce = false;
  let lobbyMemberSnapshotRefreshTimer: number | null = null;
  let lobbyMemberSnapshotRefreshInFlight = false;
  let lobbyContextMenuLobbyId: string | null = null;
  let lobbyActionModalState: {
    mode: "rename" | "delete";
    lobbyId: string;
  } | null = null;
  let remoteMediaAnnouncementInitialized = false;
  const remoteMediaStateByUserId = new Map<
    string,
    { cameraEnabled: boolean; screenSharing: boolean }
  >();

  const participantHoverControls = document.getElementById(
    "participantHoverControls",
  );
  const participantHoverControlButtons = participantHoverControls
    ? Array.from(
        participantHoverControls.querySelectorAll<HTMLButtonElement>(
          "[data-quick-control]",
        ),
      )
    : [];

  const applyLobbyChatPanelState = (): void => {
    dom.lobbyStageShell.classList.toggle(
      "is-chat-collapsed",
      lobbyChatCollapsed,
    );
    dom.lobbyChatPanel.dataset.collapsed = lobbyChatCollapsed
      ? "true"
      : "false";

    dom.lobbyChatToggleButton.setAttribute(
      "aria-expanded",
      lobbyChatCollapsed ? "false" : "true",
    );

    const actionLabel = lobbyChatCollapsed
      ? "Sohbet panelini aç"
      : "Sohbet panelini kapat";

    dom.lobbyChatToggleButton.title = actionLabel;
    dom.lobbyChatToggleButton.setAttribute("aria-label", actionLabel);

    const toggleLabel = dom.lobbyChatToggleButton.querySelector<HTMLElement>(
      ".lobby-chat-toggle-label",
    );
    if (toggleLabel) {
      toggleLabel.textContent = lobbyChatCollapsed ? "Aç" : "Daralt";
    }

    dom.lobbyChatReopenButton.setAttribute(
      "aria-hidden",
      lobbyChatCollapsed ? "false" : "true",
    );
    dom.lobbyChatReopenButton.disabled = !lobbyChatCollapsed;
  };

  const persistLobbyChatPanelState = (): void => {
    try {
      localStorage.setItem(
        LOBBY_CHAT_COLLAPSED_STORAGE_KEY,
        lobbyChatCollapsed ? "1" : "0",
      );
    } catch {
      // no-op
    }
  };

  const toggleLobbyChatPanel = (): void => {
    lobbyChatCollapsed = !lobbyChatCollapsed;
    applyLobbyChatPanelState();
    persistLobbyChatPanelState();
  };

  const formatChatClock = (createdAt: string): string => {
    const parsed = new Date(createdAt);
    if (Number.isNaN(parsed.getTime())) {
      return "--:--";
    }

    return parsed.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const resolveKnownUserName = (userId: string): string => {
    const mappedDisplayName = displayNameByUserId.get(userId)?.trim();
    if (mappedDisplayName && mappedDisplayName.length > 0) {
      return mappedDisplayName;
    }

    const knownUser = knownUsersById.get(userId);
    if (!knownUser) {
      return userId;
    }

    const displayName = knownUser.displayName.trim();
    if (displayName.length > 0) {
      return displayName;
    }

    return knownUser.username;
  };

  const markSelectedDirectMessageUser = (): void => {
    const rows = document.querySelectorAll<HTMLElement>(
      "#usersDirectoryList [data-user-id], #usersSidebarDirectoryList [data-user-id]",
    );
    for (const row of rows) {
      row.classList.toggle(
        "selected",
        directMessageTargetUserId !== null &&
          row.dataset.userId === directMessageTargetUserId,
      );
    }
  };

  const renderDirectMessagePanel = (): void => {
    const directMessageHeader =
      dom.directMessageSection.querySelector<HTMLElement>(
        ".direct-message-header",
      );

    if (!directMessageTargetUserId) {
      dom.usersPageDirectorySection.classList.add("hidden");
      dom.directMessageSection.classList.remove("hidden");
      directMessageHeader?.classList.add("hidden");
      dom.directMessageForm.classList.add("hidden");
      dom.directMessageTitle.textContent = "";
      dom.directMessageList.innerHTML =
        '<li class="direct-message-empty-state"><div class="direct-message-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M8 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm8 2a3 3 0 1 0-2.12-.88A2.98 2.98 0 0 0 16 12Zm-8 1c-2.67 0-8 1.34-8 4v1a1 1 0 0 0 1 1h10.28a6.94 6.94 0 0 1-.28-2c0-1.43.43-2.76 1.17-3.88A12.9 12.9 0 0 0 8 13Zm10 0a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm2.71 3.29a1 1 0 0 0-1.42 0L17 18.88l-.88-.88a1 1 0 0 0-1.42 1.42l1.59 1.58a1 1 0 0 0 1.42 0l2.99-3a1 1 0 0 0 0-1.41Z"/></svg></div><p class="direct-message-empty-title">Sohbet başlatmak için bir arkadaş seç</p><p class="direct-message-empty-subtitle">Soldaki listeden bir kişiye tıkla, bu alanda sadece onunla olan mesajlar açılır.</p></li>';
      dom.directMessageInput.disabled = true;
      dom.directMessageSendButton.disabled = true;
      return;
    }

    dom.usersPageDirectorySection.classList.add("hidden");
    dom.directMessageSection.classList.remove("hidden");
    directMessageHeader?.classList.remove("hidden");
    dom.directMessageForm.classList.remove("hidden");
    const peerName = resolveKnownUserName(directMessageTargetUserId);
    dom.directMessageTitle.textContent = `${peerName} ile mesajlaşıyorsun`;
    dom.directMessageInput.disabled = false;
    dom.directMessageSendButton.disabled = false;

    const shouldStickBottom =
      dom.directMessageList.scrollHeight -
        (dom.directMessageList.scrollTop +
          dom.directMessageList.clientHeight) <=
      48;

    const messages = Array.from(directMessagesById.values()).sort(
      (left, right) => {
        const leftTime = new Date(left.createdAt).getTime();
        const rightTime = new Date(right.createdAt).getTime();
        if (
          Number.isFinite(leftTime) &&
          Number.isFinite(rightTime) &&
          leftTime !== rightTime
        ) {
          return leftTime - rightTime;
        }

        return left.id.localeCompare(right.id);
      },
    );

    dom.directMessageList.innerHTML = "";
    if (messages.length === 0) {
      const empty = document.createElement("li");
      empty.className = "lobby-chat-empty";
      empty.textContent = "Henüz mesaj yok. İlk mesajı sen gönder.";
      dom.directMessageList.appendChild(empty);
      return;
    }

    for (const message of messages) {
      const row = document.createElement("li");
      const isOwn = selfUserId !== null && message.userId === selfUserId;
      row.className = isOwn
        ? "lobby-chat-message lobby-chat-message--self"
        : "lobby-chat-message";

      const meta = document.createElement("div");
      meta.className = "lobby-chat-meta";

      const author = document.createElement("strong");
      author.className = "lobby-chat-author";
      author.textContent = isOwn ? "Sen" : resolveKnownUserName(message.userId);

      const timestamp = document.createElement("time");
      timestamp.className = "lobby-chat-time";
      timestamp.dateTime = message.createdAt;
      timestamp.textContent = formatChatClock(message.createdAt);

      const body = document.createElement("p");
      body.className = "lobby-chat-body";
      body.textContent = message.body;

      meta.appendChild(author);
      meta.appendChild(timestamp);
      row.appendChild(meta);
      row.appendChild(body);
      dom.directMessageList.appendChild(row);
    }

    if (shouldStickBottom) {
      dom.directMessageList.scrollTop = dom.directMessageList.scrollHeight;
    }
  };

  const resolveLobbyMemberDisplayName = (
    member: LobbyMemberSnapshot,
  ): string => {
    const mappedDisplayName = displayNameByUserId.get(member.userId)?.trim();
    if (mappedDisplayName && mappedDisplayName.length > 0) {
      return mappedDisplayName;
    }

    const knownUser = knownUsersById.get(member.userId);
    if (knownUser) {
      const knownDisplayName = knownUser.displayName.trim();
      if (knownDisplayName.length > 0) {
        return knownDisplayName;
      }
    }

    const username = member.username.trim();
    if (username.length > 0) {
      return username;
    }

    return member.userId;
  };

  const createLobbyMemberStatusIcon = (
    type: "mic" | "headphone",
    isOn: boolean,
  ): HTMLSpanElement => {
    const icon = document.createElement("span");
    icon.className = `presence-icon ${type} ${isOn ? "on" : "off"} w-4 h-4 rounded-full border inline-flex items-center justify-center`;
    icon.title =
      type === "mic"
        ? isOn
          ? "Mikrofon açık"
          : "Mikrofon kapalı"
        : isOn
          ? "Kulaklık açık"
          : "Kulaklık kapalı";
    icon.setAttribute("aria-label", icon.title);

    icon.innerHTML =
      type === "mic"
        ? isOn
          ? '<svg class="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Zm5-3a1 1 0 0 1 2 0 7 7 0 0 1-6 6.93V20h3a1 1 0 1 1 0 2H8a1 1 0 0 1 0-2h3v-2.07A7 7 0 0 1 5 11a1 1 0 0 1 2 0 5 5 0 0 0 10 0Z"/></svg>'
          : '<svg class="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18.9 17.5A7 7 0 0 1 13 19.93V22h3a1 1 0 1 1 0 2H8a1 1 0 0 1 0-2h3v-2.07A7 7 0 0 1 5 13a1 1 0 1 1 2 0 5 5 0 0 0 8.73 3.4ZM15 8v2.17l-6-6V8a3 3 0 0 0 6 0ZM2.3 20.3a1 1 0 1 0 1.4 1.4l18-18a1 1 0 1 0-1.4-1.4l-18 18Z"/></svg>'
        : isOn
          ? '<svg class="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4a8 8 0 0 0-8 8v4a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H6v-1a6 6 0 1 1 12 0v1h-2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1a3 3 0 0 0 3-3v-4a8 8 0 0 0-8-8Z"/></svg>'
          : '<svg class="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4a8 8 0 0 0-7.69 10.2A3 3 0 0 0 4 15v1a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2v-2.17l-4-4V11a6 6 0 0 1 10.73-3.67l1.43 1.43A7.95 7.95 0 0 0 12 4ZM20 16v-2a8.16 8.16 0 0 0-.4-2.52L22 13.88V16a3 3 0 0 1-3 3h-1a2 2 0 0 1-2-2v-.88l2 2A3 3 0 0 0 20 16Zm-16.7 4.3a1 1 0 0 0 1.4 1.4l16-16a1 1 0 1 0-1.4-1.4l-16 16Z"/></svg>';

    return icon;
  };

  const setLobbyMembersSnapshot = (
    lobbyId: string,
    members: LobbyMemberSnapshot[],
  ): void => {
    const normalizedLobbyID = lobbyId.trim();
    if (!normalizedLobbyID) {
      return;
    }

    const normalizedMembers = [...members].sort((left, right) => {
      return resolveLobbyMemberDisplayName(left).localeCompare(
        resolveLobbyMemberDisplayName(right),
        "tr",
      );
    });
    lobbyMembersByLobbyId.set(normalizedLobbyID, normalizedMembers);
  };

  const pruneLobbyMemberSnapshots = (): void => {
    const existingLobbyIds = new Set(availableLobbies.map((lobby) => lobby.id));
    for (const lobbyId of Array.from(lobbyMembersByLobbyId.keys())) {
      if (!existingLobbyIds.has(lobbyId)) {
        lobbyMembersByLobbyId.delete(lobbyId);
      }
    }
  };

  const loadLobbyMemberSnapshots = async (silent = true): Promise<void> => {
    pruneLobbyMemberSnapshots();
    await Promise.all(
      availableLobbies.map(async (lobby) => {
        const response = await window.desktopApi.getLobbyStateById({
          lobbyId: lobby.id,
        });
        if (!response.ok || !response.data) {
          if (!silent && response.error?.statusCode !== 404) {
            setStatus(
              `Lobi kullanıcıları alınamadı: ${getErrorMessage(response.error)}`,
              true,
            );
          }
          if (response.error?.statusCode === 404) {
            lobbyMembersByLobbyId.delete(lobby.id);
          }
          return;
        }

        setLobbyMembersSnapshot(lobby.id, response.data.members);
      }),
    );
  };

  const syncActiveLobbyPresentation = (): void => {
    const activeLobby = availableLobbies.find(
      (lobby) => lobby.id === activeLobbyId,
    );
    activeLobbyName = activeLobby?.name ?? activeLobbyId;
    dom.lobbyChatInput.placeholder = `${activeLobbyName} lobisine mesaj yaz`;

    const lobbyChatTitle =
      dom.lobbyChatPanel.querySelector<HTMLElement>(".lobby-chat-title");
    if (lobbyChatTitle) {
      lobbyChatTitle.textContent = `${activeLobbyName} Sohbeti`;
    }

    dom.lobbiesList.innerHTML = "";
    if (availableLobbies.length === 0) {
      const empty = document.createElement("li");
      empty.className = "lobby-chat-empty";
      empty.textContent = "Henüz lobi yok.";
      dom.lobbiesList.appendChild(empty);
      return;
    }

    for (const lobby of availableLobbies) {
      const isDefaultLobby = lobby.id === runtimeConfig.liveKitDefaultRoom;
      const item = document.createElement("li");
      item.className = "lobby-room-card";

      const header = document.createElement("div");
      header.className = "lobby-room-header";

      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = "lobby-room-select";
      selectButton.dataset.lobbyId = lobby.id;

      const title = document.createElement("span");
      title.className = "lobby-room-name";
      title.textContent = lobby.name;

      const memberCount = document.createElement("span");
      memberCount.className = "lobby-room-count";
      memberCount.textContent = `${lobby.memberCount}`;

      selectButton.appendChild(title);
      selectButton.appendChild(memberCount);
      header.appendChild(selectButton);

      if (!isDefaultLobby) {
        item.dataset.lobbyContextEnabled = "true";
      }

      item.appendChild(header);

      const membersList = document.createElement("ul");
      membersList.className = "lobby-room-members";
      const members = lobbyMembersByLobbyId.get(lobby.id) ?? [];

      if (members.length === 0) {
        const emptyMember = document.createElement("li");
        emptyMember.className = "lobby-room-member is-empty";
        emptyMember.textContent =
          lobby.memberCount > 0
            ? `${lobby.memberCount} kullanıcı bu lobide.`
            : "Kimse bu lobide değil.";
        membersList.appendChild(emptyMember);
      } else {
        for (const member of members) {
          const memberRow = document.createElement("li");
          memberRow.className = "lobby-room-member";
          memberRow.dataset.userId = member.userId;
          const memberName = resolveLobbyMemberDisplayName(member);
          const nameLabel = document.createElement("span");
          nameLabel.className = "lobby-room-member-name";

          if (selfUserId !== null && member.userId === selfUserId) {
            nameLabel.textContent = `${memberName} (Sen)`;
            memberRow.classList.add("is-self");
          } else {
            nameLabel.textContent = memberName;
          }

          const status = document.createElement("span");
          status.className = "lobby-room-member-status";
          status.appendChild(createLobbyMemberStatusIcon("mic", !member.muted));
          status.appendChild(
            createLobbyMemberStatusIcon("headphone", !member.deafened),
          );

          memberRow.appendChild(nameLabel);
          memberRow.appendChild(status);
          membersList.appendChild(memberRow);
        }
      }

      item.appendChild(membersList);
      dom.lobbiesList.appendChild(item);
    }
  };

  const resolveQuickControlSourceButton = (
    quickControl: string,
  ): HTMLButtonElement | null => {
    switch (quickControl) {
      case "mic":
        return dom.quickMicToggle;
      case "camera":
        return dom.quickCameraToggle;
      case "screen":
        return dom.quickScreenToggle;
      case "headphone":
        return dom.quickHeadphoneToggle;
      case "connection":
        return dom.quickConnectionToggle;
      default:
        return null;
    }
  };

  const syncParticipantHoverControl = (button: HTMLButtonElement): void => {
    const quickControl = button.dataset.quickControl;
    if (!quickControl) {
      return;
    }

    const sourceButton = resolveQuickControlSourceButton(quickControl);
    if (!sourceButton) {
      return;
    }

    button.classList.toggle(
      "active",
      sourceButton.classList.contains("active"),
    );
    button.classList.toggle(
      "danger",
      sourceButton.classList.contains("danger"),
    );
    button.disabled = sourceButton.disabled;
    button.title = sourceButton.title;
    button.setAttribute("aria-label", sourceButton.title);

    const stateText = sourceButton.dataset.stateText ?? "OFF";
    button.dataset.stateText = stateText;
    button.setAttribute("aria-pressed", stateText === "ON" ? "true" : "false");
  };

  const syncParticipantHoverControls = (): void => {
    for (const button of participantHoverControlButtons) {
      syncParticipantHoverControl(button);
    }
  };

  const bindParticipantHoverControls = (): void => {
    if (participantHoverControlButtons.length === 0) {
      return;
    }

    for (const button of participantHoverControlButtons) {
      button.addEventListener("click", () => {
        const quickControl = button.dataset.quickControl;
        if (!quickControl) {
          return;
        }

        const sourceButton = resolveQuickControlSourceButton(quickControl);
        if (!sourceButton || sourceButton.disabled) {
          return;
        }

        sourceButton.click();
      });
    }

    const stateObserver = new MutationObserver(() => {
      syncParticipantHoverControls();
    });

    const sourceButtons = [
      dom.quickMicToggle,
      dom.quickCameraToggle,
      dom.quickScreenToggle,
      dom.quickHeadphoneToggle,
      dom.quickConnectionToggle,
    ];

    for (const sourceButton of sourceButtons) {
      stateObserver.observe(sourceButton, {
        attributes: true,
        attributeFilter: ["class", "data-state-text", "disabled", "title"],
      });
    }

    syncParticipantHoverControls();
    lifecycle.add(() => {
      stateObserver.disconnect();
    });
  };

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
      localStorage.getItem(CAMERA_RESOLUTION_STORAGE_KEY) ??
      mediaQualityDefaults.cameraResolution;
    cameraFps =
      localStorage.getItem(CAMERA_FPS_STORAGE_KEY) ??
      mediaQualityDefaults.cameraFps;
    inputGainPercent = clampInputGainPercent(
      Number(localStorage.getItem(INPUT_GAIN_STORAGE_KEY) ?? "100"),
    );
    screenResolution =
      localStorage.getItem(SCREEN_RESOLUTION_STORAGE_KEY) ??
      mediaQualityDefaults.screenResolution;
    screenFps =
      localStorage.getItem(SCREEN_FPS_STORAGE_KEY) ??
      mediaQualityDefaults.screenFps;
    screenShareMode = normalizeScreenCaptureKind(
      localStorage.getItem(SCREEN_MODE_STORAGE_KEY),
    );
    lobbyChatCollapsed =
      localStorage.getItem(LOBBY_CHAT_COLLAPSED_STORAGE_KEY) === "1";

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
    cameraResolution = mediaQualityDefaults.cameraResolution;
    cameraFps = mediaQualityDefaults.cameraFps;
    inputGainPercent = 100;
    screenResolution = mediaQualityDefaults.screenResolution;
    screenFps = mediaQualityDefaults.screenFps;
    screenShareMode = "any";
    lobbyChatCollapsed = false;
    mediaDebugLogEntries = [];
    participantAudioSettings = new Map<string, ParticipantAudioSetting>();
  }

  uiSoundController.setEnabled(uiSoundsEnabled);
  applyLobbyChatPanelState();

  let toastSequence = 0;
  let lastToastMessage = "";
  let lastToastAt = 0;

  const shouldShowToast = (message: string, isError: boolean): boolean => {
    if (isError) {
      return true;
    }

    const allowedInfoPatterns = [
      /Giriş başarılı/i,
      /Kayıt ve giriş başarılı/i,
      /Profil bilgileri güncellendi/i,
      /Şifre başarıyla güncellendi/i,
      /Çıkış yapıldı/i,
      /Yeni sürüm/i,
      /Uygulama güncel/i,
      /Uygulama güncelleme için yeniden başlatılıyor/i,
      /Uygulama yeniden baslatiliyor/i,
    ];

    if (!allowedInfoPatterns.some((pattern) => pattern.test(message))) {
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
        if (!hasOpenedUsersPageOnce) {
          hasOpenedUsersPageOnce = true;
          directMessageTargetUserId = null;
          directMessagesById.clear();
          stopDirectMessageRefresh();
          renderDirectMessagePanel();
          markSelectedDirectMessageUser();
        }

        void refreshLobby(true);
        void directoryController.refreshRegisteredUsers(true);
      }
    },
  });

  const lobbyController = createLobbyController(dom);
  const lobbyChatController = createLobbyChatController(dom);
  lobbyChatController.clear();
  lobbyChatController.setSending(false);
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
    lobbyChatController.setDisplayNameMap(displayNameByUserId);
    syncActiveLobbyPresentation();
  };

  const applyLocalDisplayName = (userId: string, displayName: string): void => {
    const normalized = displayName.trim();
    if (normalized.length === 0) {
      displayNameByUserId.delete(userId);
    } else {
      displayNameByUserId.set(userId, normalized);
    }

    lobbyController.setDisplayNameMap(displayNameByUserId);
    lobbyChatController.setDisplayNameMap(displayNameByUserId);
  };

  const directoryController = createDirectoryController({
    dom,
    desktopApi,
    lobbyController,
    getSelfUserId: () => selfUserId,
    getSelectedUserId: () => directMessageTargetUserId,
    setStatus,
    getErrorMessage,
    onUsersRefreshed: (users) => {
      knownUsersById.clear();
      for (const user of users) {
        knownUsersById.set(user.userId, user);
      }
      syncDisplayNameMapFromUsers(users);
      void loadLobbyMemberSnapshots(true).then(() => {
        syncActiveLobbyPresentation();
      });
      renderDirectMessagePanel();
      markSelectedDirectMessageUser();
      void voiceController.onLobbyUpdated();
    },
  });

  const renderUserDirectoryWithDmSelection = (): void => {
    directoryController.renderUserDirectory();
    markSelectedDirectMessageUser();
  };

  const diagnosticsController = createDiagnosticsController({
    dom,
    setStatus,
    getMetrics: () => ({
      voiceConnected,
      voiceConnectionInProgress,
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
    if (
      voiceConnectionInProgress &&
      !isError &&
      message !== "Sohbete bağlanılıyor..."
    ) {
      return;
    }

    dom.voiceState.textContent = message;
    dom.voiceState.style.color = isError ? "#ffaaaa" : "#93a8be";
  };

  const setVoiceConnectionInProgress = (inProgress: boolean): void => {
    voiceConnectionInProgress = inProgress;
    if (inProgress) {
      setVoiceState("Sohbete bağlanılıyor...", false);
    }

    diagnosticsController.updateConnectionDiagnostics();
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
      return "[detay serileştirilemedi]";
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
    stopLobbyMemberSnapshotRefresh();
  });
  lifecycle.add(() => {
    stopDirectMessageRefresh();
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

  const syncLobbyEntryDependentControls = (): void => {
    const isInLobby = voiceConnected;
    dom.quickConnectionToggle.classList.toggle("hidden", !isInLobby);
    dom.quickCameraToggle.classList.toggle("hidden", !isInLobby);
    dom.quickScreenToggle.classList.toggle("hidden", !isInLobby);
    dom.lobbyStageShell.classList.toggle("is-empty-lobby-state", !isInLobby);
    dom.participantGrid.classList.toggle("hidden", !isInLobby);
    dom.lobbyJoinEmptyState.classList.toggle("hidden", isInLobby);
    dom.lobbyChatReopenButton.classList.toggle("hidden", !isInLobby);

    if (participantHoverControls instanceof HTMLElement) {
      participantHoverControls.classList.toggle("hidden", !isInLobby);
    }
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

    syncLobbyEntryDependentControls();
    syncActiveLobbyPresentation();

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
    renderUserDirectoryWithDmSelection();
  };

  const resolveRealtimeLobbyId = (lobbyId?: string): string => {
    const normalizedLobbyID = lobbyId?.trim() ?? "";
    if (normalizedLobbyID.length > 0) {
      return normalizedLobbyID;
    }

    return activeLobbyId;
  };

  const syncLobbyMemberCountFromSnapshot = (
    lobbyId: string,
    memberCount: number,
  ): void => {
    const lobbyIndex = availableLobbies.findIndex(
      (lobby) => lobby.id === lobbyId,
    );
    if (lobbyIndex < 0) {
      return;
    }

    const currentLobby = availableLobbies[lobbyIndex];
    if (!currentLobby || currentLobby.memberCount === memberCount) {
      return;
    }

    availableLobbies[lobbyIndex] = {
      ...currentLobby,
      memberCount,
    };
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
      hasOpenedUsersPageOnce = false;
      stopLobbyMemberSnapshotRefresh();
      stopDirectMessageRefresh();
      selfUserId = null;
      knownUsersById.clear();
      displayNameByUserId.clear();
      lobbyController.setDisplayNameMap(displayNameByUserId);
      availableLobbies = [];
      lobbyMembersByLobbyId.clear();
      activeLobbyId = runtimeConfig.liveKitDefaultRoom;
      activeLobbyName = "Ana Lobi";
      syncActiveLobbyPresentation();
      directMessageTargetUserId = null;
      directMessagesById.clear();
      renderDirectMessagePanel();
      directoryController.clearUsers();
      renderUserDirectoryWithDmSelection();
      lobbyController.clearLobby();
      latestLobbyRevision = 0;
      resetRemoteMediaAnnouncementState();
      cancelPendingShareModalFlow();
      void voiceController.shutdownMedia();
      stopAllShareTests();
      applyLocalMediaOffState();
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
    getLiveKitDefaultRoom: () => activeLobbyId,
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

  const cancelPendingShareModalFlow = (): void => {
    shareModalController.completeScreenModalSelection(false);
    shareModalController.closeScreenModal();
  };

  const applyLocalMediaOffState = (): void => {
    isMuted = true;
    isSpeaking = false;
    voiceConnected = false;
    voiceJoinLatencyMs = null;
    cameraSharing = false;
    screenSharing = false;
    updateMuteButton();
    updateQuickConnectionButton();
    updateCameraShareButton();
    updateScreenShareButton();
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

    if (!voiceConnected) {
      setStatus(
        "Sohbet bağlantısı kapandığı için kamera paylaşımı başlatılmadı",
        true,
      );
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

    if (!voiceConnected) {
      setStatus(
        "Sohbet bağlantısı kapandığı için ekran paylaşımı başlatılmadı",
        true,
      );
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

  const loadLobbiesFromBackend = async (silent = true): Promise<boolean> => {
    const lobbiesResult = await window.desktopApi.listLobbies();
    if (!lobbiesResult.ok || !lobbiesResult.data) {
      if (!silent) {
        setStatus(
          `Lobi listesi alınamadı: ${getErrorMessage(lobbiesResult.error)}`,
          true,
        );
      }
      return false;
    }

    availableLobbies = lobbiesResult.data.lobbies;
    if (availableLobbies.length === 0) {
      lobbyMembersByLobbyId.clear();
      syncActiveLobbyPresentation();
      return true;
    }

    if (availableLobbies.length > 0) {
      const current = availableLobbies.find(
        (lobby) => lobby.id === activeLobbyId,
      );
      if (!current) {
        const [firstLobby] = availableLobbies;
        if (!firstLobby) {
          return false;
        }
        activeLobbyId = firstLobby.id;
        await window.desktopApi.selectLobby({ lobbyId: activeLobbyId });
      }
    }

    await loadLobbyMemberSnapshots(true);
    syncActiveLobbyPresentation();
    return true;
  };

  const selectLobbyById = async (
    nextLobbyId: string,
    options?: {
      silent?: boolean;
      reconnectVoice?: boolean;
      connectVoice?: boolean;
    },
  ): Promise<boolean> => {
    const normalizedLobbyID = nextLobbyId.trim();
    if (normalizedLobbyID.length === 0) {
      return false;
    }

    const previousLobbyID = activeLobbyId;
    const shouldReconnectVoice =
      options?.reconnectVoice === true && voiceConnected;
    const isSwitchingLobby = previousLobbyID !== normalizedLobbyID;

    if (shouldReconnectVoice && isSwitchingLobby) {
      const disconnected = await disconnectFromChat();
      if (!disconnected) {
        return false;
      }
    }

    const selected = await window.desktopApi.selectLobby({
      lobbyId: normalizedLobbyID,
    });
    if (!selected.ok || !selected.data) {
      if (shouldReconnectVoice && isSwitchingLobby && !voiceConnected) {
        await connectToChat();
      }
      if (options?.silent !== true) {
        setStatus(`Lobi seçilemedi: ${getErrorMessage(selected.error)}`, true);
      }
      return false;
    }

    activeLobbyId = selected.data.lobbyId;
    latestLobbyRevision = 0;
    resetRemoteMediaAnnouncementState();
    lobbyController.clearLobby();
    lobbyChatController.clear();
    await loadLobbiesFromBackend(true);
    syncActiveLobbyPresentation();

    if (shouldReconnectVoice && isSwitchingLobby) {
      const connected = await connectToChat();
      if (!connected) {
        return false;
      }
    } else if (options?.connectVoice === true && !voiceConnected) {
      const connected = await connectToChat();
      if (!connected) {
        return false;
      }
    } else {
      await refreshLobby(true);
    }

    await loadLobbyChatHistory(true);

    if (options?.silent !== true) {
      setStatus(`Aktif lobi: ${activeLobbyName}`, false);
    }

    return true;
  };

  const stopDirectMessageRefresh = (): void => {
    if (directMessageRefreshTimer !== null) {
      window.clearInterval(directMessageRefreshTimer);
      directMessageRefreshTimer = null;
    }
  };

  const stopLobbyMemberSnapshotRefresh = (): void => {
    if (lobbyMemberSnapshotRefreshTimer !== null) {
      window.clearInterval(lobbyMemberSnapshotRefreshTimer);
      lobbyMemberSnapshotRefreshTimer = null;
    }
  };

  const refreshLobbiesAndMemberSnapshots = async (): Promise<void> => {
    if (lobbyMemberSnapshotRefreshInFlight) {
      return;
    }

    lobbyMemberSnapshotRefreshInFlight = true;
    try {
      const loaded = await loadLobbiesFromBackend(true);
      if (!loaded) {
        return;
      }

      syncActiveLobbyPresentation();
      renderUserDirectoryWithDmSelection();
    } finally {
      lobbyMemberSnapshotRefreshInFlight = false;
    }
  };

  const startLobbyMemberSnapshotRefresh = (): void => {
    stopLobbyMemberSnapshotRefresh();
    void refreshLobbiesAndMemberSnapshots();
    lobbyMemberSnapshotRefreshTimer = window.setInterval(() => {
      void refreshLobbiesAndMemberSnapshots();
    }, LOBBY_MEMBERS_REFRESH_INTERVAL_MS);
  };

  const loadDirectMessages = async (silent = true): Promise<void> => {
    if (!directMessageTargetUserId) {
      directMessagesById.clear();
      renderDirectMessagePanel();
      return;
    }

    const result = await window.desktopApi.chatListDirectMessages({
      peerUserId: directMessageTargetUserId,
      limit: 100,
    });

    if (!result.ok || !result.data) {
      if (!silent) {
        setStatus(
          `Direkt mesaj geçmişi alınamadı: ${getErrorMessage(result.error)}`,
          true,
        );
      }
      return;
    }

    directMessagesById.clear();
    for (const message of result.data.messages) {
      directMessagesById.set(message.id, message);
    }
    renderDirectMessagePanel();
  };

  const startDirectMessageRefresh = (): void => {
    stopDirectMessageRefresh();
    if (!directMessageTargetUserId) {
      return;
    }

    directMessageRefreshTimer = window.setInterval(() => {
      void loadDirectMessages(true);
    }, 3000);
  };

  const selectDirectMessagePeer = async (userId: string): Promise<void> => {
    const normalizedUserID = userId.trim();
    if (!normalizedUserID || normalizedUserID === selfUserId) {
      return;
    }

    if (directMessageTargetUserId === normalizedUserID) {
      // Ignore duplicate click for the selected peer to avoid flicker/toggle.
      return;
    }

    directMessageTargetUserId = normalizedUserID;
    directMessagesById.clear();
    renderDirectMessagePanel();
    markSelectedDirectMessageUser();
    await loadDirectMessages(true);
    startDirectMessageRefresh();
  };

  const sendDirectMessage = async (body: string): Promise<void> => {
    const normalizedBody = body.trim();
    if (!directMessageTargetUserId || normalizedBody.length === 0) {
      return;
    }

    dom.directMessageSendButton.disabled = true;
    try {
      const result = await window.desktopApi.chatSendDirectMessage({
        peerUserId: directMessageTargetUserId,
        body: normalizedBody,
      });

      if (!result.ok || !result.data) {
        setStatus(
          `Direkt mesaj gönderilemedi: ${getErrorMessage(result.error)}`,
          true,
        );
        return;
      }

      dom.directMessageInput.value = "";
      directMessagesById.set(result.data.message.id, result.data.message);
      renderDirectMessagePanel();
    } finally {
      dom.directMessageSendButton.disabled = false;
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

  const loadLobbyChatHistory = async (silent = true): Promise<void> => {
    const result = await window.desktopApi.chatListLobbyMessages({
      limit: 80,
    });

    if (!result.ok || !result.data) {
      if (!silent) {
        setStatus(
          `Lobi sohbet geçmişi alınamadı: ${getErrorMessage(result.error)}`,
          true,
        );
      }
      return;
    }

    lobbyChatController.replaceMessages(result.data.messages);
  };

  const sendLobbyChatMessage = async (body: string): Promise<void> => {
    const normalizedBody = body.trim();
    if (normalizedBody.length === 0) {
      return;
    }

    lobbyChatController.setSending(true);
    try {
      const result = await window.desktopApi.chatSendLobbyMessage({
        body: normalizedBody,
      });

      if (!result.ok || !result.data) {
        setStatus(
          `Mesaj gönderilemedi: ${getErrorMessage(result.error)}`,
          true,
        );
        return;
      }

      dom.lobbyChatInput.value = "";
      lobbyChatController.appendMessage(result.data.message);
    } finally {
      lobbyChatController.setSending(false);
    }
  };

  const connectToChat = async (): Promise<boolean> => {
    if (voiceConnectionInProgress) {
      return false;
    }

    const joinStartedAt = performance.now();
    setVoiceConnectionInProgress(true);

    const realtimeReady = await connectRealtimeAndJoin();
    if (!realtimeReady) {
      setVoiceConnectionInProgress(false);
      setVoiceState("Ses beklemede", false);
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
      setVoiceConnectionInProgress(false);
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
    setVoiceConnectionInProgress(false);
    setVoiceState("LiveKit bağlantısı hazır", false);
    updateQuickConnectionButton();
    updateCameraShareButton();
    updateScreenShareButton();
    uiSoundController.play("connect");
    setStatus(`${activeLobbyName} lobisine bağlanıldı`, false);
    return true;
  };

  const disconnectFromChat = async (): Promise<boolean> => {
    cancelPendingShareModalFlow();
    stopAllShareTests();
    await voiceController.shutdownMedia();
    applyLocalMediaOffState();

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

    const currentSelfUserId = selfUserId ?? authController.getSelfUserId();
    if (currentSelfUserId) {
      const activeMembers = lobbyMembersByLobbyId.get(activeLobbyId) ?? [];
      const nextMembers = activeMembers.filter(
        (existingMember) => existingMember.userId !== currentSelfUserId,
      );
      setLobbyMembersSnapshot(activeLobbyId, nextMembers);

      const lobbyIndex = availableLobbies.findIndex(
        (lobby) => lobby.id === activeLobbyId,
      );
      if (lobbyIndex >= 0) {
        const currentLobby = availableLobbies[lobbyIndex];
        if (currentLobby) {
          const nextLobby: LobbyDescriptor = {
            ...currentLobby,
            memberCount: Math.max(0, currentLobby.memberCount - 1),
          };
          availableLobbies[lobbyIndex] = nextLobby;
        }
      }

      lobbyController.removeMember(currentSelfUserId);
      remoteMediaStateByUserId.delete(currentSelfUserId);
      syncActiveLobbyPresentation();
      renderUserDirectoryWithDmSelection();
    }

    resetRemoteMediaAnnouncementState();
    uiSoundController.play("disconnect");
    setStatus(`${activeLobbyName} lobisinden çıkıldı`, false);
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
      cancelPendingShareModalFlow();
      void voiceController.shutdownMedia();
      resetRemoteMediaAnnouncementState();
      stopAllShareTests();
      applyLocalMediaOffState();
    },
    updateDiagnostics: () => {
      diagnosticsController.updateConnectionDiagnostics();
    },
    onLobbyStateApplied: (members, lobbyId) => {
      const targetLobbyID = resolveRealtimeLobbyId(lobbyId);
      setLobbyMembersSnapshot(targetLobbyID, members);
      syncLobbyMemberCountFromSnapshot(targetLobbyID, members.length);

      if (targetLobbyID === activeLobbyId) {
        lobbyController.renderLobby({
          members,
          size: members.length,
        });
        void voiceController.onLobbyUpdated();
      }

      syncActiveLobbyPresentation();
      renderUserDirectoryWithDmSelection();
    },
    onMemberJoinedApplied: (member, lobbyId) => {
      const targetLobbyID = resolveRealtimeLobbyId(lobbyId);
      const existingMembers = lobbyMembersByLobbyId.get(targetLobbyID) ?? [];
      const nextMembers = existingMembers.filter(
        (existingMember) => existingMember.userId !== member.userId,
      );
      nextMembers.push(member);
      setLobbyMembersSnapshot(targetLobbyID, nextMembers);
      syncLobbyMemberCountFromSnapshot(targetLobbyID, nextMembers.length);

      if (targetLobbyID === activeLobbyId) {
        remoteMediaStateByUserId.set(member.userId, {
          cameraEnabled: member.cameraEnabled === true,
          screenSharing: member.screenSharing === true,
        });
        lobbyController.addOrUpdateMember(member);
        void voiceController.onLobbyUpdated();
      }

      syncActiveLobbyPresentation();
      renderUserDirectoryWithDmSelection();
    },
    onMemberUpdatedApplied: (member, lobbyId) => {
      const targetLobbyID = resolveRealtimeLobbyId(lobbyId);
      const existingMembers = lobbyMembersByLobbyId.get(targetLobbyID) ?? [];
      const nextMembers = existingMembers.filter(
        (existingMember) => existingMember.userId !== member.userId,
      );
      nextMembers.push(member);
      setLobbyMembersSnapshot(targetLobbyID, nextMembers);
      syncLobbyMemberCountFromSnapshot(targetLobbyID, nextMembers.length);

      if (targetLobbyID === activeLobbyId) {
        remoteMediaStateByUserId.set(member.userId, {
          cameraEnabled: member.cameraEnabled === true,
          screenSharing: member.screenSharing === true,
        });
        lobbyController.addOrUpdateMember(member);
        void voiceController.onLobbyUpdated();
      }

      syncActiveLobbyPresentation();
      renderUserDirectoryWithDmSelection();
    },
    onMemberLeftApplied: (userId, lobbyId) => {
      const targetLobbyID = resolveRealtimeLobbyId(lobbyId);
      const existingMembers = lobbyMembersByLobbyId.get(targetLobbyID) ?? [];
      const nextMembers = existingMembers.filter(
        (existingMember) => existingMember.userId !== userId,
      );
      setLobbyMembersSnapshot(targetLobbyID, nextMembers);
      syncLobbyMemberCountFromSnapshot(targetLobbyID, nextMembers.length);

      if (targetLobbyID === activeLobbyId) {
        remoteMediaStateByUserId.delete(userId);
        lobbyController.removeMember(userId);
        voiceController.onMemberLeft(userId);
      }

      syncActiveLobbyPresentation();
      renderUserDirectoryWithDmSelection();
    },
    onLobbyChatHistoryApplied: (messages: LobbyChatMessage[]) => {
      lobbyChatController.replaceMessages(messages);
    },
    onLobbyMessageApplied: (message: LobbyChatMessage) => {
      lobbyChatController.appendMessage(message);
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
    onSendDirectMessageToUser: (userId) => {
      workspaceController.setWorkspacePage("users");
      void selectDirectMessagePeer(userId);
    },
    toggleParticipantMute,
    updateParticipantAudioVolume: handleParticipantAudioVolumeUpdate,
  });

  const closeLobbyContextMenu = (): void => {
    lobbyContextMenuLobbyId = null;
    dom.lobbyContextMenu.classList.add("hidden");
    dom.lobbyContextMenu.setAttribute("aria-hidden", "true");
  };

  const openLobbyContextMenu = (
    lobbyId: string,
    clientX: number,
    clientY: number,
  ): void => {
    const selectedLobby = availableLobbies.find(
      (lobby) => lobby.id === lobbyId,
    );
    if (
      !selectedLobby ||
      selectedLobby.id === runtimeConfig.liveKitDefaultRoom
    ) {
      closeLobbyContextMenu();
      return;
    }

    lobbyContextMenuLobbyId = selectedLobby.id;
    dom.lobbyContextMenuTitle.textContent = `${selectedLobby.name} işlemleri`;
    dom.lobbyContextMenu.classList.remove("hidden");
    dom.lobbyContextMenu.setAttribute("aria-hidden", "false");

    const menuWidth = dom.lobbyContextMenu.offsetWidth || 260;
    const menuHeight = dom.lobbyContextMenu.offsetHeight || 140;
    const nextLeft = Math.min(
      Math.max(8, clientX),
      window.innerWidth - menuWidth - 8,
    );
    const nextTop = Math.min(
      Math.max(8, clientY),
      window.innerHeight - menuHeight - 8,
    );

    dom.lobbyContextMenu.style.left = `${nextLeft}px`;
    dom.lobbyContextMenu.style.top = `${nextTop}px`;
  };

  lifecycle.on(document, "click", (event) => {
    if (lobbyContextMenuLobbyId === null) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node) || !dom.lobbyContextMenu.contains(target)) {
      closeLobbyContextMenu();
    }
  });

  lifecycle.on(document, "contextmenu", (event) => {
    if (lobbyContextMenuLobbyId === null) {
      return;
    }

    const target = event.target;
    if (target instanceof Node && dom.lobbyContextMenu.contains(target)) {
      return;
    }

    if (
      target instanceof HTMLElement &&
      target.closest("#lobbiesList [data-lobby-id]")
    ) {
      return;
    }

    closeLobbyContextMenu();
  });

  const renameLobbyById = async (
    lobbyId: string,
    nextName: string,
  ): Promise<void> => {
    const response = await window.desktopApi.updateLobby({
      lobbyId,
      name: nextName,
    });
    if (!response.ok || !response.data) {
      setStatus(`Lobi düzenlenemedi: ${getErrorMessage(response.error)}`, true);
      return;
    }

    await loadLobbiesFromBackend(true);
    syncActiveLobbyPresentation();
    setStatus("Lobi adı güncellendi", false);
  };

  const deleteLobbyById = async (lobbyId: string): Promise<void> => {
    const wasActiveLobby = lobbyId === activeLobbyId;
    const response = await window.desktopApi.deleteLobby({ lobbyId });
    if (!response.ok || !response.data || response.data.deleted !== true) {
      setStatus(`Lobi silinemedi: ${getErrorMessage(response.error)}`, true);
      return;
    }

    await loadLobbiesFromBackend(true);
    if (wasActiveLobby) {
      await selectLobbyById(runtimeConfig.liveKitDefaultRoom, {
        reconnectVoice: voiceConnected,
        connectVoice: voiceConnected,
        silent: true,
      });
    } else {
      syncActiveLobbyPresentation();
    }

    setStatus("Lobi silindi", false);
  };

  const closeLobbyActionModal = (): void => {
    lobbyActionModalState = null;
    dom.lobbyActionModal.classList.add("hidden");
    dom.lobbyActionModal.setAttribute("aria-hidden", "true");
    dom.lobbyActionModalInput.value = "";
    dom.lobbyActionModalConfirm.disabled = false;
    dom.lobbyActionModalInputWrap.classList.add("hidden");
  };

  const closeLobbyCreateModal = (): void => {
    dom.lobbyCreateModal.classList.add("hidden");
    dom.lobbyCreateModal.setAttribute("aria-hidden", "true");
    dom.lobbyCreateInput.value = "";
    dom.lobbyCreateButton.disabled = false;
  };

  const openLobbyCreateModal = (): void => {
    dom.lobbyCreateModal.classList.remove("hidden");
    dom.lobbyCreateModal.setAttribute("aria-hidden", "false");
    window.setTimeout(() => {
      dom.lobbyCreateInput.focus();
    }, 0);
  };

  const openRenameLobbyModal = (lobbyId: string): void => {
    const current = availableLobbies.find((lobby) => lobby.id === lobbyId);
    if (!current) {
      return;
    }

    lobbyActionModalState = { mode: "rename", lobbyId };
    dom.lobbyActionModalTitle.textContent = "Lobiyi düzenle";
    dom.lobbyActionModalDescription.textContent =
      "Lobi için yeni adı gir ve kaydet.";
    dom.lobbyActionModalInputWrap.classList.remove("hidden");
    dom.lobbyActionModalInput.value = current.name;
    dom.lobbyActionModalConfirm.textContent = "Kaydet";
    dom.lobbyActionModalConfirm.classList.remove("btn-danger");
    dom.lobbyActionModalConfirm.classList.add("btn-primary");
    dom.lobbyActionModalConfirm.disabled = current.name.trim().length === 0;
    dom.lobbyActionModal.classList.remove("hidden");
    dom.lobbyActionModal.setAttribute("aria-hidden", "false");
    window.setTimeout(() => {
      dom.lobbyActionModalInput.focus();
      dom.lobbyActionModalInput.select();
    }, 0);
  };

  const openDeleteLobbyModal = (lobbyId: string): void => {
    const current = availableLobbies.find((lobby) => lobby.id === lobbyId);
    if (!current) {
      return;
    }

    lobbyActionModalState = { mode: "delete", lobbyId };
    dom.lobbyActionModalTitle.textContent = "Lobiyi sil";
    dom.lobbyActionModalDescription.textContent = `\"${current.name}\" lobisini kalıcı olarak silmek istediğine emin misin?`;
    dom.lobbyActionModalInputWrap.classList.add("hidden");
    dom.lobbyActionModalInput.value = "";
    dom.lobbyActionModalConfirm.textContent = "Sil";
    dom.lobbyActionModalConfirm.classList.remove("btn-primary");
    dom.lobbyActionModalConfirm.classList.add("btn-danger");
    dom.lobbyActionModalConfirm.disabled = false;
    dom.lobbyActionModal.classList.remove("hidden");
    dom.lobbyActionModal.setAttribute("aria-hidden", "false");
    window.setTimeout(() => {
      dom.lobbyActionModalConfirm.focus();
    }, 0);
  };

  lifecycle.on(dom.lobbiesList, "contextmenu", (event) => {
    const mouseEvent = event as MouseEvent;
    const target = mouseEvent.target;
    if (!(target instanceof HTMLElement)) {
      closeLobbyContextMenu();
      return;
    }

    if (target.closest("[data-user-id]")) {
      closeLobbyContextMenu();
      return;
    }

    const trigger = target.closest<HTMLElement>("[data-lobby-id]");
    const lobbyId = trigger?.dataset.lobbyId?.trim();
    if (trigger) {
      mouseEvent.preventDefault();
    }

    if (!lobbyId || lobbyId === runtimeConfig.liveKitDefaultRoom) {
      closeLobbyContextMenu();
      return;
    }

    openLobbyContextMenu(lobbyId, mouseEvent.clientX, mouseEvent.clientY);
  });

  lifecycle.on(dom.lobbyContextRename, "click", () => {
    const lobbyId = lobbyContextMenuLobbyId;
    closeLobbyContextMenu();
    if (!lobbyId) {
      return;
    }

    openRenameLobbyModal(lobbyId);
  });

  lifecycle.on(dom.lobbyContextDelete, "click", () => {
    const lobbyId = lobbyContextMenuLobbyId;
    closeLobbyContextMenu();
    if (!lobbyId) {
      return;
    }

    openDeleteLobbyModal(lobbyId);
  });

  lifecycle.on(dom.lobbyActionModalInput, "input", () => {
    if (lobbyActionModalState?.mode !== "rename") {
      return;
    }

    dom.lobbyActionModalConfirm.disabled =
      dom.lobbyActionModalInput.value.trim().length === 0;
  });

  lifecycle.on(dom.lobbyActionModalCancel, "click", () => {
    closeLobbyActionModal();
  });

  lifecycle.on(dom.lobbyActionModal, "click", (event) => {
    if (event.target === dom.lobbyActionModal) {
      closeLobbyActionModal();
    }
  });

  lifecycle.on(dom.lobbyActionModalConfirm, "click", () => {
    const state = lobbyActionModalState;
    if (!state) {
      return;
    }

    const execute = async (): Promise<void> => {
      dom.lobbyActionModalConfirm.disabled = true;
      try {
        if (state.mode === "rename") {
          const nextName = dom.lobbyActionModalInput.value.trim();
          if (!nextName) {
            return;
          }

          await renameLobbyById(state.lobbyId, nextName);
        } else {
          await deleteLobbyById(state.lobbyId);
        }
      } finally {
        closeLobbyActionModal();
      }
    };

    void execute();
  });

  lifecycle.on(dom.lobbyCreateOpenButton, "click", () => {
    openLobbyCreateModal();
  });

  lifecycle.on(dom.lobbyCreateModalCancel, "click", () => {
    closeLobbyCreateModal();
  });

  lifecycle.on(dom.lobbyCreateModal, "click", (event) => {
    if (event.target === dom.lobbyCreateModal) {
      closeLobbyCreateModal();
    }
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

  const handleQuickConnectionToggle = async (): Promise<void> => {
    if (voiceConnectionInProgress) {
      return;
    }

    if (voiceConnected) {
      await disconnectFromChat();
      await refreshLobby();
      return;
    }

    const connected = await connectToChat();
    if (connected) {
      await refreshLobby();
    }
  };

  dom.quickConnectionToggle.addEventListener("click", () => {
    void handleQuickConnectionToggle();
  });

  dom.lobbyChatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendLobbyChatMessage(dom.lobbyChatInput.value);
  });

  dom.lobbyChatInput.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== "Enter") {
      return;
    }

    if (
      keyboardEvent.shiftKey ||
      keyboardEvent.altKey ||
      keyboardEvent.ctrlKey ||
      keyboardEvent.metaKey ||
      keyboardEvent.isComposing
    ) {
      return;
    }

    keyboardEvent.preventDefault();
    void sendLobbyChatMessage(dom.lobbyChatInput.value);
  });

  dom.lobbiesList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionTrigger = target.closest<HTMLElement>("[data-lobby-action]");
    if (actionTrigger) {
      event.preventDefault();
      event.stopPropagation();
      const lobbyId = actionTrigger.dataset.lobbyId?.trim();
      const action = actionTrigger.dataset.lobbyAction;
      if (!lobbyId || !action) {
        return;
      }

      if (action === "rename") {
        openRenameLobbyModal(lobbyId);
        return;
      }

      if (action === "delete") {
        openDeleteLobbyModal(lobbyId);
        return;
      }
    }

    const trigger = target.closest<HTMLElement>("[data-lobby-id]");
    const lobbyId = trigger?.dataset.lobbyId?.trim();
    if (!lobbyId) {
      return;
    }

    if (lobbyId === activeLobbyId) {
      if (!voiceConnected) {
        void connectToChat();
      }
      return;
    }

    void selectLobbyById(lobbyId, {
      reconnectVoice: voiceConnected,
      connectVoice: true,
    });
  });

  dom.lobbyCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = dom.lobbyCreateInput.value.trim();
    if (!name) {
      return;
    }

    dom.lobbyCreateButton.disabled = true;
    try {
      const result = await window.desktopApi.createLobby({ name });
      if (!result.ok || !result.data) {
        setStatus(
          `Lobi oluşturulamadı: ${getErrorMessage(result.error)}`,
          true,
        );
        return;
      }

      dom.lobbyCreateInput.value = "";
      await loadLobbiesFromBackend(true);
      await selectLobbyById(result.data.lobby.id, {
        reconnectVoice: voiceConnected,
        connectVoice: true,
      });
      closeLobbyCreateModal();
    } finally {
      dom.lobbyCreateButton.disabled = false;
    }
  });

  const handleDirectoryClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const row = target.closest<HTMLElement>("[data-user-id]");
    const userId = row?.dataset.userId?.trim();
    if (!userId) {
      return;
    }

    void selectDirectMessagePeer(userId);
  };

  dom.usersDirectoryList.addEventListener("click", handleDirectoryClick);
  dom.usersSidebarDirectoryList.addEventListener("click", handleDirectoryClick);

  dom.directMessageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendDirectMessage(dom.directMessageInput.value);
  });

  dom.directMessageInput.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== "Enter") {
      return;
    }

    if (
      keyboardEvent.shiftKey ||
      keyboardEvent.altKey ||
      keyboardEvent.ctrlKey ||
      keyboardEvent.metaKey ||
      keyboardEvent.isComposing
    ) {
      return;
    }

    keyboardEvent.preventDefault();
    void sendDirectMessage(dom.directMessageInput.value);
  });

  dom.lobbyChatToggleButton.addEventListener("click", () => {
    toggleLobbyChatPanel();
  });

  dom.lobbyChatReopenButton.addEventListener("click", () => {
    if (!lobbyChatCollapsed) {
      return;
    }

    toggleLobbyChatPanel();
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

  bindParticipantHoverControls();

  lifecycle.on(window, "keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === "Escape") {
      if (participantAudioMenuUserId !== null) {
        closeParticipantAudioMenu();
      }
      if (!dom.lobbyActionModal.classList.contains("hidden")) {
        closeLobbyActionModal();
      }
      if (!dom.lobbyCreateModal.classList.contains("hidden")) {
        closeLobbyCreateModal();
      }
      shareModalController.completeScreenModalSelection(false);
    }
  });

  const handleAuthenticatedSession = async (): Promise<void> => {
    directoryController.startFriendsPresenceAutoRefresh();
    startLobbyMemberSnapshotRefresh();
    await ensureBackgroundRealtimeConnection();

    const activeLobbyResult = await window.desktopApi.getActiveLobby();
    if (activeLobbyResult.ok && activeLobbyResult.data) {
      activeLobbyId = activeLobbyResult.data.lobbyId;
    }

    await loadLobbiesFromBackend(true);
    syncActiveLobbyPresentation();
    await loadProfileFromBackend();
    await directoryController.refreshRegisteredUsers(true);
    await refreshLobby();
    await loadLobbyChatHistory(true);
    renderDirectMessagePanel();
  };

  bindAuthAndProfileForms({
    dom,
    desktopApi,
    setStatus,
    getErrorMessage,
    renderSession: authController.renderSession,
    setSelfUserId: (userId) => {
      selfUserId = userId;
      lobbyChatController.setSelfUserId(userId);
    },
    onSessionAuthenticated: async () => {
      workspaceController.setWorkspacePage("lobby");
      await handleAuthenticatedSession();
    },
    onProfileDisplayNameUpdated: async (displayName) => {
      if (selfUserId) {
        applyLocalDisplayName(selfUserId, displayName);
        renderUserDirectoryWithDmSelection();
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
      cancelPendingShareModalFlow();
      await voiceController.shutdownMedia();
      resetRemoteMediaAnnouncementState();
      stopAllShareTests();
      applyLocalMediaOffState();
      directoryController.stopFriendsPresenceAutoRefresh();
      hasOpenedUsersPageOnce = false;
      stopLobbyMemberSnapshotRefresh();
      stopDirectMessageRefresh();
      authController.renderSession(session);
      selfUserId = null;
      lobbyChatController.setSelfUserId(null);
      displayNameByUserId.clear();
      lobbyController.setDisplayNameMap(displayNameByUserId);
      lobbyChatController.setDisplayNameMap(displayNameByUserId);
      lobbyChatController.clear();
      availableLobbies = [];
      lobbyMembersByLobbyId.clear();
      activeLobbyId = runtimeConfig.liveKitDefaultRoom;
      activeLobbyName = "Ana Lobi";
      syncActiveLobbyPresentation();
      directMessageTargetUserId = null;
      directMessagesById.clear();
      renderDirectMessagePanel();
      directoryController.clearUsers();
      closeParticipantAudioMenu();
      renderUserDirectoryWithDmSelection();
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
      lobbyChatController.setSelfUserId(userId);
    },
    onAuthenticatedSession: handleAuthenticatedSession,
    onUnauthenticatedSession: () => {
      directoryController.stopFriendsPresenceAutoRefresh();
      hasOpenedUsersPageOnce = false;
      stopLobbyMemberSnapshotRefresh();
      stopDirectMessageRefresh();
      lobbyChatController.setSelfUserId(null);
      lobbyChatController.clear();
      availableLobbies = [];
      lobbyMembersByLobbyId.clear();
      activeLobbyId = runtimeConfig.liveKitDefaultRoom;
      activeLobbyName = "Ana Lobi";
      syncActiveLobbyPresentation();
      directMessageTargetUserId = null;
      directMessagesById.clear();
      renderDirectMessagePanel();
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
  syncActiveLobbyPresentation();
  renderDirectMessagePanel();
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
