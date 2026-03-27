import type { RtcSignalPayload } from "../../shared/contracts";
import { ipcMain } from "electron";
import { DesktopApiError, type LobbyStateResponse } from "../backend-client";
import type {
  DesktopIpcModuleHelpers,
  RegisterDesktopIpcHandlersDeps,
} from "./ipc-module-types";

export const registerLobbyIpcHandlers = (
  deps: RegisterDesktopIpcHandlersDeps,
  helpers: DesktopIpcModuleHelpers,
): void => {
  const parseOutgoingRtcSignal = (
    payload: unknown,
    fromUserId: string,
  ): RtcSignalPayload => {
    const source = payload as Partial<RtcSignalPayload>;
    if (typeof source.toUserId !== "string" || source.toUserId.length < 8) {
      throw new DesktopApiError(
        "VALIDATION_ERROR",
        400,
        "toUserId is required",
      );
    }

    if (
      source.type !== "offer" &&
      source.type !== "answer" &&
      source.type !== "ice-candidate"
    ) {
      throw new DesktopApiError(
        "VALIDATION_ERROR",
        400,
        "rtc signal type is invalid",
      );
    }

    if (source.data === undefined) {
      throw new DesktopApiError(
        "VALIDATION_ERROR",
        400,
        "rtc signal data is required",
      );
    }

    return {
      fromUserId,
      toUserId: source.toUserId,
      type: source.type,
      data: source.data,
    };
  };

  ipcMain.handle("desktop:lobby-join", async () => {
    try {
      helpers.setAutoJoinLobbyEnabled(true);
      helpers.ensureRealtimeConnected();
      deps.realtimeClient.joinLobby();
      return helpers.ok({ accepted: true });
    } catch (error) {
      helpers.setAutoJoinLobbyEnabled(false);
      return helpers.fail(error);
    }
  });

  ipcMain.handle("desktop:lobby-leave", async () => {
    try {
      helpers.setAutoJoinLobbyEnabled(false);
      if (deps.realtimeClient.isConnected()) {
        deps.realtimeClient.leaveLobby();
      }
      return helpers.ok({ accepted: true });
    } catch (error) {
      return helpers.fail(error);
    }
  });

  ipcMain.handle("desktop:lobby-mute", async (_event, muted: unknown) => {
    try {
      if (typeof muted !== "boolean") {
        throw new DesktopApiError(
          "VALIDATION_ERROR",
          400,
          "muted must be a boolean",
        );
      }

      helpers.ensureRealtimeConnected();
      deps.realtimeClient.setMute(muted);
      return helpers.ok({ accepted: true });
    } catch (error) {
      return helpers.fail(error);
    }
  });

  ipcMain.handle("desktop:lobby-deafen", async (_event, deafened: unknown) => {
    try {
      if (typeof deafened !== "boolean") {
        throw new DesktopApiError(
          "VALIDATION_ERROR",
          400,
          "deafened must be a boolean",
        );
      }

      helpers.ensureRealtimeConnected();
      deps.realtimeClient.setDeafened(deafened);
      return helpers.ok({ accepted: true });
    } catch (error) {
      return helpers.fail(error);
    }
  });

  ipcMain.handle("desktop:lobby-speaking", async (_event, speaking: unknown) => {
    try {
      if (typeof speaking !== "boolean") {
        throw new DesktopApiError(
          "VALIDATION_ERROR",
          400,
          "speaking must be a boolean",
        );
      }

      helpers.ensureRealtimeConnected();
      deps.realtimeClient.setSpeaking(speaking);
      return helpers.ok({ accepted: true });
    } catch (error) {
      return helpers.fail(error);
    }
  });

  ipcMain.handle("desktop:rtc-signal", async (_event, payload: unknown) => {
    try {
      const session = deps.sessionStore.get();
      if (!session) {
        throw new DesktopApiError("UNAUTHORIZED", 401, "No active session");
      }

      helpers.ensureRealtimeConnected();
      const safePayload = parseOutgoingRtcSignal(payload, session.user.id);
      deps.realtimeClient.sendSignal(safePayload);
      return helpers.ok({ accepted: true });
    } catch (error) {
      return helpers.fail(error);
    }
  });

  ipcMain.handle("desktop:lobby-state", async () => {
    try {
      const lobby = await helpers.withAccessToken(async (accessToken) => {
        return deps.backendClient.getLobbyState(accessToken);
      });

      return helpers.ok<LobbyStateResponse>(lobby);
    } catch (error) {
      if (
        error instanceof DesktopApiError &&
        (error.code === "INVALID_REFRESH_TOKEN" || error.statusCode === 401)
      ) {
        helpers.setAutoJoinLobbyEnabled(false);
        helpers.clearSessionAndRealtime();
      }

      return helpers.fail<LobbyStateResponse>(error);
    }
  });
};
