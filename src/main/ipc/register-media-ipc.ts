import { desktopCapturer, ipcMain } from "electron";
import { DesktopApiError } from "../backend-client";
import type {
  DesktopIpcModuleHelpers,
  RegisterDesktopIpcHandlersDeps,
} from "./ipc-module-types";

export const registerMediaIpcHandlers = (
  deps: RegisterDesktopIpcHandlersDeps,
  helpers: DesktopIpcModuleHelpers,
): void => {
  const parseMediaListCaptureSourcesPayload = (
    payload: unknown,
  ): { kinds: Array<"screen" | "window"> } => {
    if (payload === undefined || payload === null) {
      return { kinds: ["screen", "window"] };
    }

    const source = helpers.ensureObject(payload, "payload");
    const kindsValue = source.kinds;
    if (kindsValue === undefined) {
      return { kinds: ["screen", "window"] };
    }

    if (!Array.isArray(kindsValue)) {
      throw new DesktopApiError(
        "VALIDATION_ERROR",
        400,
        "kinds must be an array",
      );
    }

    const normalizedKinds = kindsValue.filter(
      (item): item is "screen" | "window" =>
        item === "screen" || item === "window",
    );

    if (normalizedKinds.length === 0) {
      throw new DesktopApiError(
        "VALIDATION_ERROR",
        400,
        "kinds must include screen or window",
      );
    }

    return { kinds: normalizedKinds };
  };

  const parseMediaCreateTransportPayload = (
    payload: unknown,
  ): { direction: "send" | "recv" } => {
    const source = helpers.ensureObject(payload, "payload");
    const direction = source.direction;
    if (direction !== "send" && direction !== "recv") {
      throw new DesktopApiError(
        "VALIDATION_ERROR",
        400,
        "direction must be send or recv",
      );
    }

    return { direction };
  };

  const parseMediaConnectTransportPayload = (
    payload: unknown,
  ): { transportId: string; dtlsParameters: unknown } => {
    const source = helpers.ensureObject(payload, "payload");
    const transportId = helpers.ensureValidString(
      source.transportId,
      "transportId",
      8,
    );
    if (source.dtlsParameters === undefined) {
      throw new DesktopApiError(
        "VALIDATION_ERROR",
        400,
        "dtlsParameters is required",
      );
    }

    return {
      transportId,
      dtlsParameters: source.dtlsParameters,
    };
  };

  const parseMediaCreateProducerPayload = (
    payload: unknown,
  ): {
    transportId: string;
    kind: "audio" | "video";
    sourceType?: "microphone" | "camera" | "screen";
    rtpParameters: unknown;
  } => {
    const source = helpers.ensureObject(payload, "payload");
    const transportId = helpers.ensureValidString(
      source.transportId,
      "transportId",
      8,
    );
    const kind = source.kind;
    if (kind !== "audio" && kind !== "video") {
      throw new DesktopApiError(
        "VALIDATION_ERROR",
        400,
        "kind must be audio or video",
      );
    }

    const sourceType = source.sourceType;
    if (
      sourceType !== undefined &&
      sourceType !== "microphone" &&
      sourceType !== "camera" &&
      sourceType !== "screen"
    ) {
      throw new DesktopApiError(
        "VALIDATION_ERROR",
        400,
        "sourceType must be microphone, camera, or screen",
      );
    }

    if (kind === "audio" && sourceType && sourceType !== "microphone") {
      throw new DesktopApiError(
        "VALIDATION_ERROR",
        400,
        "audio producers can only use sourceType=microphone",
      );
    }

    if (kind === "video" && sourceType === "microphone") {
      throw new DesktopApiError(
        "VALIDATION_ERROR",
        400,
        "video producers cannot use sourceType=microphone",
      );
    }

    if (source.rtpParameters === undefined) {
      throw new DesktopApiError(
        "VALIDATION_ERROR",
        400,
        "rtpParameters is required",
      );
    }

    return {
      transportId,
      kind,
      sourceType: sourceType ?? (kind === "audio" ? "microphone" : "camera"),
      rtpParameters: source.rtpParameters,
    };
  };

  const parseMediaCreateConsumerPayload = (
    payload: unknown,
  ): { transportId: string; producerId: string; rtpCapabilities: unknown } => {
    const source = helpers.ensureObject(payload, "payload");
    const transportId = helpers.ensureValidString(
      source.transportId,
      "transportId",
      8,
    );
    const producerId = helpers.ensureValidString(
      source.producerId,
      "producerId",
      8,
    );
    if (source.rtpCapabilities === undefined) {
      throw new DesktopApiError(
        "VALIDATION_ERROR",
        400,
        "rtpCapabilities is required",
      );
    }

    return {
      transportId,
      producerId,
      rtpCapabilities: source.rtpCapabilities,
    };
  };

  const parseMediaResumeConsumerPayload = (
    payload: unknown,
  ): { consumerId: string } => {
    const source = helpers.ensureObject(payload, "payload");
    return {
      consumerId: helpers.ensureValidString(source.consumerId, "consumerId", 8),
    };
  };

  const parseMediaCreateLiveKitTokenPayload = (
    payload: unknown,
  ): { room?: string } => {
    if (payload === undefined || payload === null) {
      return {};
    }

    const source = helpers.ensureObject(payload, "payload");
    const roomRaw = source.room;

    if (roomRaw === undefined) {
      return {};
    }

    if (typeof roomRaw !== "string") {
      throw new DesktopApiError(
        "VALIDATION_ERROR",
        400,
        "room must be a string",
      );
    }

    const room = roomRaw.trim();
    if (room.length === 0) {
      return {};
    }

    return { room };
  };

  ipcMain.handle("desktop:media-rtp-capabilities", async () => {
    try {
      const result = await helpers.withAccessToken(async (accessToken) => {
        return deps.backendClient.getMediaRtpCapabilities(accessToken);
      });

      return helpers.ok(result);
    } catch (error) {
      return helpers.fail<{ rtpCapabilities: unknown }>(error);
    }
  });

  ipcMain.handle(
    "desktop:media-create-transport",
    async (_event, payload: unknown) => {
      try {
        const parsed = parseMediaCreateTransportPayload(payload);
        const result = await helpers.withAccessToken(async (accessToken) => {
          return deps.backendClient.createMediaTransport(
            accessToken,
            parsed.direction,
          );
        });

        return helpers.ok(result);
      } catch (error) {
        return helpers.fail<{
          transport: {
            id: string;
            iceParameters: unknown;
            iceCandidates: unknown[];
            dtlsParameters: unknown;
          };
        }>(error);
      }
    },
  );

  ipcMain.handle(
    "desktop:media-connect-transport",
    async (_event, payload: unknown) => {
      try {
        const parsed = parseMediaConnectTransportPayload(payload);
        const result = await helpers.withAccessToken(async (accessToken) => {
          return deps.backendClient.connectMediaTransport(
            accessToken,
            parsed.transportId,
            parsed.dtlsParameters,
          );
        });

        return helpers.ok(result);
      } catch (error) {
        return helpers.fail<{ connected: boolean }>(error);
      }
    },
  );

  ipcMain.handle(
    "desktop:media-create-producer",
    async (_event, payload: unknown) => {
      try {
        const parsed = parseMediaCreateProducerPayload(payload);
        const result = await helpers.withAccessToken(async (accessToken) => {
          return deps.backendClient.createMediaProducer(accessToken, parsed);
        });

        return helpers.ok(result);
      } catch (error) {
        return helpers.fail<{
          producerId: string;
          kind: "audio" | "video";
          sourceType: "microphone" | "camera" | "screen";
        }>(error);
      }
    },
  );

  ipcMain.handle("desktop:media-list-producers", async () => {
    try {
      const result = await helpers.withAccessToken(async (accessToken) => {
        return deps.backendClient.listMediaProducers(accessToken);
      });

      return helpers.ok(result);
    } catch (error) {
      return helpers.fail<{
        producers: Array<{
          peerId: string;
          producerId: string;
          kind: "audio" | "video";
          sourceType: "microphone" | "camera" | "screen";
        }>;
      }>(error);
    }
  });

  ipcMain.handle(
    "desktop:media-list-capture-sources",
    async (_event, payload: unknown) => {
      try {
        const parsed = parseMediaListCaptureSourcesPayload(payload);
        const sources = await desktopCapturer.getSources({
          types: parsed.kinds,
          thumbnailSize: {
            width: 480,
            height: 270,
          },
          fetchWindowIcons: true,
        });

        return helpers.ok({
          sources: sources.map((source) => ({
            id: source.id,
            name: source.name,
            kind: source.id.startsWith("screen:") ? "screen" : "window",
            displayId: source.display_id || null,
            thumbnailDataUrl: source.thumbnail.isEmpty()
              ? null
              : source.thumbnail.toDataURL(),
          })),
        });
      } catch (error) {
        return helpers.fail<{
          sources: Array<{
            id: string;
            name: string;
            kind: "screen" | "window";
            displayId: string | null;
            thumbnailDataUrl: string | null;
          }>;
        }>(error);
      }
    },
  );

  ipcMain.handle(
    "desktop:media-create-consumer",
    async (_event, payload: unknown) => {
      try {
        const parsed = parseMediaCreateConsumerPayload(payload);
        const result = await helpers.withAccessToken(async (accessToken) => {
          return deps.backendClient.createMediaConsumer(accessToken, parsed);
        });

        return helpers.ok(result);
      } catch (error) {
        return helpers.fail<{
          consumer: {
            id: string;
            producerId: string;
            kind: "audio" | "video";
            rtpParameters: unknown;
            type: string;
            producerPaused: boolean;
          };
        }>(error);
      }
    },
  );

  ipcMain.handle(
    "desktop:media-resume-consumer",
    async (_event, payload: unknown) => {
      try {
        const parsed = parseMediaResumeConsumerPayload(payload);
        const result = await helpers.withAccessToken(async (accessToken) => {
          return deps.backendClient.resumeMediaConsumer(
            accessToken,
            parsed.consumerId,
          );
        });

        return helpers.ok(result);
      } catch (error) {
        return helpers.fail<{ resumed: boolean }>(error);
      }
    },
  );

  ipcMain.handle(
    "desktop:media-livekit-token",
    async (_event, payload: unknown) => {
      try {
        const parsed = parseMediaCreateLiveKitTokenPayload(payload);
        const result = await helpers.withAccessToken(async (accessToken) => {
          return deps.backendClient.createLiveKitToken(
            accessToken,
            parsed.room,
          );
        });

        return helpers.ok(result);
      } catch (error) {
        return helpers.fail<{
          serverUrl: string;
          room: string;
          identity: string;
          name: string;
          token: string;
          expiresAt: string;
          mediaPolicy?: {
            qualityProfile?: "balanced" | "high" | "low-bandwidth";
            preferredVideoCodec: string;
            backupVideoCodec: string;
            cameraMaxBitrate: number;
            cameraMaxFps: number;
            screenMaxBitrate: number;
            screenMaxFps: number;
            simulcast: boolean;
            dynacast: boolean;
          };
        }>(error);
      }
    },
  );
};
