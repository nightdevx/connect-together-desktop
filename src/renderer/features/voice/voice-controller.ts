import type { RtcSignalPayload } from "../../../shared/contracts";
import {
  RnnoiseWorkletNode,
  loadRnnoise,
} from "@sapphi-red/web-noise-suppressor";
import rnnoiseSimdWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import rnnoiseWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseWorkletPath from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import type { LobbyMemberSnapshot } from "../../types/desktop-api";
import type { DomRefs } from "../../ui/dom";
import {
  enumerateDevicesSafe,
  getDesktopSourceMediaSafe,
  getDisplayMediaSafe,
  getSupportedConstraintsSafe,
  getUserMediaSafe,
  stopMediaStream,
  type VideoCaptureQuality,
} from "./voice-media-utils";
import { createRemoteMediaUiController } from "./voice-remote-media";
import type {
  CameraShareOptions,
  ScreenShareOptions,
} from "./voice-video-share";

interface LiveKitRemoteTrackMeta {
  userId: string;
  kind: "audio" | "video";
  sourceType: "microphone" | "camera" | "screen";
}

type MediaDebugLogLevel = "info" | "warn" | "error";

interface MediaDebugLogPayload {
  timestamp: string;
  level: MediaDebugLogLevel;
  scope: "audio" | "camera" | "screen" | "livekit" | "system";
  event: string;
  message: string;
  details?: Record<string, unknown>;
}

interface LiveKitMediaPolicy {
  qualityProfile: "balanced" | "high" | "low-bandwidth";
  preferredVideoCodec: "vp8" | "h264" | "vp9" | "av1" | "h265";
  backupVideoCodec: "vp8" | "h264";
  cameraMaxBitrate: number;
  cameraMaxFps: number;
  screenMaxBitrate: number;
  screenMaxFps: number;
  simulcast: boolean;
  dynacast: boolean;
}

interface VoiceControllerDeps {
  dom: DomRefs;
  rtcConfig: RTCConfiguration;
  initialRnnoiseEnabled?: boolean;
  initialInputGainPercent?: number;
  setStatus: (message: string, isError: boolean) => void;
  setVoiceState: (message: string, isError: boolean) => void;
  onLocalSpeakingChanged?: (speaking: boolean) => void;
  onSpeakingThresholdChanged?: (payload: {
    mode: "auto" | "manual";
    effectivePercent: number;
  }) => void;
  onInputLevelChanged?: (payload: { levelPercent: number }) => void;
  onCameraShareChanged?: (enabled: boolean) => void;
  onScreenShareChanged?: (enabled: boolean) => void;
  getIsMuted: () => boolean;
  getLiveKitDefaultRoom: () => string;
  getSelfUserId: () => string | null;
  getLobbyMembers: () => Map<string, LobbyMemberSnapshot>;
  resolveMemberName: (userId: string) => string;
  onLiveKitLobbySnapshot?: (members: LobbyMemberSnapshot[]) => void;
  onConnectionMetrics?: (payload: {
    latencyMs: number | null;
    packetLossPercent: number;
    connected: boolean;
  }) => void;
  onMediaDebugLog?: (payload: MediaDebugLogPayload) => void;
}

interface VoiceController {
  listMicrophones: () => Promise<void>;
  setRnnoiseEnabled: (enabled: boolean) => Promise<boolean>;
  setRemoteParticipantAudioState: (
    userId: string,
    payload: { muted?: boolean; volumePercent?: number },
  ) => void;
  getRemoteParticipantAudioState: (userId: string) => {
    muted: boolean;
    volumePercent: number;
  };
  syncMuteState: () => void;
  setSpeakingDetectionMode: (mode: "auto" | "manual") => void;
  setManualSpeakingThreshold: (percent: number) => void;
  setOutputVolume: (volumePercent: number) => void;
  setOutputMuted: (muted: boolean) => void;
  setInputGain: (gainPercent: number) => Promise<void>;
  toggleMicTest: () => Promise<boolean>;
  handleIncomingSignal: (payload: RtcSignalPayload) => Promise<void>;
  onLobbyUpdated: () => Promise<void>;
  onMemberLeft: (userId: string) => void;
  handleProducerAvailable: (payload: {
    userId: string;
    producerId: string;
    kind?: "audio" | "video";
    sourceType?: "microphone" | "camera" | "screen";
  }) => Promise<void>;
  handleProducerClosed: (producerId: string) => void;
  toggleCameraShare: (options?: CameraShareOptions) => Promise<boolean>;
  toggleScreenShare: (options?: ScreenShareOptions) => Promise<boolean>;
  createCameraTestStream: (
    options?: CameraShareOptions,
  ) => Promise<MediaStream>;
  createScreenTestStream: (
    options?: ScreenShareOptions,
  ) => Promise<MediaStream>;
  shutdownMedia: () => Promise<void>;
  startVoice: () => Promise<void>;
  stopVoice: () => Promise<void>;
  handleMicrophoneChange: (deviceId: string) => Promise<void>;
  cleanupForLobbyExit: () => void;
  destroy: () => void;
}

const AUDIO_SAMPLE_RATE = 48000;
const AUDIO_SAMPLE_SIZE = 16;
const AUDIO_CAPTURE_LATENCY_SECONDS = 0.02;
const AUDIO_HIGH_PASS_HZ = 70;
const AUDIO_COMPRESSOR_THRESHOLD_DB = -20;
const AUDIO_COMPRESSOR_KNEE_DB = 6;
const AUDIO_COMPRESSOR_RATIO = 2;
const AUDIO_COMPRESSOR_ATTACK_SECONDS = 0.003;
const AUDIO_COMPRESSOR_RELEASE_SECONDS = 0.14;
const SPEAKING_HANGOVER_MS = 220;
const SPEAKING_HYSTERESIS_RATIO = 0.72;
const MANUAL_THRESHOLD_MIN = 0.008;
const MANUAL_THRESHOLD_MAX = 0.07;
const AUTO_THRESHOLD_MIN = 0.01;
const AUTO_THRESHOLD_MAX = 0.06;
const AUTO_NOISE_FLOOR_MIN = 0.003;
const AUTO_NOISE_FLOOR_MAX = 0.04;
const AUTO_MARGIN_MIN = 0.0045;
const THRESHOLD_REPORT_INTERVAL_MS = 250;
const INPUT_LEVEL_REPORT_INTERVAL_MS = 40;
const LIVEKIT_METRICS_INTERVAL_MS = 3000;
const LIVEKIT_VIDEO_SENDER_STATS_INTERVAL_MS = 5000;
const LIVEKIT_PROBE_HISTORY_SIZE = 20;
const INPUT_GAIN_MIN_PERCENT = 0;
const INPUT_GAIN_MAX_PERCENT = 200;
const CAMERA_CAPTURE_DEFAULT_QUALITY: VideoCaptureQuality = {
  width: 1280,
  height: 720,
  fps: 30,
};
const SCREEN_CAPTURE_DEFAULT_QUALITY: VideoCaptureQuality = {
  width: 1920,
  height: 1080,
  fps: 30,
};
const CAMERA_CAPTURE_MIN_QUALITY: VideoCaptureQuality = {
  width: 640,
  height: 360,
  fps: 15,
};
const SCREEN_CAPTURE_MIN_QUALITY: VideoCaptureQuality = {
  width: 960,
  height: 540,
  fps: 15,
};
const CAMERA_CAPTURE_MAX_QUALITY: VideoCaptureQuality = {
  width: 1920,
  height: 1080,
  fps: 60,
};
const SCREEN_CAPTURE_MAX_QUALITY: VideoCaptureQuality = {
  width: 2560,
  height: 1440,
  fps: 60,
};

const DEFAULT_LIVEKIT_MEDIA_POLICY: LiveKitMediaPolicy = {
  qualityProfile: "balanced",
  preferredVideoCodec: "vp9",
  backupVideoCodec: "h264",
  cameraMaxBitrate: 1_500_000,
  cameraMaxFps: 30,
  screenMaxBitrate: 3_800_000,
  screenMaxFps: 30,
  simulcast: true,
  dynacast: true,
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const toFiniteNumber = (value: number, fallback: number): number => {
  return Number.isFinite(value) ? value : fallback;
};

const clampInputGainPercent = (value: number): number => {
  return Math.round(
    clamp(value, INPUT_GAIN_MIN_PERCENT, INPUT_GAIN_MAX_PERCENT),
  );
};

const inputGainPercentToMultiplier = (value: number): number => {
  return clampInputGainPercent(value) / 100;
};

const normalizeVideoQuality = (
  quality: VideoCaptureQuality,
  min: VideoCaptureQuality,
  max: VideoCaptureQuality,
  fallback: VideoCaptureQuality,
): VideoCaptureQuality => {
  const width = clamp(
    Math.round(toFiniteNumber(quality.width, fallback.width)),
    min.width,
    max.width,
  );
  const height = clamp(
    Math.round(toFiniteNumber(quality.height, fallback.height)),
    min.height,
    max.height,
  );
  const fps = clamp(
    Math.round(toFiniteNumber(quality.fps, fallback.fps)),
    min.fps,
    max.fps,
  );

  return {
    width,
    height,
    fps,
  };
};

const buildUniqueQualityChain = (
  candidates: VideoCaptureQuality[],
): VideoCaptureQuality[] => {
  const seen = new Set<string>();
  return candidates.filter((quality) => {
    const key = `${quality.width}x${quality.height}@${quality.fps}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const buildCameraQualityFallbackChain = (
  requested: VideoCaptureQuality,
): VideoCaptureQuality[] => {
  const normalizedRequested = normalizeVideoQuality(
    requested,
    CAMERA_CAPTURE_MIN_QUALITY,
    CAMERA_CAPTURE_MAX_QUALITY,
    CAMERA_CAPTURE_DEFAULT_QUALITY,
  );

  return buildUniqueQualityChain([
    normalizedRequested,
    { width: 1920, height: 1080, fps: 30 },
    { width: 1280, height: 720, fps: 30 },
    { width: 960, height: 540, fps: 24 },
    { width: 640, height: 360, fps: 20 },
  ]);
};

const buildScreenQualityFallbackChain = (
  requested: VideoCaptureQuality,
): VideoCaptureQuality[] => {
  const normalizedRequested = normalizeVideoQuality(
    requested,
    SCREEN_CAPTURE_MIN_QUALITY,
    SCREEN_CAPTURE_MAX_QUALITY,
    SCREEN_CAPTURE_DEFAULT_QUALITY,
  );

  return buildUniqueQualityChain([
    normalizedRequested,
    { width: 2560, height: 1440, fps: 30 },
    { width: 1920, height: 1080, fps: 30 },
    { width: 1600, height: 900, fps: 24 },
    { width: 1280, height: 720, fps: 20 },
  ]);
};

const formatQualityLabel = (quality: VideoCaptureQuality): string => {
  return `${quality.width}x${quality.height} @ ${quality.fps}fps`;
};

const isWindowCaptureSource = (sourceId?: string): boolean => {
  return sourceId?.startsWith("window:") === true;
};

const applyScreenSourceStabilityCaps = (
  requestedQuality: VideoCaptureQuality,
  sourceId?: string,
): { quality: VideoCaptureQuality; capped: boolean } => {
  if (!isWindowCaptureSource(sourceId)) {
    return {
      quality: requestedQuality,
      capped: false,
    };
  }

  const cappedQuality: VideoCaptureQuality = {
    width: Math.min(requestedQuality.width, 1920),
    height: Math.min(requestedQuality.height, 1080),
    fps: Math.min(requestedQuality.fps, 30),
  };

  const capped =
    cappedQuality.width !== requestedQuality.width ||
    cappedQuality.height !== requestedQuality.height ||
    cappedQuality.fps !== requestedQuality.fps;

  return {
    quality: cappedQuality,
    capped,
  };
};

const applyTrackContentHint = (
  track: MediaStreamTrack | undefined,
  hint: "motion" | "detail",
): void => {
  if (!track) {
    return;
  }

  try {
    track.contentHint = hint;
  } catch {
    // no-op
  }
};

const getTrackSettingsSize = (
  track: MediaStreamTrack,
): { width: number; height: number; fps: number } => {
  const settings = track.getSettings();
  const width = Math.max(
    640,
    Math.round(toFiniteNumber(settings.width ?? 1280, 1280)),
  );
  const height = Math.max(
    360,
    Math.round(toFiniteNumber(settings.height ?? 720, 720)),
  );
  const fps = Math.max(
    15,
    Math.round(toFiniteNumber(settings.frameRate ?? 30, 30)),
  );

  return {
    width,
    height,
    fps,
  };
};

const resolveCameraMaxBitrate = (track: MediaStreamTrack): number => {
  const settings = getTrackSettingsSize(track);
  const complexity = settings.width * settings.height * settings.fps;

  if (complexity >= 1920 * 1080 * 30) {
    return 2_400_000;
  }
  if (complexity >= 1280 * 720 * 30) {
    return 1_200_000;
  }
  if (complexity >= 960 * 540 * 24) {
    return 800_000;
  }

  return 450_000;
};

const resolveScreenMaxBitrate = (track: MediaStreamTrack): number => {
  const settings = getTrackSettingsSize(track);
  const complexity = settings.width * settings.height * settings.fps;

  if (complexity >= 2560 * 1440 * 30) {
    return 6_000_000;
  }
  if (complexity >= 1920 * 1080 * 30) {
    return 3_800_000;
  }
  if (complexity >= 1920 * 1080 * 15) {
    return 2_600_000;
  }
  if (complexity >= 1280 * 720 * 20) {
    return 1_800_000;
  }

  return 1_000_000;
};

const normalizeLiveKitMediaPolicy = (
  rawPolicy: unknown,
): LiveKitMediaPolicy => {
  if (!rawPolicy || typeof rawPolicy !== "object") {
    return DEFAULT_LIVEKIT_MEDIA_POLICY;
  }

  const source = rawPolicy as Record<string, unknown>;
  const qualityProfileRaw = String(
    source.qualityProfile ?? DEFAULT_LIVEKIT_MEDIA_POLICY.qualityProfile,
  ).toLowerCase();
  const preferredVideoCodecRaw = String(
    source.preferredVideoCodec ??
      DEFAULT_LIVEKIT_MEDIA_POLICY.preferredVideoCodec,
  ).toLowerCase();
  const backupVideoCodecRaw = String(
    source.backupVideoCodec ?? DEFAULT_LIVEKIT_MEDIA_POLICY.backupVideoCodec,
  ).toLowerCase();

  const preferredVideoCodec =
    preferredVideoCodecRaw === "vp8" ||
    preferredVideoCodecRaw === "h264" ||
    preferredVideoCodecRaw === "vp9" ||
    preferredVideoCodecRaw === "av1" ||
    preferredVideoCodecRaw === "h265"
      ? preferredVideoCodecRaw
      : DEFAULT_LIVEKIT_MEDIA_POLICY.preferredVideoCodec;

  const backupVideoCodec =
    backupVideoCodecRaw === "vp8" || backupVideoCodecRaw === "h264"
      ? backupVideoCodecRaw
      : DEFAULT_LIVEKIT_MEDIA_POLICY.backupVideoCodec;

  const qualityProfile =
    qualityProfileRaw === "high" || qualityProfileRaw === "low-bandwidth"
      ? qualityProfileRaw
      : DEFAULT_LIVEKIT_MEDIA_POLICY.qualityProfile;

  const cameraMaxBitrate = Math.max(
    100_000,
    Math.round(
      toFiniteNumber(
        Number(source.cameraMaxBitrate),
        DEFAULT_LIVEKIT_MEDIA_POLICY.cameraMaxBitrate,
      ),
    ),
  );
  const cameraMaxFps = Math.round(
    clamp(
      toFiniteNumber(
        Number(source.cameraMaxFps),
        DEFAULT_LIVEKIT_MEDIA_POLICY.cameraMaxFps,
      ),
      5,
      60,
    ),
  );
  const screenMaxBitrate = Math.max(
    100_000,
    Math.round(
      toFiniteNumber(
        Number(source.screenMaxBitrate),
        DEFAULT_LIVEKIT_MEDIA_POLICY.screenMaxBitrate,
      ),
    ),
  );
  const screenMaxFps = Math.round(
    clamp(
      toFiniteNumber(
        Number(source.screenMaxFps),
        DEFAULT_LIVEKIT_MEDIA_POLICY.screenMaxFps,
      ),
      5,
      60,
    ),
  );

  return {
    qualityProfile,
    preferredVideoCodec,
    backupVideoCodec,
    cameraMaxBitrate,
    cameraMaxFps,
    screenMaxBitrate,
    screenMaxFps,
    simulcast:
      typeof source.simulcast === "boolean"
        ? source.simulcast
        : DEFAULT_LIVEKIT_MEDIA_POLICY.simulcast,
    dynacast:
      typeof source.dynacast === "boolean"
        ? source.dynacast
        : DEFAULT_LIVEKIT_MEDIA_POLICY.dynacast,
  };
};

const manualPercentToThreshold = (percent: number): number => {
  const normalized = clamp(percent, 1, 100) / 100;
  return (
    MANUAL_THRESHOLD_MIN +
    normalized * (MANUAL_THRESHOLD_MAX - MANUAL_THRESHOLD_MIN)
  );
};

const thresholdToManualPercent = (threshold: number): number => {
  const normalized =
    (clamp(threshold, MANUAL_THRESHOLD_MIN, MANUAL_THRESHOLD_MAX) -
      MANUAL_THRESHOLD_MIN) /
    (MANUAL_THRESHOLD_MAX - MANUAL_THRESHOLD_MIN);
  return Math.round(normalized * 100);
};

const getErrorMessage = (error?: { message?: string }): string => {
  return error?.message ?? "bilinmeyen hata";
};

const getUnknownErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "bilinmeyen hata";
};

export const createVoiceController = (
  deps: VoiceControllerDeps,
): VoiceController => {
  type SpeakingDetectionMode = "auto" | "manual";

  let selectedMicrophoneId = "default";

  let liveKitSdk: any | null = null;
  let liveKitRoom: any | null = null;

  let rnnoiseEnabled = deps.initialRnnoiseEnabled ?? true;
  let rnnoiseWasmBinary: ArrayBuffer | null = null;

  let localCapturedAudioStream: MediaStream | null = null;
  let localAudioStream: MediaStream | null = null;
  let localAudioOwnsCapturedStream = false;

  let rnnoiseAudioContext: AudioContext | null = null;
  let rnnoiseSourceNode: MediaStreamAudioSourceNode | null = null;
  let rnnoiseHighPassNode: BiquadFilterNode | null = null;
  let rnnoiseNode: RnnoiseWorkletNode | null = null;
  let rnnoiseCompressorNode: DynamicsCompressorNode | null = null;
  let rnnoiseInputGainNode: GainNode | null = null;
  let rnnoiseDestinationNode: MediaStreamAudioDestinationNode | null = null;

  let inputGainPercent = clampInputGainPercent(
    deps.initialInputGainPercent ?? 100,
  );

  let localLiveKitAudioTrack: MediaStreamTrack | null = null;
  let localLiveKitAudioPublication: any | null = null;

  let localLiveKitCameraPublication: any | null = null;
  let localLiveKitCameraStream: MediaStream | null = null;
  let pendingLiveKitCameraStream: MediaStream | null = null;

  let localLiveKitScreenPublication: any | null = null;
  let localLiveKitScreenStream: MediaStream | null = null;
  let pendingLiveKitScreenStream: MediaStream | null = null;
  let liveKitMediaPolicy: LiveKitMediaPolicy = DEFAULT_LIVEKIT_MEDIA_POLICY;
  let liveKitCameraStatsTimer: number | null = null;
  let liveKitScreenStatsTimer: number | null = null;

  let mediaOperationVersion = 0;

  const remoteMediaUi = createRemoteMediaUiController({
    dom: deps.dom,
    resolveMemberName: deps.resolveMemberName,
  });

  const liveKitTrackKeyBySid = new Map<string, string>();
  const liveKitTrackMetaByKey = new Map<string, LiveKitRemoteTrackMeta>();
  const liveKitTrackKeysByParticipant = new Map<string, Set<string>>();
  const liveKitJoinedAtByUserId = new Map<string, string>();
  const liveKitProbeHistory: boolean[] = [];

  let liveKitProbeUrl: string | null = null;
  let liveKitMetricsTimer: number | null = null;

  let outputVolumeLevel = Math.max(
    0,
    Math.min(1, Number(deps.dom.outputVolume.value || "100") / 100),
  );
  let outputMuted = false;

  let micTestAudio: HTMLAudioElement | null = null;
  let micTestStream: MediaStream | null = null;
  let micTestOwnsStream = false;
  let micTestActive = false;

  let speakingAudioContext: AudioContext | null = null;
  let speakingAnalyser: AnalyserNode | null = null;
  let speakingSourceNode: MediaStreamAudioSourceNode | null = null;
  let speakingData: Uint8Array<ArrayBuffer> | null = null;
  let speakingAnimationFrame: number | null = null;
  let speakingLastActiveAt = 0;
  let localSpeaking = false;

  let speakingDetectionMode: SpeakingDetectionMode = "auto";
  let manualSpeakingThresholdPercent = 24;
  let effectiveSpeakingThreshold = manualPercentToThreshold(
    manualSpeakingThresholdPercent,
  );
  let smoothedRms = 0;
  let autoNoiseFloor = AUTO_NOISE_FLOOR_MIN;
  let autoSignalPeak = effectiveSpeakingThreshold;
  let lastThresholdReportAt = 0;
  let lastThresholdReportPercent = -1;
  let lastInputLevelReportAt = 0;
  let lastInputLevelPercent = -1;

  const emitMediaDebugLog = (
    level: MediaDebugLogLevel,
    scope: MediaDebugLogPayload["scope"],
    event: string,
    message: string,
    details?: Record<string, unknown>,
  ): void => {
    const payload: MediaDebugLogPayload = {
      timestamp: new Date().toISOString(),
      level,
      scope,
      event,
      message,
      ...(details ? { details } : {}),
    };

    deps.onMediaDebugLog?.(payload);

    const logData = {
      scope,
      event,
      message,
      ...(details ? { details } : {}),
    };

    if (level === "error") {
      console.error("[media-debug]", logData);
      return;
    }

    if (level === "warn") {
      console.warn("[media-debug]", logData);
      return;
    }

    console.info("[media-debug]", logData);
  };

  const reportEffectiveThreshold = (force = false): void => {
    const now = performance.now();
    const effectivePercent = thresholdToManualPercent(
      effectiveSpeakingThreshold,
    );

    if (
      !force &&
      now - lastThresholdReportAt < THRESHOLD_REPORT_INTERVAL_MS &&
      Math.abs(effectivePercent - lastThresholdReportPercent) < 1
    ) {
      return;
    }

    lastThresholdReportAt = now;
    lastThresholdReportPercent = effectivePercent;
    deps.onSpeakingThresholdChanged?.({
      mode: speakingDetectionMode,
      effectivePercent,
    });
  };

  const rmsToDisplayPercent = (rms: number, threshold: number): number => {
    const scaleDenominator = Math.max(0.03, threshold * 2.2);
    const normalized = clamp(rms / scaleDenominator, 0, 1);
    return Math.round(Math.pow(normalized, 0.72) * 100);
  };

  const reportInputLevel = (levelPercent: number, force = false): void => {
    const rounded = Math.round(clamp(levelPercent, 0, 100));
    const now = performance.now();

    if (
      !force &&
      now - lastInputLevelReportAt < INPUT_LEVEL_REPORT_INTERVAL_MS &&
      Math.abs(rounded - lastInputLevelPercent) < 1
    ) {
      return;
    }

    lastInputLevelReportAt = now;
    lastInputLevelPercent = rounded;
    deps.onInputLevelChanged?.({ levelPercent: rounded });
  };

  const resetAutoThresholdModel = (): void => {
    smoothedRms = 0;
    autoNoiseFloor = AUTO_NOISE_FLOOR_MIN;
    autoSignalPeak = Math.max(
      AUTO_THRESHOLD_MIN,
      manualPercentToThreshold(manualSpeakingThresholdPercent),
    );
  };

  const setSpeakingDetectionMode = (mode: SpeakingDetectionMode): void => {
    speakingDetectionMode = mode;
    if (mode === "manual") {
      effectiveSpeakingThreshold = manualPercentToThreshold(
        manualSpeakingThresholdPercent,
      );
    } else {
      resetAutoThresholdModel();
      effectiveSpeakingThreshold = AUTO_THRESHOLD_MIN;
    }

    reportEffectiveThreshold(true);
  };

  const setManualSpeakingThreshold = (percent: number): void => {
    manualSpeakingThresholdPercent = Math.round(clamp(percent, 1, 100));
    if (speakingDetectionMode === "manual") {
      effectiveSpeakingThreshold = manualPercentToThreshold(
        manualSpeakingThresholdPercent,
      );
      reportEffectiveThreshold(true);
    }
  };

  const emitLocalSpeaking = (nextValue: boolean): void => {
    if (localSpeaking === nextValue) {
      return;
    }

    localSpeaking = nextValue;
    deps.onLocalSpeakingChanged?.(nextValue);
  };

  const stopSpeakingDetection = (): void => {
    if (speakingAnimationFrame !== null) {
      cancelAnimationFrame(speakingAnimationFrame);
      speakingAnimationFrame = null;
    }

    try {
      speakingSourceNode?.disconnect();
    } catch {
      // no-op
    }

    try {
      speakingAnalyser?.disconnect();
    } catch {
      // no-op
    }

    if (speakingAudioContext) {
      void speakingAudioContext.close().catch(() => {
        // no-op
      });
    }

    speakingAudioContext = null;
    speakingAnalyser = null;
    speakingSourceNode = null;
    speakingData = null;
    speakingLastActiveAt = 0;
    smoothedRms = 0;
    autoNoiseFloor = AUTO_NOISE_FLOOR_MIN;
    autoSignalPeak = effectiveSpeakingThreshold;
    emitLocalSpeaking(false);
    reportInputLevel(0, true);
  };

  const computeEffectiveThreshold = (rms: number): number => {
    if (speakingDetectionMode === "manual") {
      return manualPercentToThreshold(manualSpeakingThresholdPercent);
    }

    const noiseFollowFactor = localSpeaking ? 0.018 : 0.08;
    autoNoiseFloor = clamp(
      autoNoiseFloor * (1 - noiseFollowFactor) + rms * noiseFollowFactor,
      AUTO_NOISE_FLOOR_MIN,
      AUTO_NOISE_FLOOR_MAX,
    );

    autoSignalPeak = Math.max(rms, autoSignalPeak * 0.992);
    const dynamicMargin = Math.max(
      AUTO_MARGIN_MIN,
      (autoSignalPeak - autoNoiseFloor) * 0.3,
    );

    return clamp(
      autoNoiseFloor + dynamicMargin,
      AUTO_THRESHOLD_MIN,
      AUTO_THRESHOLD_MAX,
    );
  };

  const startSpeakingDetection = (stream: MediaStream): void => {
    const track = stream.getAudioTracks()[0];
    if (!track) {
      stopSpeakingDetection();
      return;
    }

    stopSpeakingDetection();

    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextCtor) {
      return;
    }

    try {
      speakingAudioContext = new AudioContextCtor({
        latencyHint: "interactive",
      });
      speakingAnalyser = speakingAudioContext.createAnalyser();
      speakingAnalyser.fftSize = 512;
      speakingData = new Uint8Array(speakingAnalyser.fftSize);
      speakingSourceNode = speakingAudioContext.createMediaStreamSource(stream);
      speakingSourceNode.connect(speakingAnalyser);

      const loop = (): void => {
        if (!speakingAnalyser || !speakingData) {
          emitLocalSpeaking(false);
          return;
        }

        speakingAnalyser.getByteTimeDomainData(speakingData);

        let sumSquares = 0;
        for (const sample of speakingData) {
          const normalized = (sample - 128) / 128;
          sumSquares += normalized * normalized;
        }

        const rms = Math.sqrt(sumSquares / speakingData.length);
        smoothedRms = smoothedRms === 0 ? rms : smoothedRms * 0.82 + rms * 0.18;
        effectiveSpeakingThreshold = computeEffectiveThreshold(smoothedRms);
        reportEffectiveThreshold();
        reportInputLevel(
          rmsToDisplayPercent(smoothedRms, effectiveSpeakingThreshold),
        );

        const detectionThreshold = localSpeaking
          ? Math.max(
              AUTO_NOISE_FLOOR_MIN,
              effectiveSpeakingThreshold * SPEAKING_HYSTERESIS_RATIO,
            )
          : effectiveSpeakingThreshold;

        const now = performance.now();
        if (smoothedRms >= detectionThreshold) {
          speakingLastActiveAt = now;
        }

        const isSpeakingNow =
          !deps.getIsMuted() &&
          now - speakingLastActiveAt <= SPEAKING_HANGOVER_MS;

        emitLocalSpeaking(isSpeakingNow);
        speakingAnimationFrame = requestAnimationFrame(loop);
      };

      speakingAnimationFrame = requestAnimationFrame(loop);
    } catch {
      stopSpeakingDetection();
    }
  };

  const buildAudioConstraints = (): MediaTrackConstraints => {
    const supported = getSupportedConstraintsSafe();
    const audioConstraints: MediaTrackConstraints = {};
    const supportedRecord = supported as Record<string, unknown>;
    const extendedConstraints = audioConstraints as Record<string, unknown>;

    if (supported.echoCancellation) {
      audioConstraints.echoCancellation = { ideal: true };
    }

    if (supported.noiseSuppression) {
      audioConstraints.noiseSuppression = { ideal: !rnnoiseEnabled };
    }

    if (supported.autoGainControl) {
      audioConstraints.autoGainControl = { ideal: false };
    }

    if (supported.sampleRate) {
      audioConstraints.sampleRate = { ideal: AUDIO_SAMPLE_RATE };
    }

    if (supported.sampleSize) {
      audioConstraints.sampleSize = { ideal: AUDIO_SAMPLE_SIZE };
    }

    if (supported.channelCount) {
      audioConstraints.channelCount = { ideal: 1 };
    }

    if (supportedRecord.latency) {
      extendedConstraints.latency = { ideal: AUDIO_CAPTURE_LATENCY_SECONDS };
    }

    if (supportedRecord.voiceIsolation) {
      extendedConstraints.voiceIsolation = !rnnoiseEnabled;
    }

    if (selectedMicrophoneId && selectedMicrophoneId !== "default") {
      audioConstraints.deviceId = { exact: selectedMicrophoneId };
    }

    return audioConstraints;
  };

  const applySpeechTrackDefaults = (stream: MediaStream): void => {
    for (const track of stream.getAudioTracks()) {
      track.enabled = !deps.getIsMuted();
      try {
        track.contentHint = "speech";
      } catch {
        // no-op
      }
    }
  };

  const applyInputGainNodeValue = (): void => {
    if (!rnnoiseInputGainNode || !rnnoiseAudioContext) {
      return;
    }

    const multiplier = inputGainPercentToMultiplier(inputGainPercent);
    try {
      rnnoiseInputGainNode.gain.cancelScheduledValues(
        rnnoiseAudioContext.currentTime,
      );
      rnnoiseInputGainNode.gain.setTargetAtTime(
        multiplier,
        rnnoiseAudioContext.currentTime,
        0.018,
      );
    } catch {
      rnnoiseInputGainNode.gain.value = multiplier;
    }
  };

  const destroyRnnoisePipeline = (): void => {
    try {
      rnnoiseSourceNode?.disconnect();
    } catch {
      // no-op
    }

    try {
      rnnoiseHighPassNode?.disconnect();
    } catch {
      // no-op
    }

    try {
      rnnoiseNode?.destroy();
    } catch {
      // no-op
    }

    try {
      rnnoiseCompressorNode?.disconnect();
    } catch {
      // no-op
    }

    try {
      rnnoiseInputGainNode?.disconnect();
    } catch {
      // no-op
    }

    if (rnnoiseAudioContext) {
      void rnnoiseAudioContext.close().catch(() => {
        // no-op
      });
    }

    rnnoiseSourceNode = null;
    rnnoiseHighPassNode = null;
    rnnoiseNode = null;
    rnnoiseCompressorNode = null;
    rnnoiseInputGainNode = null;
    rnnoiseDestinationNode = null;
    rnnoiseAudioContext = null;
  };

  const createProcessedAudioStream = async (
    capturedStream: MediaStream,
  ): Promise<MediaStream> => {
    if (!rnnoiseEnabled && inputGainPercent === 100) {
      return capturedStream;
    }

    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextCtor) {
      throw new Error("RNNoise için AudioContext desteği bulunamadı");
    }

    const context = new AudioContextCtor({
      sampleRate: AUDIO_SAMPLE_RATE,
      latencyHint: "interactive",
    });

    try {
      const source = context.createMediaStreamSource(capturedStream);
      const gainNode = context.createGain();
      gainNode.gain.value = inputGainPercentToMultiplier(inputGainPercent);

      const destination = context.createMediaStreamDestination();
      let highPass: BiquadFilterNode | null = null;
      let rnnoise: RnnoiseWorkletNode | null = null;
      let compressor: DynamicsCompressorNode | null = null;

      if (rnnoiseEnabled) {
        await context.audioWorklet.addModule(rnnoiseWorkletPath);
        if (!rnnoiseWasmBinary) {
          rnnoiseWasmBinary = await loadRnnoise({
            url: rnnoiseWasmPath,
            simdUrl: rnnoiseSimdWasmPath,
          });
        }
        const wasmBinary = rnnoiseWasmBinary;
        if (!wasmBinary) {
          throw new Error("RNNoise modeli yüklenemedi");
        }

        highPass = context.createBiquadFilter();
        highPass.type = "highpass";
        highPass.frequency.value = AUDIO_HIGH_PASS_HZ;
        highPass.Q.value = 0.707;

        rnnoise = new RnnoiseWorkletNode(context, {
          maxChannels: 1,
          wasmBinary: wasmBinary.slice(0),
        });

        compressor = context.createDynamicsCompressor();
        compressor.threshold.value = AUDIO_COMPRESSOR_THRESHOLD_DB;
        compressor.knee.value = AUDIO_COMPRESSOR_KNEE_DB;
        compressor.ratio.value = AUDIO_COMPRESSOR_RATIO;
        compressor.attack.value = AUDIO_COMPRESSOR_ATTACK_SECONDS;
        compressor.release.value = AUDIO_COMPRESSOR_RELEASE_SECONDS;

        source.connect(highPass);
        highPass.connect(rnnoise);
        rnnoise.connect(compressor);
        compressor.connect(gainNode);
      } else {
        source.connect(gainNode);
      }

      gainNode.connect(destination);

      if (context.state === "suspended") {
        await context.resume().catch(() => {
          // no-op
        });
      }

      const processedTrack = destination.stream.getAudioTracks()[0];
      if (!processedTrack) {
        throw new Error("RNNoise çıkış izi oluşturulamadı");
      }

      rnnoiseAudioContext = context;
      rnnoiseSourceNode = source;
      rnnoiseHighPassNode = highPass;
      rnnoiseNode = rnnoise;
      rnnoiseCompressorNode = compressor;
      rnnoiseInputGainNode = gainNode;
      rnnoiseDestinationNode = destination;

      return new MediaStream([processedTrack]);
    } catch (error) {
      void context.close().catch(() => {
        // no-op
      });
      throw error;
    }
  };

  const rebuildLocalAudioPipeline = async (): Promise<void> => {
    if (!localCapturedAudioStream) {
      return;
    }

    const shouldResumeMicTest = micTestActive && !micTestOwnsStream;
    if (shouldResumeMicTest) {
      stopMicTest();
    }

    stopSpeakingDetection();

    if (localAudioStream && localAudioStream !== localCapturedAudioStream) {
      stopMediaStream(localAudioStream);
    }
    localAudioStream = null;

    destroyRnnoisePipeline();

    localAudioStream = await createProcessedAudioStream(
      localCapturedAudioStream,
    );
    applySpeechTrackDefaults(localAudioStream);
    startSpeakingDetection(localAudioStream);

    if (liveKitRoom) {
      await publishLiveKitMicrophone(liveKitRoom);
    }

    if (shouldResumeMicTest) {
      await toggleMicTest();
    }
  };

  const ensureLocalAudioStream = async (): Promise<MediaStream> => {
    if (localAudioStream) {
      return localAudioStream;
    }

    localCapturedAudioStream = await getUserMediaSafe({
      audio: buildAudioConstraints(),
      video: false,
    });
    localAudioOwnsCapturedStream = true;

    try {
      localAudioStream = await createProcessedAudioStream(
        localCapturedAudioStream,
      );
      applySpeechTrackDefaults(localAudioStream);

      startSpeakingDetection(localAudioStream);
      deps.setVoiceState(
        rnnoiseEnabled
          ? "Mikrofon aktif (RNNoise profesyonel filtre)"
          : "Mikrofon aktif",
        false,
      );
      await listMicrophones();
      return localAudioStream;
    } catch (error) {
      stopSpeakingDetection();
      stopMediaStream(localCapturedAudioStream);
      localCapturedAudioStream = null;
      localAudioStream = null;
      localAudioOwnsCapturedStream = false;
      destroyRnnoisePipeline();
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Mikrofon hattı başlatılamadı");
    }
  };

  const setRnnoiseEnabled = async (enabled: boolean): Promise<boolean> => {
    if (rnnoiseEnabled === enabled) {
      return rnnoiseEnabled;
    }

    const previous = rnnoiseEnabled;
    rnnoiseEnabled = enabled;

    if (!localAudioStream) {
      return rnnoiseEnabled;
    }

    try {
      await rebuildLocalAudioPipeline();
      deps.setVoiceState(
        rnnoiseEnabled
          ? "RNNoise gürültü engelleme aktif"
          : "RNNoise kapalı (sistem filtreleri aktif)",
        false,
      );
      return rnnoiseEnabled;
    } catch (error) {
      rnnoiseEnabled = previous;
      await rebuildLocalAudioPipeline();
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("RNNoise pipeline yeniden başlatılamadı");
    }
  };

  const stopLocalAudioStream = (): void => {
    stopSpeakingDetection();

    if (localAudioStream && localAudioStream !== localCapturedAudioStream) {
      stopMediaStream(localAudioStream);
    }

    if (localAudioOwnsCapturedStream) {
      stopMediaStream(localCapturedAudioStream);
    }

    localAudioStream = null;
    localCapturedAudioStream = null;
    localAudioOwnsCapturedStream = false;
    destroyRnnoisePipeline();

    if (micTestActive && !micTestOwnsStream) {
      stopMicTest();
    }
  };

  const createCameraCaptureStream = async (
    options?: CameraShareOptions,
  ): Promise<MediaStream> => {
    const requestedQuality = options?.quality ?? CAMERA_CAPTURE_DEFAULT_QUALITY;
    const qualityChain = buildCameraQualityFallbackChain(requestedQuality);

    emitMediaDebugLog(
      "info",
      "camera",
      "capture-start",
      "Kamera yakalama başlatıldı",
      {
        requestedQuality,
        qualityChain: qualityChain.map(formatQualityLabel),
      },
    );

    let lastError: unknown = null;
    for (const [index, quality] of qualityChain.entries()) {
      emitMediaDebugLog(
        "info",
        "camera",
        "capture-attempt",
        "Kamera yakalama profili deneniyor",
        {
          attempt: index + 1,
          quality,
        },
      );

      try {
        const toleratedWidth = Math.round(
          clamp(
            quality.width * 1.2,
            quality.width,
            CAMERA_CAPTURE_MAX_QUALITY.width,
          ),
        );
        const toleratedHeight = Math.round(
          clamp(
            quality.height * 1.2,
            quality.height,
            CAMERA_CAPTURE_MAX_QUALITY.height,
          ),
        );
        const toleratedFps = Math.round(
          clamp(quality.fps + 5, quality.fps, CAMERA_CAPTURE_MAX_QUALITY.fps),
        );

        const stream = await getUserMediaSafe({
          video: {
            width: {
              ideal: quality.width,
              max: toleratedWidth,
              min: CAMERA_CAPTURE_MIN_QUALITY.width,
            },
            height: {
              ideal: quality.height,
              max: toleratedHeight,
              min: CAMERA_CAPTURE_MIN_QUALITY.height,
            },
            frameRate: {
              ideal: quality.fps,
              max: toleratedFps,
              min: CAMERA_CAPTURE_MIN_QUALITY.fps,
            },
          },
          audio: false,
        });

        const videoTrack = stream.getVideoTracks()[0];
        applyTrackContentHint(videoTrack, "motion");

        const actualQuality = videoTrack
          ? getTrackSettingsSize(videoTrack)
          : undefined;
        emitMediaDebugLog(
          index > 0 ? "warn" : "info",
          "camera",
          "capture-success",
          "Kamera yakalama başarılı",
          {
            attempt: index + 1,
            requestedQuality: quality,
            actualQuality,
            fallbackApplied: index > 0,
          },
        );

        if (index > 0) {
          deps.setVoiceState(
            `Kamera stabil kalite profiline alındı (${formatQualityLabel(quality)})`,
            false,
          );
        }

        return stream;
      } catch (error) {
        lastError = error;
        emitMediaDebugLog(
          "warn",
          "camera",
          "capture-attempt-failed",
          "Kamera yakalama denemesi başarısız",
          {
            attempt: index + 1,
            quality,
            error: getUnknownErrorMessage(error),
          },
        );
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : "bilinmeyen hata";
    emitMediaDebugLog(
      "error",
      "camera",
      "capture-failed",
      "Kamera yakalama tüm profillerde başarısız oldu",
      {
        requestedQuality,
        qualityChain: qualityChain.map(formatQualityLabel),
        error: message,
      },
    );

    throw new Error(
      `Kamera başlatılamadı (${message}). Çözünürlük/FPS düşürüp tekrar deneyin.`,
    );
  };

  const createScreenCaptureStream = async (
    options?: ScreenShareOptions,
  ): Promise<MediaStream> => {
    const requestedQuality = options?.quality ?? SCREEN_CAPTURE_DEFAULT_QUALITY;
    const sourceId = options?.sourceId;
    const sourceType = isWindowCaptureSource(sourceId) ? "window" : "screen";
    const stabilized = applyScreenSourceStabilityCaps(
      requestedQuality,
      sourceId,
    );
    const effectiveRequestedQuality = stabilized.quality;
    const qualityChain = buildScreenQualityFallbackChain(
      effectiveRequestedQuality,
    );

    if (stabilized.capped) {
      emitMediaDebugLog(
        "warn",
        "screen",
        "quality-capped",
        "Pencere yakalama için stabilite amaçlı kalite profili düşürüldü",
        {
          sourceId: sourceId ?? null,
          sourceType,
          requestedQuality,
          appliedQuality: effectiveRequestedQuality,
        },
      );

      deps.setVoiceState(
        `Pencere paylaşımı için stabil profil uygulandı (${formatQualityLabel(effectiveRequestedQuality)})`,
        false,
      );
    }

    emitMediaDebugLog(
      "info",
      "screen",
      "capture-start",
      "Ekran yakalama başlatıldı",
      {
        sourceMode: sourceId ? "desktop-source" : "display-media",
        sourceType,
        hasSourceId: Boolean(sourceId),
        requestedQuality,
        effectiveRequestedQuality,
        qualityChain: qualityChain.map(formatQualityLabel),
      },
    );

    if (sourceId) {
      let lastError: unknown = null;
      for (const [index, quality] of qualityChain.entries()) {
        emitMediaDebugLog(
          "info",
          "screen",
          "capture-attempt",
          "Ekran kaynağı yakalama profili deneniyor",
          {
            attempt: index + 1,
            sourceId,
            sourceType,
            quality,
          },
        );

        try {
          const stream = await getDesktopSourceMediaSafe({
            sourceId,
            quality,
          });

          const videoTrack = stream.getVideoTracks()[0];
          applyTrackContentHint(videoTrack, "detail");

          const actualQuality = videoTrack
            ? getTrackSettingsSize(videoTrack)
            : undefined;
          emitMediaDebugLog(
            index > 0 ? "warn" : "info",
            "screen",
            "capture-success",
            "Ekran kaynağı yakalama başarılı",
            {
              attempt: index + 1,
              sourceId,
              sourceType,
              requestedQuality: quality,
              actualQuality,
              fallbackApplied: index > 0,
            },
          );

          if (index > 0) {
            deps.setVoiceState(
              `Ekran paylaşımı stabil kalite profiline alındı (${formatQualityLabel(quality)})`,
              false,
            );
          }

          return stream;
        } catch (error) {
          lastError = error;
          emitMediaDebugLog(
            "warn",
            "screen",
            "capture-attempt-failed",
            "Ekran kaynağı yakalama denemesi başarısız",
            {
              attempt: index + 1,
              sourceId,
              sourceType,
              quality,
              error: getUnknownErrorMessage(error),
            },
          );
        }
      }

      const message =
        lastError instanceof Error ? lastError.message : "bilinmeyen hata";
      emitMediaDebugLog(
        "error",
        "screen",
        "capture-failed",
        "Ekran kaynağı yakalama tüm profillerde başarısız oldu",
        {
          sourceId,
          sourceType,
          requestedQuality: effectiveRequestedQuality,
          qualityChain: qualityChain.map(formatQualityLabel),
          error: message,
        },
      );

      throw new Error(
        `Ekran yakalama başlatılamadı (${message}). Çözünürlük/FPS düşürüp tekrar deneyin.`,
      );
    }

    let lastError: unknown = null;
    for (const [index, quality] of qualityChain.entries()) {
      emitMediaDebugLog(
        "info",
        "screen",
        "capture-attempt",
        "DisplayMedia yakalama profili deneniyor",
        {
          attempt: index + 1,
          sourceType,
          quality,
        },
      );

      try {
        const toleratedWidth = Math.round(
          clamp(
            quality.width * 1.2,
            quality.width,
            SCREEN_CAPTURE_MAX_QUALITY.width,
          ),
        );
        const toleratedHeight = Math.round(
          clamp(
            quality.height * 1.2,
            quality.height,
            SCREEN_CAPTURE_MAX_QUALITY.height,
          ),
        );
        const toleratedFps = Math.round(
          clamp(quality.fps + 5, quality.fps, SCREEN_CAPTURE_MAX_QUALITY.fps),
        );

        const stream = await getDisplayMediaSafe({
          video: {
            width: { ideal: quality.width, max: toleratedWidth },
            height: { ideal: quality.height, max: toleratedHeight },
            frameRate: { ideal: quality.fps, max: toleratedFps },
          },
          audio: false,
        });

        const videoTrack = stream.getVideoTracks()[0];
        applyTrackContentHint(videoTrack, "detail");

        const actualQuality = videoTrack
          ? getTrackSettingsSize(videoTrack)
          : undefined;
        emitMediaDebugLog(
          index > 0 ? "warn" : "info",
          "screen",
          "capture-success",
          "DisplayMedia yakalama başarılı",
          {
            attempt: index + 1,
            requestedQuality: quality,
            sourceType,
            actualQuality,
            fallbackApplied: index > 0,
          },
        );

        if (index > 0) {
          deps.setVoiceState(
            `Ekran paylaşımı stabil kalite profiline alındı (${formatQualityLabel(quality)})`,
            false,
          );
        }

        return stream;
      } catch (error) {
        lastError = error;
        emitMediaDebugLog(
          "warn",
          "screen",
          "capture-attempt-failed",
          "DisplayMedia yakalama denemesi başarısız",
          {
            attempt: index + 1,
            sourceType,
            quality,
            error: getUnknownErrorMessage(error),
          },
        );
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : "bilinmeyen hata";
    emitMediaDebugLog(
      "error",
      "screen",
      "capture-failed",
      "DisplayMedia yakalama tüm profillerde başarısız oldu",
      {
        requestedQuality: effectiveRequestedQuality,
        sourceType,
        qualityChain: qualityChain.map(formatQualityLabel),
        error: message,
      },
    );

    throw new Error(
      `Ekran paylaşımı başlatılamadı (${message}). Çözünürlük/FPS düşürüp tekrar deneyin.`,
    );
  };

  const clearHeartbeatAndMetricsForUi = (): void => {
    deps.setVoiceState("Ses beklemede", false);
  };

  const emitConnectionMetrics = (payload: {
    latencyMs: number | null;
    packetLossPercent: number;
    connected: boolean;
  }): void => {
    deps.onConnectionMetrics?.(payload);
  };

  const computeProbePacketLossPercent = (): number => {
    if (liveKitProbeHistory.length === 0) {
      return 0;
    }

    const failureCount = liveKitProbeHistory.filter((ok) => !ok).length;
    return Math.round((failureCount / liveKitProbeHistory.length) * 1000) / 10;
  };

  const rememberProbeResult = (ok: boolean): void => {
    liveKitProbeHistory.push(ok);
    if (liveKitProbeHistory.length > LIVEKIT_PROBE_HISTORY_SIZE) {
      liveKitProbeHistory.shift();
    }
  };

  const resolveLiveKitProbeUrl = (rawUrl: string): string | null => {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return null;
    }

    const parse = (value: string): URL | null => {
      try {
        return new URL(value);
      } catch {
        return null;
      }
    };

    let parsed = parse(trimmed);
    if (!parsed) {
      parsed = parse(`http://${trimmed}`);
    }
    if (!parsed) {
      return null;
    }

    if (parsed.protocol === "ws:") {
      parsed.protocol = "http:";
    } else if (parsed.protocol === "wss:") {
      parsed.protocol = "https:";
    }

    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  };

  const stopLiveKitMetrics = (): void => {
    if (liveKitMetricsTimer !== null) {
      window.clearInterval(liveKitMetricsTimer);
      liveKitMetricsTimer = null;
    }

    liveKitProbeUrl = null;
    liveKitProbeHistory.length = 0;

    emitConnectionMetrics({
      latencyMs: null,
      packetLossPercent: 0,
      connected: false,
    });
  };

  const startLiveKitMetrics = (serverUrl: string): void => {
    stopLiveKitMetrics();

    liveKitProbeUrl = resolveLiveKitProbeUrl(serverUrl);
    if (!liveKitProbeUrl) {
      emitConnectionMetrics({
        latencyMs: null,
        packetLossPercent: 0,
        connected: true,
      });
      return;
    }

    const runProbe = async (): Promise<void> => {
      if (!liveKitProbeUrl) {
        return;
      }

      const startedAt = performance.now();
      try {
        await fetch(liveKitProbeUrl, {
          method: "GET",
          cache: "no-store",
          mode: "no-cors",
        });

        const latencyMs = Math.max(
          0,
          Math.round(performance.now() - startedAt),
        );
        rememberProbeResult(true);
        emitConnectionMetrics({
          latencyMs,
          packetLossPercent: computeProbePacketLossPercent(),
          connected: true,
        });
      } catch {
        rememberProbeResult(false);
        emitConnectionMetrics({
          latencyMs: null,
          packetLossPercent: computeProbePacketLossPercent(),
          connected: true,
        });
      }
    };

    liveKitMetricsTimer = window.setInterval(() => {
      void runProbe();
    }, LIVEKIT_METRICS_INTERVAL_MS);

    void runProbe();
  };

  const ensureLiveKitSdk = async (): Promise<any> => {
    if (liveKitSdk) {
      return liveKitSdk;
    }

    liveKitSdk = await import("livekit-client");
    return liveKitSdk;
  };

  const sourceMatches = (value: unknown, token: string): boolean => {
    if (value === undefined || value === null) {
      return false;
    }

    const normalized = String(value).trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    if (token === "screen_share") {
      return normalized === "screen_share" || normalized === "screenshare";
    }

    return normalized === token;
  };

  const resolveLiveKitSourceType = (
    source: unknown,
  ): "microphone" | "camera" | "screen" => {
    const sdkSource = liveKitSdk?.Track?.Source;

    if (source === sdkSource?.Camera || sourceMatches(source, "camera")) {
      return "camera";
    }

    if (
      source === sdkSource?.ScreenShare ||
      sourceMatches(source, "screen_share")
    ) {
      return "screen";
    }

    return "microphone";
  };

  const resolveLiveKitTrackKind = (
    track: any,
    publication: any,
  ): "audio" | "video" | null => {
    const rawKind = track?.kind ?? publication?.kind;
    if (rawKind === liveKitSdk?.Track?.Kind?.Audio || rawKind === "audio") {
      return "audio";
    }

    if (rawKind === liveKitSdk?.Track?.Kind?.Video || rawKind === "video") {
      return "video";
    }

    return null;
  };

  const resolvePreferredRemoteVideoQuality = (
    sourceType: "microphone" | "camera" | "screen",
  ): unknown => {
    const videoQuality = liveKitSdk?.VideoQuality;
    if (sourceType === "screen") {
      return videoQuality?.HIGH ?? "high";
    }

    return videoQuality?.MEDIUM ?? "medium";
  };

  const applyRemotePublicationPreferences = (
    publication: any,
    sourceType: "microphone" | "camera" | "screen",
  ): void => {
    if (!publication) {
      return;
    }

    try {
      publication.setSubscribed?.(true);
    } catch {
      // no-op
    }

    if (sourceType === "microphone") {
      return;
    }

    try {
      publication.setEnabled?.(true);
    } catch {
      // no-op
    }

    try {
      publication.setVideoQuality?.(
        resolvePreferredRemoteVideoQuality(sourceType),
      );
    } catch {
      // no-op
    }

    if (sourceType === "screen") {
      try {
        publication.setVideoFPS?.(15);
      } catch {
        // no-op
      }
    }
  };

  const rememberLiveKitTrackKey = (userId: string, key: string): void => {
    const keys = liveKitTrackKeysByParticipant.get(userId) ?? new Set<string>();
    keys.add(key);
    liveKitTrackKeysByParticipant.set(userId, keys);
  };

  const removeLiveKitTrackByKey = (key: string): void => {
    const meta = liveKitTrackMetaByKey.get(key);
    if (!meta) {
      remoteMediaUi.removeRemoteTrack(key);
      return;
    }

    remoteMediaUi.removeRemoteTrack(key, meta.kind);
    liveKitTrackMetaByKey.delete(key);

    const ownedKeys = liveKitTrackKeysByParticipant.get(meta.userId);
    if (ownedKeys) {
      ownedKeys.delete(key);
      if (ownedKeys.size === 0) {
        liveKitTrackKeysByParticipant.delete(meta.userId);
      }
    }

    for (const [sid, mappedKey] of liveKitTrackKeyBySid.entries()) {
      if (mappedKey === key) {
        liveKitTrackKeyBySid.delete(sid);
      }
    }
  };

  const removeLiveKitParticipantTracks = (userId: string): void => {
    const ownedKeys = liveKitTrackKeysByParticipant.get(userId);
    if (!ownedKeys) {
      return;
    }

    for (const key of Array.from(ownedKeys.values())) {
      removeLiveKitTrackByKey(key);
    }

    liveKitTrackKeysByParticipant.delete(userId);
  };

  const attachLiveKitTrack = (
    track: any,
    publication: any,
    participant: any,
  ): void => {
    const kind = resolveLiveKitTrackKind(track, publication);
    if (!kind) {
      return;
    }

    const mediaTrack = track?.mediaStreamTrack as MediaStreamTrack | undefined;
    if (!mediaTrack && kind === "audio") {
      return;
    }

    const userId = String(participant?.identity ?? "").trim();
    if (!userId || userId === deps.getSelfUserId()) {
      return;
    }

    const sid = String(
      publication?.trackSid ?? publication?.sid ?? mediaTrack?.id ?? "",
    );
    if (!sid) {
      return;
    }

    const key = `lk:${userId}:${sid}`;
    const sourceType = resolveLiveKitSourceType(
      publication?.source ?? track?.source,
    );
    applyRemotePublicationPreferences(publication, sourceType);

    liveKitTrackKeyBySid.set(sid, key);
    liveKitTrackMetaByKey.set(key, {
      userId,
      kind,
      sourceType,
    });
    rememberLiveKitTrackKey(userId, key);

    remoteMediaUi.attachRemoteTrack({
      key,
      userId,
      kind,
      sourceType,
      ...(mediaTrack ? { stream: new MediaStream([mediaTrack]) } : {}),
      ...(kind === "video" ? { trackRef: track } : {}),
    });
  };

  const attachLiveKitParticipantTracks = (participant: any): void => {
    const publications: Iterable<any> =
      participant?.trackPublications?.values?.() ?? [];

    for (const publication of publications) {
      const sourceType = resolveLiveKitSourceType(publication?.source);
      applyRemotePublicationPreferences(publication, sourceType);

      const track = publication?.track;
      if (!track) {
        continue;
      }

      attachLiveKitTrack(track, publication, participant);
    }
  };

  const refreshLiveKitLabels = (): void => {
    for (const [key, meta] of liveKitTrackMetaByKey.entries()) {
      remoteMediaUi.updateRemoteLabel({
        key,
        userId: meta.userId,
        kind: meta.kind,
        sourceType: meta.sourceType,
      });
    }
  };

  const ensureLiveKitJoinedAt = (userId: string): string => {
    const existing = liveKitJoinedAtByUserId.get(userId);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    liveKitJoinedAtByUserId.set(userId, now);
    return now;
  };

  const findPublicationBySource = (participant: any, token: string): any => {
    const sdkSource = liveKitSdk?.Track?.Source;
    const publications: Iterable<any> =
      participant?.trackPublications?.values?.() ?? [];

    for (const publication of publications) {
      const source = publication?.source;
      if (token === "microphone" && source === sdkSource?.Microphone) {
        return publication;
      }
      if (token === "camera" && source === sdkSource?.Camera) {
        return publication;
      }
      if (token === "screen_share" && source === sdkSource?.ScreenShare) {
        return publication;
      }

      if (sourceMatches(source, token)) {
        return publication;
      }
    }

    return null;
  };

  const publicationEnabled = (publication: any): boolean => {
    if (!publication) {
      return false;
    }

    return !Boolean(publication.isMuted);
  };

  const buildLiveKitLobbyMembers = (): LobbyMemberSnapshot[] => {
    if (!liveKitRoom) {
      return [];
    }

    const participants: any[] = [];
    if (liveKitRoom.localParticipant) {
      participants.push(liveKitRoom.localParticipant);
    }

    const remoteParticipants: Iterable<any> =
      liveKitRoom.remoteParticipants?.values?.() ?? [];
    for (const participant of remoteParticipants) {
      participants.push(participant);
    }

    const members: LobbyMemberSnapshot[] = [];
    for (const participant of participants) {
      const userId = String(participant?.identity ?? "").trim();
      if (!userId) {
        continue;
      }

      const usernameRaw = String(participant?.name ?? "").trim();
      const username = usernameRaw || userId;

      const micPub = findPublicationBySource(participant, "microphone");
      const cameraPub = findPublicationBySource(participant, "camera");
      const screenPub = findPublicationBySource(participant, "screen_share");

      let micEnabled = publicationEnabled(micPub);
      if (userId === deps.getSelfUserId() && localLiveKitAudioTrack) {
        micEnabled = localLiveKitAudioTrack.enabled;
      }

      members.push({
        userId,
        username,
        joinedAt: ensureLiveKitJoinedAt(userId),
        muted: !micEnabled,
        deafened: false,
        speaking: Boolean(participant?.isSpeaking) && micEnabled,
        cameraEnabled: publicationEnabled(cameraPub),
        screenSharing: publicationEnabled(screenPub),
        cameraProducerId: (cameraPub?.trackSid as string | undefined) ?? null,
        screenProducerId: (screenPub?.trackSid as string | undefined) ?? null,
      });
    }

    members.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
    return members;
  };

  const emitLiveKitLobbySnapshot = (): void => {
    deps.onLiveKitLobbySnapshot?.(buildLiveKitLobbyMembers());
  };

  const clearAllLiveKitRemoteTracks = (): void => {
    for (const key of Array.from(liveKitTrackMetaByKey.keys())) {
      removeLiveKitTrackByKey(key);
    }

    liveKitTrackMetaByKey.clear();
    liveKitTrackKeysByParticipant.clear();
    liveKitTrackKeyBySid.clear();
    liveKitJoinedAtByUserId.clear();
  };

  const unpublishLiveKitPublication = (publication: any): void => {
    if (!liveKitRoom || !publication) {
      return;
    }

    const publishedTrack = publication.track;
    if (!publishedTrack) {
      return;
    }

    void liveKitRoom.localParticipant
      ?.unpublishTrack(publishedTrack)
      .catch(() => {
        // no-op
      });
  };

  const stopLiveKitCameraStatsMonitor = (): void => {
    if (liveKitCameraStatsTimer !== null) {
      window.clearInterval(liveKitCameraStatsTimer);
      liveKitCameraStatsTimer = null;
    }
  };

  const stopLiveKitScreenStatsMonitor = (): void => {
    if (liveKitScreenStatsTimer !== null) {
      window.clearInterval(liveKitScreenStatsTimer);
      liveKitScreenStatsTimer = null;
    }
  };

  const stopLiveKitVideoStatsMonitors = (): void => {
    stopLiveKitCameraStatsMonitor();
    stopLiveKitScreenStatsMonitor();
  };

  const readPrimaryVideoSenderStat = async (
    publication: any,
  ): Promise<Record<string, unknown> | null> => {
    const track = publication?.track;
    if (!track || typeof track.getSenderStats !== "function") {
      return null;
    }

    let senderStats: unknown;
    try {
      senderStats = await track.getSenderStats();
    } catch {
      return null;
    }

    if (!Array.isArray(senderStats) || senderStats.length === 0) {
      return null;
    }

    let best = senderStats[0] as Record<string, unknown>;
    for (const candidate of senderStats) {
      if (!candidate || typeof candidate !== "object") {
        continue;
      }

      const bestTarget = Number(best.targetBitrate ?? 0);
      const candidateRecord = candidate as Record<string, unknown>;
      const candidateTarget = Number(candidateRecord.targetBitrate ?? 0);
      if (candidateTarget > bestTarget) {
        best = candidateRecord;
      }
    }

    return best;
  };

  const monitorLocalVideoPublication = (
    scope: "camera" | "screen",
    publication: any,
    requestedQuality: VideoCaptureQuality,
  ): void => {
    const timerRef = scope === "camera" ? "camera-stats" : "screen-stats";
    const minExpectedFps = Math.max(8, Math.round(requestedQuality.fps * 0.6));
    const minExpectedBitrate = scope === "camera" ? 300_000 : 800_000;

    const sample = async (): Promise<void> => {
      if (!liveKitRoom || !publication) {
        return;
      }

      const bestStat = await readPrimaryVideoSenderStat(publication);
      if (!bestStat) {
        return;
      }

      const reason = String(bestStat.qualityLimitationReason ?? "none");
      const targetBitrate = Math.round(
        Math.max(0, Number(bestStat.targetBitrate ?? 0)),
      );
      const fps = Math.round(
        Math.max(0, Number(bestStat.framesPerSecond ?? 0)),
      );
      const frameWidth = Math.round(
        Math.max(0, Number(bestStat.frameWidth ?? 0)),
      );
      const frameHeight = Math.round(
        Math.max(0, Number(bestStat.frameHeight ?? 0)),
      );

      const qualityLimited =
        reason !== "none" && reason !== "" && reason !== "other";
      const bitrateLow =
        targetBitrate > 0 && targetBitrate < minExpectedBitrate;
      const fpsLow = fps > 0 && fps < minExpectedFps;

      if (!qualityLimited && !bitrateLow && !fpsLow) {
        return;
      }

      emitMediaDebugLog(
        "warn",
        scope,
        "sender-quality-limited",
        "Yayin kalitesi ag veya cihaz kosullarina gore sinirlandi",
        {
          timer: timerRef,
          requestedQuality,
          targetBitrate,
          fps,
          frameWidth,
          frameHeight,
          qualityLimitationReason: reason,
          minExpectedFps,
          minExpectedBitrate,
        },
      );
    };

    const timer = window.setInterval(() => {
      void sample();
    }, LIVEKIT_VIDEO_SENDER_STATS_INTERVAL_MS);

    if (scope === "camera") {
      stopLiveKitCameraStatsMonitor();
      liveKitCameraStatsTimer = timer;
    } else {
      stopLiveKitScreenStatsMonitor();
      liveKitScreenStatsTimer = timer;
    }

    void sample();
  };

  const stopLiveKitCameraShare = (): void => {
    stopLiveKitCameraStatsMonitor();

    emitMediaDebugLog(
      "info",
      "camera",
      "publish-stopped",
      "Kamera yayını durduruldu",
      {
        hadPublication: Boolean(localLiveKitCameraPublication),
      },
    );

    unpublishLiveKitPublication(localLiveKitCameraPublication);
    localLiveKitCameraPublication = null;

    stopMediaStream(pendingLiveKitCameraStream);
    pendingLiveKitCameraStream = null;

    stopMediaStream(localLiveKitCameraStream);
    localLiveKitCameraStream = null;
    remoteMediaUi.removeRemoteTrack("local:camera", "video");
    deps.onCameraShareChanged?.(false);
    emitLiveKitLobbySnapshot();
  };

  const stopLiveKitScreenShare = (): void => {
    stopLiveKitScreenStatsMonitor();

    emitMediaDebugLog(
      "info",
      "screen",
      "publish-stopped",
      "Ekran yayını durduruldu",
      {
        hadPublication: Boolean(localLiveKitScreenPublication),
      },
    );

    stopMediaStream(localLiveKitScreenStream);

    try {
      localLiveKitScreenPublication?.track?.stop?.();
    } catch {
      // no-op
    }

    unpublishLiveKitPublication(localLiveKitScreenPublication);
    localLiveKitScreenPublication = null;

    stopMediaStream(pendingLiveKitScreenStream);
    pendingLiveKitScreenStream = null;

    stopMediaStream(localLiveKitScreenStream);
    localLiveKitScreenStream = null;
    remoteMediaUi.removeRemoteTrack("local:screen", "video");
    deps.onScreenShareChanged?.(false);
    emitLiveKitLobbySnapshot();
  };

  const publishLiveKitMicrophone = async (room: any): Promise<void> => {
    const stream = await ensureLocalAudioStream();
    const track = stream.getAudioTracks()[0];
    if (!track) {
      throw new Error("ses izi bulunamadı");
    }

    if (localLiveKitAudioPublication) {
      unpublishLiveKitPublication(localLiveKitAudioPublication);
      localLiveKitAudioPublication = null;
    }

    const sdk = await ensureLiveKitSdk();
    localLiveKitAudioTrack = track;
    localLiveKitAudioTrack.enabled = !deps.getIsMuted();

    localLiveKitAudioPublication = await room.localParticipant.publishTrack(
      localLiveKitAudioTrack,
      {
        source: sdk.Track?.Source?.Microphone,
        dtx: true,
        red: true,
      },
    );

    emitMediaDebugLog(
      "info",
      "audio",
      "publish-microphone",
      "Mikrofon LiveKit'e yayınlandı",
      {
        trackId: track.id,
        publicationSid:
          String(
            localLiveKitAudioPublication?.trackSid ??
              localLiveKitAudioPublication?.sid ??
              "",
          ) || null,
        enabled: localLiveKitAudioTrack.enabled,
        settings: track.getSettings(),
      },
    );

    emitLiveKitLobbySnapshot();
  };

  const connectLiveKit = async (): Promise<void> => {
    if (liveKitRoom) {
      return;
    }

    const tokenResult = await window.desktopApi.mediaCreateLiveKitToken({
      room: deps.getLiveKitDefaultRoom(),
    });
    if (!tokenResult.ok || !tokenResult.data) {
      throw new Error(getErrorMessage(tokenResult.error));
    }

    liveKitMediaPolicy = normalizeLiveKitMediaPolicy(
      tokenResult.data.mediaPolicy,
    );

    emitMediaDebugLog(
      "info",
      "livekit",
      "connect-start",
      "LiveKit bağlantısı başlatılıyor",
      {
        room: deps.getLiveKitDefaultRoom(),
        serverUrl: tokenResult.data.serverUrl,
        iceServerCount: Array.isArray(deps.rtcConfig.iceServers)
          ? deps.rtcConfig.iceServers.length
          : 0,
        hasCustomIceTransportPolicy: Boolean(deps.rtcConfig.iceTransportPolicy),
        mediaPolicy: liveKitMediaPolicy,
      },
    );

    const sdk = await ensureLiveKitSdk();
    const publishDefaults: Record<string, unknown> = {
      dtx: true,
      red: true,
      simulcast: liveKitMediaPolicy.simulcast,
      videoCodec: liveKitMediaPolicy.preferredVideoCodec,
      backupCodec: {
        codec: liveKitMediaPolicy.backupVideoCodec,
      },
      videoEncoding: {
        maxBitrate: liveKitMediaPolicy.cameraMaxBitrate,
        maxFramerate: liveKitMediaPolicy.cameraMaxFps,
      },
      screenShareEncoding: {
        maxBitrate: liveKitMediaPolicy.screenMaxBitrate,
        maxFramerate: liveKitMediaPolicy.screenMaxFps,
      },
      degradationPreference: "balanced",
    };

    const defaultVideoSimulcastLayers = [
      sdk.VideoPresets?.h360,
      sdk.VideoPresets?.h180,
    ].filter(Boolean);
    if (defaultVideoSimulcastLayers.length > 0) {
      publishDefaults.videoSimulcastLayers = defaultVideoSimulcastLayers;
    }

    const defaultScreenSimulcastLayers = [
      sdk.ScreenSharePresets?.h1080fps15,
      sdk.ScreenSharePresets?.h720fps15,
    ].filter(Boolean);
    if (defaultScreenSimulcastLayers.length > 0) {
      publishDefaults.screenShareSimulcastLayers = defaultScreenSimulcastLayers;
    }

    const room = new sdk.Room({
      adaptiveStream: true,
      dynacast: liveKitMediaPolicy.dynacast,
      rtcConfig: deps.rtcConfig,
      stopLocalTrackOnUnpublish: true,
      publishDefaults,
    });

    const roomEvent = sdk.RoomEvent ?? {};

    room.on(
      roomEvent.TrackSubscribed ?? "trackSubscribed",
      (track: any, publication: any, participant: any) => {
        attachLiveKitTrack(track, publication, participant);
        emitLiveKitLobbySnapshot();
      },
    );

    room.on(
      roomEvent.TrackPublished ?? "trackPublished",
      (publication: any, participant: any) => {
        const userId = String(participant?.identity ?? "").trim();
        if (!userId || userId === deps.getSelfUserId()) {
          return;
        }

        const sourceType = resolveLiveKitSourceType(publication?.source);
        applyRemotePublicationPreferences(publication, sourceType);
      },
    );

    room.on(
      roomEvent.TrackSubscriptionFailed ?? "trackSubscriptionFailed",
      (trackSid: unknown, participant: any, error: unknown) => {
        const userId = String(participant?.identity ?? "").trim() || null;
        emitMediaDebugLog(
          "warn",
          "livekit",
          "track-subscription-failed",
          "Uzak track aboneligi basarisiz oldu",
          {
            trackSid: String(trackSid ?? "") || null,
            userId,
            error: getUnknownErrorMessage(error),
          },
        );
      },
    );

    room.on(
      roomEvent.TrackStreamStateChanged ?? "trackStreamStateChanged",
      (publication: any, streamState: unknown, participant: any) => {
        const userId = String(participant?.identity ?? "").trim() || null;
        emitMediaDebugLog(
          "info",
          "livekit",
          "track-stream-state-changed",
          "Uzak track stream state degisti",
          {
            userId,
            trackSid:
              String(publication?.trackSid ?? publication?.sid ?? "") || null,
            streamState: String(streamState ?? "unknown"),
            source: String(publication?.source ?? "unknown"),
          },
        );
      },
    );

    room.on(
      roomEvent.ConnectionQualityChanged ?? "connectionQualityChanged",
      (quality: unknown, participant: any) => {
        const userId = String(participant?.identity ?? "").trim() || null;
        emitMediaDebugLog(
          "info",
          "livekit",
          "connection-quality-changed",
          "LiveKit baglanti kalitesi degisti",
          {
            userId,
            quality: String(quality ?? "unknown"),
          },
        );
      },
    );

    room.on(
      roomEvent.TrackUnsubscribed ?? "trackUnsubscribed",
      (_track: any, publication: any, participant: any) => {
        const userId = String(participant?.identity ?? "").trim();
        const sid = String(
          publication?.trackSid ?? publication?.sid ?? "",
        ).trim();
        if (sid) {
          const key = liveKitTrackKeyBySid.get(sid);
          if (key) {
            removeLiveKitTrackByKey(key);
          }
        } else if (userId) {
          removeLiveKitParticipantTracks(userId);
        }

        emitLiveKitLobbySnapshot();
      },
    );

    room.on(
      roomEvent.ParticipantConnected ?? "participantConnected",
      (participant: any) => {
        const userId = String(participant?.identity ?? "").trim();
        if (userId) {
          ensureLiveKitJoinedAt(userId);
        }
        emitLiveKitLobbySnapshot();
      },
    );

    room.on(
      roomEvent.ParticipantDisconnected ?? "participantDisconnected",
      (participant: any) => {
        const userId = String(participant?.identity ?? "").trim();
        if (userId) {
          removeLiveKitParticipantTracks(userId);
        }
        emitLiveKitLobbySnapshot();
      },
    );

    room.on(roomEvent.ActiveSpeakersChanged ?? "activeSpeakersChanged", () => {
      emitLiveKitLobbySnapshot();
    });

    room.on(roomEvent.Disconnected ?? "disconnected", () => {
      emitMediaDebugLog(
        "warn",
        "livekit",
        "disconnected",
        "LiveKit bağlantısı kapandı",
      );

      stopLiveKitMetrics();
      stopLiveKitVideoStatsMonitors();
      clearAllLiveKitRemoteTracks();
      remoteMediaUi.removeRemoteTrack("local:camera", "video");
      remoteMediaUi.removeRemoteTrack("local:screen", "video");
      deps.onCameraShareChanged?.(false);
      deps.onScreenShareChanged?.(false);
      emitLiveKitLobbySnapshot();
      clearHeartbeatAndMetricsForUi();
    });

    await room.connect(tokenResult.data.serverUrl, tokenResult.data.token);
    liveKitRoom = room;

    emitMediaDebugLog(
      "info",
      "livekit",
      "connect-success",
      "LiveKit bağlantısı kuruldu",
      {
        roomName: String(room.name ?? deps.getLiveKitDefaultRoom()),
        selfIdentity: String(room.localParticipant?.identity ?? ""),
        adaptiveStream: true,
        dynacast: liveKitMediaPolicy.dynacast,
        codec: liveKitMediaPolicy.preferredVideoCodec,
        simulcast: liveKitMediaPolicy.simulcast,
        qualityProfile: liveKitMediaPolicy.qualityProfile,
      },
    );

    startLiveKitMetrics(tokenResult.data.serverUrl);

    await publishLiveKitMicrophone(room);

    const remoteParticipants: Iterable<any> =
      room.remoteParticipants?.values?.() ?? [];
    for (const participant of remoteParticipants) {
      attachLiveKitParticipantTracks(participant);
    }

    emitLiveKitLobbySnapshot();
    deps.setVoiceState("LiveKit bağlantısı hazır", false);
  };

  const disposeLiveKit = (): void => {
    emitMediaDebugLog(
      "info",
      "livekit",
      "dispose",
      "LiveKit kaynakları temizleniyor",
    );

    stopLiveKitMetrics();
    stopLiveKitVideoStatsMonitors();
    stopLiveKitCameraShare();
    stopLiveKitScreenShare();

    unpublishLiveKitPublication(localLiveKitAudioPublication);
    localLiveKitAudioPublication = null;
    localLiveKitAudioTrack = null;

    clearAllLiveKitRemoteTracks();

    if (liveKitRoom) {
      try {
        liveKitRoom.removeAllListeners?.();
      } catch {
        // no-op
      }

      try {
        liveKitRoom.disconnect?.();
      } catch {
        // no-op
      }
    }

    liveKitRoom = null;
  };

  const applyOutputVolume = (): void => {
    remoteMediaUi.setRemoteAudioVolume(outputVolumeLevel, outputMuted);
    if (micTestAudio) {
      micTestAudio.volume = outputMuted ? 0 : outputVolumeLevel;
    }
  };

  const stopMicTest = (): void => {
    if (micTestAudio) {
      micTestAudio.pause();
      micTestAudio.srcObject = null;
    }

    if (micTestOwnsStream && micTestStream) {
      for (const track of micTestStream.getTracks()) {
        track.stop();
      }
    }

    micTestStream = null;
    micTestOwnsStream = false;
    micTestActive = false;
  };

  const listMicrophones = async (): Promise<void> => {
    try {
      const devices = await enumerateDevicesSafe();
      const microphones = devices.filter(
        (device) => device.kind === "audioinput",
      );

      deps.dom.microphoneSelect.innerHTML = "";

      for (const mic of microphones) {
        const option = document.createElement("option");
        option.value = mic.deviceId || "default";
        option.textContent = mic.label || "Mikrofon";
        deps.dom.microphoneSelect.appendChild(option);
      }

      if (microphones.length === 0) {
        const option = document.createElement("option");
        option.value = "default";
        option.textContent = "Mikrofon bulunamadı";
        deps.dom.microphoneSelect.appendChild(option);
      }

      if (selectedMicrophoneId) {
        deps.dom.microphoneSelect.value = selectedMicrophoneId;
      }
    } catch {
      deps.setVoiceState("Mikrofon listesi alınamadı", true);
    }
  };

  const toggleLiveKitCameraShare = async (
    options?: CameraShareOptions,
  ): Promise<boolean> => {
    const operationVersion = mediaOperationVersion;

    if (localLiveKitCameraPublication) {
      emitMediaDebugLog(
        "info",
        "camera",
        "publish-stop-request",
        "Kamera paylaşımı kapatma isteği alındı",
      );
      stopLiveKitCameraShare();
      return false;
    }

    if (!liveKitRoom) {
      throw new Error("Kamera paylaşımı için önce LiveKit ses bağlantısı kur");
    }

    const sdk = await ensureLiveKitSdk();
    if (operationVersion !== mediaOperationVersion || !liveKitRoom) {
      return false;
    }

    const stream = await createCameraCaptureStream(options);
    pendingLiveKitCameraStream = stream;

    try {
      const track = stream.getVideoTracks()[0];
      if (!track) {
        stopMediaStream(stream);
        throw new Error("kamera izi alinamadi");
      }

      if (operationVersion !== mediaOperationVersion || !liveKitRoom) {
        stopMediaStream(stream);
        return false;
      }

      const cameraTrackSettings = getTrackSettingsSize(track);
      const requestedQuality =
        options?.quality ?? CAMERA_CAPTURE_DEFAULT_QUALITY;
      const cameraMaxBitrate = Math.min(
        resolveCameraMaxBitrate(track),
        liveKitMediaPolicy.cameraMaxBitrate,
      );
      const cameraMaxFramerate = Math.min(
        liveKitMediaPolicy.cameraMaxFps,
        cameraTrackSettings.fps,
      );

      const publication = await liveKitRoom.localParticipant.publishTrack(
        track,
        {
          source: sdk.Track?.Source?.Camera,
          simulcast: liveKitMediaPolicy.simulcast,
          videoCodec: liveKitMediaPolicy.preferredVideoCodec,
          degradationPreference: "balanced",
          videoEncoding: {
            maxBitrate: cameraMaxBitrate,
            maxFramerate: cameraMaxFramerate,
          },
        },
      );

      if (operationVersion !== mediaOperationVersion || !liveKitRoom) {
        unpublishLiveKitPublication(publication);
        stopMediaStream(stream);
        return false;
      }

      emitMediaDebugLog(
        "info",
        "camera",
        "publish-started",
        "Kamera yayını başlatıldı",
        {
          requestedQuality,
          actualQuality: cameraTrackSettings,
          encoding: {
            maxBitrate: cameraMaxBitrate,
            maxFramerate: cameraMaxFramerate,
            simulcast: liveKitMediaPolicy.simulcast,
            codec: liveKitMediaPolicy.preferredVideoCodec,
          },
          profile: liveKitMediaPolicy.qualityProfile,
          publicationSid:
            String(publication?.trackSid ?? publication?.sid ?? "") || null,
        },
      );

      localLiveKitCameraStream = stream;
      localLiveKitCameraPublication = publication;
      monitorLocalVideoPublication("camera", publication, requestedQuality);
      deps.onCameraShareChanged?.(true);

      const selfUserId = deps.getSelfUserId();
      if (selfUserId) {
        remoteMediaUi.attachRemoteTrack({
          key: "local:camera",
          userId: selfUserId,
          kind: "video",
          sourceType: "camera",
          stream,
        });
      }

      track.addEventListener("ended", () => {
        emitMediaDebugLog(
          "warn",
          "camera",
          "track-ended",
          "Kamera track ended olayı ile sonlandı",
          {
            trackId: track.id,
          },
        );
        stopLiveKitCameraShare();
        deps.setVoiceState("Kamera paylaşımı sonlandı", false);
      });

      emitLiveKitLobbySnapshot();
      return true;
    } catch (error) {
      stopMediaStream(stream);
      throw error;
    } finally {
      if (pendingLiveKitCameraStream === stream) {
        pendingLiveKitCameraStream = null;
      }
    }
  };

  const toggleLiveKitScreenShare = async (
    options?: ScreenShareOptions,
  ): Promise<boolean> => {
    const operationVersion = mediaOperationVersion;

    if (localLiveKitScreenPublication) {
      emitMediaDebugLog(
        "info",
        "screen",
        "publish-stop-request",
        "Ekran paylaşımı kapatma isteği alındı",
      );
      stopLiveKitScreenShare();
      return false;
    }

    if (!liveKitRoom) {
      throw new Error("Ekran paylaşımı için önce LiveKit ses bağlantısı kur");
    }

    const sdk = await ensureLiveKitSdk();
    if (operationVersion !== mediaOperationVersion || !liveKitRoom) {
      return false;
    }

    const stream = await createScreenCaptureStream(options);
    pendingLiveKitScreenStream = stream;

    try {
      const track = stream.getVideoTracks()[0];
      if (!track) {
        stopMediaStream(stream);
        throw new Error("ekran izi alinamadi");
      }

      if (operationVersion !== mediaOperationVersion || !liveKitRoom) {
        stopMediaStream(stream);
        return false;
      }

      const screenTrackSettings = getTrackSettingsSize(track);
      const isWindowSource = isWindowCaptureSource(options?.sourceId);
      const requestedQuality =
        options?.quality ?? SCREEN_CAPTURE_DEFAULT_QUALITY;
      const screenBaseMaxBitrate = resolveScreenMaxBitrate(track);
      const screenMaxBitrate = isWindowSource
        ? Math.min(
            screenBaseMaxBitrate,
            liveKitMediaPolicy.screenMaxBitrate,
            5_000_000,
          )
        : Math.min(screenBaseMaxBitrate, liveKitMediaPolicy.screenMaxBitrate);
      const screenMaxFramerate = isWindowSource
        ? Math.min(30, liveKitMediaPolicy.screenMaxFps, screenTrackSettings.fps)
        : Math.min(liveKitMediaPolicy.screenMaxFps, screenTrackSettings.fps);

      const publication = await liveKitRoom.localParticipant.publishTrack(
        track,
        {
          source: sdk.Track?.Source?.ScreenShare,
          simulcast: liveKitMediaPolicy.simulcast,
          videoCodec: liveKitMediaPolicy.preferredVideoCodec,
          degradationPreference: "maintain-resolution",
          videoEncoding: {
            maxBitrate: screenMaxBitrate,
            maxFramerate: screenMaxFramerate,
          },
        },
      );

      if (operationVersion !== mediaOperationVersion || !liveKitRoom) {
        unpublishLiveKitPublication(publication);
        stopMediaStream(stream);
        return false;
      }

      emitMediaDebugLog(
        "info",
        "screen",
        "publish-started",
        "Ekran yayını başlatıldı",
        {
          sourceId: options?.sourceId ?? null,
          sourceType: isWindowSource ? "window" : "screen",
          requestedQuality,
          actualQuality: screenTrackSettings,
          encoding: {
            maxBitrate: screenMaxBitrate,
            maxFramerate: screenMaxFramerate,
            simulcast: liveKitMediaPolicy.simulcast,
            codec: liveKitMediaPolicy.preferredVideoCodec,
          },
          profile: liveKitMediaPolicy.qualityProfile,
          stabilityCapApplied: isWindowSource,
          publicationSid:
            String(publication?.trackSid ?? publication?.sid ?? "") || null,
        },
      );

      localLiveKitScreenStream = stream;
      localLiveKitScreenPublication = publication;
      monitorLocalVideoPublication("screen", publication, requestedQuality);
      deps.onScreenShareChanged?.(true);

      const selfUserId = deps.getSelfUserId();
      if (selfUserId) {
        remoteMediaUi.attachRemoteTrack({
          key: "local:screen",
          userId: selfUserId,
          kind: "video",
          sourceType: "screen",
          stream,
        });
      }

      track.addEventListener("ended", () => {
        emitMediaDebugLog(
          "warn",
          "screen",
          "track-ended",
          "Ekran track ended olayı ile sonlandı",
          {
            trackId: track.id,
            sourceId: options?.sourceId ?? null,
          },
        );
        stopLiveKitScreenShare();
        deps.setVoiceState("Ekran paylaşımı sonlandı", false);
      });

      emitLiveKitLobbySnapshot();
      return true;
    } catch (error) {
      stopMediaStream(stream);
      throw error;
    } finally {
      if (pendingLiveKitScreenStream === stream) {
        pendingLiveKitScreenStream = null;
      }
    }
  };

  const startVoice = async (): Promise<void> => {
    await ensureLocalAudioStream();

    try {
      await connectLiveKit();
      deps.setStatus("Ses yayını LiveKit modunda başladı", false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "bilinmeyen hata";
      deps.setStatus(`LiveKit bağlantısı kurulamadı: ${message}`, true);
      disposeLiveKit();
      throw new Error(message);
    }
  };

  const stopVoice = async (): Promise<void> => {
    mediaOperationVersion += 1;
    disposeLiveKit();
    stopLocalAudioStream();
    deps.setVoiceState("Ses durduruldu", false);
  };

  const shutdownMedia = async (): Promise<void> => {
    emitLocalSpeaking(false);
    stopMicTest();
    await stopVoice();
  };

  const cleanupForLobbyExit = (): void => {
    void shutdownMedia();
  };

  const handleMicrophoneChange = async (deviceId: string): Promise<void> => {
    selectedMicrophoneId = deviceId;

    if (!localAudioStream) {
      return;
    }

    stopLocalAudioStream();
    await ensureLocalAudioStream();

    if (liveKitRoom) {
      await publishLiveKitMicrophone(liveKitRoom);
    }

    deps.setStatus("Mikrofon değiştirildi", false);
  };

  const syncMuteState = (): void => {
    if (!localAudioStream) {
      emitLocalSpeaking(false);
    } else {
      for (const track of localAudioStream.getAudioTracks()) {
        track.enabled = !deps.getIsMuted();
      }
    }

    if (localLiveKitAudioTrack) {
      localLiveKitAudioTrack.enabled = !deps.getIsMuted();
    }

    if (deps.getIsMuted()) {
      emitLocalSpeaking(false);
    }

    if (liveKitRoom) {
      emitLiveKitLobbySnapshot();
    }
  };

  const setOutputVolume = (volumePercent: number): void => {
    const normalized = Math.max(0, Math.min(100, volumePercent));
    outputVolumeLevel = normalized / 100;
    applyOutputVolume();
  };

  const setOutputMuted = (muted: boolean): void => {
    outputMuted = muted;
    applyOutputVolume();
  };

  const setInputGain = async (gainPercent: number): Promise<void> => {
    const next = clampInputGainPercent(gainPercent);
    if (next === inputGainPercent) {
      return;
    }

    inputGainPercent = next;

    emitMediaDebugLog(
      "info",
      "audio",
      "input-gain-updated",
      "Mikrofon giriş kazancı güncellendi",
      {
        gainPercent: inputGainPercent,
        multiplier: inputGainPercentToMultiplier(inputGainPercent),
      },
    );

    if (!localAudioStream) {
      return;
    }

    if (rnnoiseInputGainNode && rnnoiseAudioContext) {
      applyInputGainNodeValue();
      return;
    }

    if (!rnnoiseEnabled && inputGainPercent === 100) {
      return;
    }

    await rebuildLocalAudioPipeline();
  };

  const setRemoteParticipantAudioState = (
    userId: string,
    payload: { muted?: boolean; volumePercent?: number },
  ): void => {
    remoteMediaUi.setParticipantAudioState(userId, payload);
  };

  const getRemoteParticipantAudioState = (
    userId: string,
  ): { muted: boolean; volumePercent: number } => {
    return remoteMediaUi.getParticipantAudioState(userId);
  };

  const toggleMicTest = async (): Promise<boolean> => {
    if (micTestActive) {
      stopMicTest();
      deps.setVoiceState("Mikrofon testi durduruldu", false);
      return false;
    }

    let stream: MediaStream;
    if (localAudioStream) {
      stream = localAudioStream;
      micTestOwnsStream = false;
    } else {
      stream = await getUserMediaSafe({
        audio: buildAudioConstraints(),
        video: false,
      });
      micTestOwnsStream = true;
    }

    micTestStream = stream;

    if (!micTestAudio) {
      micTestAudio = document.createElement("audio");
      micTestAudio.autoplay = true;
    }

    micTestAudio.volume = outputMuted ? 0 : outputVolumeLevel;
    micTestAudio.srcObject = stream;

    try {
      await micTestAudio.play();
    } catch {
      // no-op
    }

    micTestActive = true;
    deps.setVoiceState("Mikrofon testi aktif", false);
    return true;
  };

  const onLobbyUpdated = async (): Promise<void> => {
    remoteMediaUi.syncRemoteVideoSlots();

    const selfUserId = deps.getSelfUserId();
    if (selfUserId) {
      remoteMediaUi.updateRemoteLabel({
        key: "local:camera",
        userId: selfUserId,
        kind: "video",
        sourceType: "camera",
      });
      remoteMediaUi.updateRemoteLabel({
        key: "local:screen",
        userId: selfUserId,
        kind: "video",
        sourceType: "screen",
      });
    }

    refreshLiveKitLabels();
  };

  const onMemberLeft = (userId: string): void => {
    removeLiveKitParticipantTracks(userId);
    emitLiveKitLobbySnapshot();
  };

  const handleIncomingSignal = async (
    _payload: RtcSignalPayload,
  ): Promise<void> => {
    // LiveKit uses its own signaling channel; desktop RTC relay is intentionally unused.
  };

  const handleProducerAvailable = async (_payload: {
    userId: string;
    producerId: string;
    kind?: "audio" | "video";
    sourceType?: "microphone" | "camera" | "screen";
  }): Promise<void> => {
    // Legacy producer event channel is intentionally unused.
  };

  const handleProducerClosed = (_producerId: string): void => {
    // Legacy producer event channel is intentionally unused.
  };

  const toggleCameraShare = async (
    options?: CameraShareOptions,
  ): Promise<boolean> => {
    return toggleLiveKitCameraShare(options);
  };

  const toggleScreenShare = async (
    options?: ScreenShareOptions,
  ): Promise<boolean> => {
    return toggleLiveKitScreenShare(options);
  };

  const createCameraTestStream = async (
    options?: CameraShareOptions,
  ): Promise<MediaStream> => {
    return createCameraCaptureStream(options);
  };

  const createScreenTestStream = async (
    options?: ScreenShareOptions,
  ): Promise<MediaStream> => {
    return createScreenCaptureStream(options);
  };

  return {
    listMicrophones,
    setRnnoiseEnabled,
    syncMuteState,
    setSpeakingDetectionMode,
    setManualSpeakingThreshold,
    setOutputVolume,
    setOutputMuted,
    setInputGain,
    setRemoteParticipantAudioState,
    getRemoteParticipantAudioState,
    toggleMicTest,
    handleIncomingSignal,
    onLobbyUpdated,
    onMemberLeft,
    handleProducerAvailable,
    handleProducerClosed,
    toggleCameraShare,
    toggleScreenShare,
    createCameraTestStream,
    createScreenTestStream,
    shutdownMedia,
    startVoice,
    stopVoice,
    handleMicrophoneChange,
    cleanupForLobbyExit,
    destroy: cleanupForLobbyExit,
  };
};
