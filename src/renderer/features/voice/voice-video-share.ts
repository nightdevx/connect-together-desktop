import {
  getDesktopSourceMediaSafe,
  getDisplayMediaSafe,
  getUserMediaSafe,
  stopMediaStream,
  type VideoCaptureQuality,
} from "./voice-media-utils";

export interface CameraShareOptions {
  quality?: VideoCaptureQuality;
}

export interface ScreenShareOptions {
  sourceId?: string;
  quality?: VideoCaptureQuality;
}

export interface LocalVideoShareController {
  toggleCameraShare: (options?: CameraShareOptions) => Promise<boolean>;
  toggleScreenShare: (options?: ScreenShareOptions) => Promise<boolean>;
  createCameraTestStream: (
    options?: CameraShareOptions,
  ) => Promise<MediaStream>;
  createScreenTestStream: (
    options?: ScreenShareOptions,
  ) => Promise<MediaStream>;
  stopCameraShare: (notify?: boolean) => void;
  stopScreenShare: (notify?: boolean) => void;
  stopAllShares: (notify?: boolean) => void;
}

interface CreateLocalVideoShareControllerDeps {
  ensureReady: () => Promise<void>;
  getSendTransport: () => any;
  setVoiceState: (message: string, isError: boolean) => void;
  onCameraShareChanged?: (enabled: boolean) => void;
  onScreenShareChanged?: (enabled: boolean) => void;
  onLocalSharePreviewChanged?: (payload: {
    sourceType: "camera" | "screen";
    stream: MediaStream | null;
  }) => void;
}

export const createLocalVideoShareController = (
  deps: CreateLocalVideoShareControllerDeps,
): LocalVideoShareController => {
  const DEFAULT_CAMERA_QUALITY: VideoCaptureQuality = {
    width: 1280,
    height: 720,
    fps: 30,
  };

  const DEFAULT_SCREEN_QUALITY: VideoCaptureQuality = {
    width: 1920,
    height: 1080,
    fps: 30,
  };

  let localCameraProducer: any = null;
  let localScreenProducer: any = null;
  let localCameraStream: MediaStream | null = null;
  let localScreenStream: MediaStream | null = null;

  const resolveCameraQuality = (
    options?: CameraShareOptions,
  ): VideoCaptureQuality => {
    return options?.quality ?? DEFAULT_CAMERA_QUALITY;
  };

  const resolveScreenQuality = (
    options?: ScreenShareOptions,
  ): VideoCaptureQuality => {
    return options?.quality ?? DEFAULT_SCREEN_QUALITY;
  };

  const toStableScreenQuality = (
    quality: VideoCaptureQuality,
  ): VideoCaptureQuality => {
    return {
      width: Math.min(Math.max(quality.width, 960), 1920),
      height: Math.min(Math.max(quality.height, 540), 1080),
      fps: Math.min(Math.max(quality.fps, 10), 30),
    };
  };

  const buildScreenQualityFallbackChain = (
    quality: VideoCaptureQuality,
  ): VideoCaptureQuality[] => {
    const stable = toStableScreenQuality(quality);
    const candidates: VideoCaptureQuality[] = [
      stable,
      {
        width: Math.min(stable.width, 1920),
        height: Math.min(stable.height, 1080),
        fps: Math.min(stable.fps, 30),
      },
      {
        width: Math.min(stable.width, 1600),
        height: Math.min(stable.height, 900),
        fps: Math.min(stable.fps, 24),
      },
      {
        width: Math.min(stable.width, 1280),
        height: Math.min(stable.height, 720),
        fps: Math.min(stable.fps, 20),
      },
    ];

    const seen = new Set<string>();
    return candidates.filter((item) => {
      const key = `${item.width}x${item.height}@${item.fps}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  };

  const createCameraCaptureStream = async (
    options?: CameraShareOptions,
  ): Promise<MediaStream> => {
    const quality = resolveCameraQuality(options);
    return getUserMediaSafe({
      video: {
        width: { ideal: quality.width, max: quality.width },
        height: { ideal: quality.height, max: quality.height },
        frameRate: { ideal: quality.fps, max: quality.fps },
      },
      audio: false,
    });
  };

  const createScreenCaptureStream = async (
    options?: ScreenShareOptions,
  ): Promise<MediaStream> => {
    const requestedQuality = resolveScreenQuality(options);
    const qualityChain = buildScreenQualityFallbackChain(requestedQuality);
    const stableQuality =
      qualityChain[0] ?? toStableScreenQuality(requestedQuality);

    if (options?.sourceId) {
      let lastError: unknown = null;
      for (const [index, quality] of qualityChain.entries()) {
        try {
          const stream = await getDesktopSourceMediaSafe({
            sourceId: options.sourceId,
            quality,
          });
          if (index > 0) {
            deps.setVoiceState(
              `Ekran paylaşımı stabil profil ile başladı (${quality.width}x${quality.height} @ ${quality.fps}fps)`,
              false,
            );
          }
          return stream;
        } catch (error) {
          lastError = error;
        }
      }

      const message =
        lastError instanceof Error ? lastError.message : "bilinmeyen hata";
      throw new Error(
        `Ekran yakalama başlatılamadı (${message}). Çözünürlük/FPS düşürüp tekrar deneyin.`,
      );
    }

    try {
      return await getDisplayMediaSafe({
        video: {
          width: { ideal: stableQuality.width, max: stableQuality.width },
          height: { ideal: stableQuality.height, max: stableQuality.height },
          frameRate: { ideal: stableQuality.fps, max: stableQuality.fps },
        },
        audio: false,
      });
    } catch {
      return getDisplayMediaSafe({
        video: {
          width: { ideal: 1280, max: 1280 },
          height: { ideal: 720, max: 720 },
          frameRate: { ideal: 15, max: 20 },
        },
        audio: false,
      });
    }
  };

  const emitCameraShareChanged = (enabled: boolean): void => {
    deps.onCameraShareChanged?.(enabled);
  };

  const emitScreenShareChanged = (enabled: boolean): void => {
    deps.onScreenShareChanged?.(enabled);
  };

  const emitLocalSharePreview = (
    sourceType: "camera" | "screen",
    stream: MediaStream | null,
  ): void => {
    deps.onLocalSharePreviewChanged?.({ sourceType, stream });
  };

  const getSendTransportOrThrow = (): any => {
    const sendTransport = deps.getSendTransport();
    if (!sendTransport) {
      throw new Error(
        "Kamera ve ekran paylasimi icin gonderim hatti hazir degil",
      );
    }

    return sendTransport;
  };

  const stopCameraShare = (notify = true): void => {
    const producer = localCameraProducer;
    localCameraProducer = null;
    if (producer) {
      try {
        producer.close();
      } catch {
        // no-op
      }
    }

    stopMediaStream(localCameraStream);
    localCameraStream = null;
    emitLocalSharePreview("camera", null);

    if (notify) {
      emitCameraShareChanged(false);
    }
  };

  const stopScreenShare = (notify = true): void => {
    const producer = localScreenProducer;
    localScreenProducer = null;
    if (producer) {
      try {
        producer.close();
      } catch {
        // no-op
      }
    }

    stopMediaStream(localScreenStream);
    localScreenStream = null;
    emitLocalSharePreview("screen", null);

    if (notify) {
      emitScreenShareChanged(false);
    }
  };

  const startCameraShare = async (
    options?: CameraShareOptions,
  ): Promise<void> => {
    if (localCameraProducer && !localCameraProducer.closed) {
      emitCameraShareChanged(true);
      emitLocalSharePreview("camera", localCameraStream);
      return;
    }

    await deps.ensureReady();
    const sendTransport = getSendTransportOrThrow();

    const stream = await createCameraCaptureStream(options);

    const track = stream.getVideoTracks()[0];
    if (!track) {
      stopMediaStream(stream);
      throw new Error("kamera izi alinamadi");
    }

    try {
      const producer = await sendTransport.produce({
        track,
        appData: { sourceType: "camera" },
      });

      localCameraStream = stream;
      localCameraProducer = producer;
      emitCameraShareChanged(true);
      emitLocalSharePreview("camera", stream);

      producer.on("transportclose", () => {
        if (localCameraProducer === producer) {
          stopCameraShare();
        }
      });

      producer.on("trackended", () => {
        if (localCameraProducer === producer) {
          stopCameraShare();
          deps.setVoiceState("Kamera paylasimi sonlandi", false);
        }
      });
    } catch (error) {
      stopMediaStream(stream);
      throw error;
    }
  };

  const startScreenShare = async (
    options?: ScreenShareOptions,
  ): Promise<void> => {
    if (localScreenProducer && !localScreenProducer.closed) {
      emitScreenShareChanged(true);
      emitLocalSharePreview("screen", localScreenStream);
      return;
    }

    await deps.ensureReady();
    const sendTransport = getSendTransportOrThrow();

    const stream = await createScreenCaptureStream(options);

    const track = stream.getVideoTracks()[0];
    if (!track) {
      stopMediaStream(stream);
      throw new Error("ekran izi alinamadi");
    }

    const requestedQuality = resolveScreenQuality(options);
    const stableQuality = toStableScreenQuality(requestedQuality);

    try {
      track.contentHint = "detail";
    } catch {
      // no-op
    }

    try {
      const producer = await sendTransport.produce({
        track,
        appData: { sourceType: "screen" },
        encodings: [
          {
            maxBitrate: Math.max(
              1_200_000,
              Math.min(4_500_000, stableQuality.width * stableQuality.height),
            ),
            maxFramerate: stableQuality.fps,
          },
        ],
        codecOptions: {
          videoGoogleStartBitrate: 1200,
        },
      });

      localScreenStream = stream;
      localScreenProducer = producer;
      emitScreenShareChanged(true);
      emitLocalSharePreview("screen", stream);

      producer.on("transportclose", () => {
        if (localScreenProducer === producer) {
          stopScreenShare();
        }
      });

      producer.on("trackended", () => {
        if (localScreenProducer === producer) {
          stopScreenShare();
          deps.setVoiceState("Ekran paylasimi sonlandi", false);
        }
      });
    } catch (error) {
      stopMediaStream(stream);
      throw error;
    }
  };

  const toggleCameraShare = async (
    options?: CameraShareOptions,
  ): Promise<boolean> => {
    if (localCameraProducer && !localCameraProducer.closed) {
      stopCameraShare();
      return false;
    }

    await startCameraShare(options);
    return true;
  };

  const toggleScreenShare = async (
    options?: ScreenShareOptions,
  ): Promise<boolean> => {
    if (localScreenProducer && !localScreenProducer.closed) {
      stopScreenShare();
      return false;
    }

    await startScreenShare(options);
    return true;
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

  const stopAllShares = (notify = true): void => {
    stopCameraShare(notify);
    stopScreenShare(notify);
  };

  return {
    toggleCameraShare,
    toggleScreenShare,
    createCameraTestStream,
    createScreenTestStream,
    stopCameraShare,
    stopScreenShare,
    stopAllShares,
  };
};
