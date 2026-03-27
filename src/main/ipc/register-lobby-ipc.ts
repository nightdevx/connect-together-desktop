import type { RtcSignalPayload } from "../../shared/contracts";
import { ipcMain } from "electron";
import { DesktopApiError, type LobbyStateResponse } from "../backend-client";
import { IPC_ERROR_CODES } from "./ipc-error-codes";
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
    const source = helpers.ensureObject(payload, "rtc signal payload");
    const toUserId = helpers.ensureValidString(
      source.toUserId,
      "toUserId",
      8,
      128,
    );

    if (toUserId.length < 8) {
      throw new DesktopApiError(
        IPC_ERROR_CODES.VALIDATION_ERROR,
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
        IPC_ERROR_CODES.VALIDATION_ERROR,
        400,
        "rtc signal type is invalid",
      );
    }

    if (source.data === undefined) {
      throw new DesktopApiError(
        IPC_ERROR_CODES.VALIDATION_ERROR,
        400,
        "rtc signal data is required",
      );
    }

    return {
      fromUserId,
      toUserId,
      type: source.type,
      data: source.data,
    };
  };

  ipcMain.handle("desktop:lobby-join", async () => {
    try {
      helpers.setAutoJoinLobbyEnabled(true);
      helpers.ensureRealtimeConnected();
      const backendJoin = await helpers.withAccessToken(async (accessToken) => {
        return deps.backendClient.joinLobby(accessToken);
      });
      return helpers.ok({ accepted: backendJoin.accepted === true });
    } catch (error) {
      helpers.setAutoJoinLobbyEnabled(false);
      return helpers.fail(error);
    }
  });

  ipcMain.handle("desktop:lobby-leave", async () => {
    try {
      helpers.setAutoJoinLobbyEnabled(false);
      let backendAccepted = true;

      try {
        const backendLeave = await helpers.withAccessToken(
          async (accessToken) => {
            return deps.backendClient.leaveLobby(accessToken);
          },
        );
        backendAccepted = backendLeave.accepted === true;
      } catch (error) {
        if (
          !(error instanceof DesktopApiError) ||
          (error.statusCode !== 401 && error.code !== "INVALID_REFRESH_TOKEN")
        ) {
          throw error;
        }
      }

      return helpers.ok({ accepted: backendAccepted });
    } catch (error) {
      return helpers.fail(error);
    }
  });

  ipcMain.handle("desktop:lobby-mute", async (_event, muted: unknown) => {
    try {
      if (typeof muted !== "boolean") {
        throw new DesktopApiError(
          IPC_ERROR_CODES.VALIDATION_ERROR,
          400,
          "muted must be a boolean",
        );
      }

      const result = await helpers.withAccessToken(async (accessToken) => {
        return deps.backendClient.setLobbyMute(accessToken, muted);
      });

      return helpers.ok({ accepted: result.accepted === true });
    } catch (error) {
      return helpers.fail(error);
    }
  });

  ipcMain.handle("desktop:lobby-deafen", async (_event, deafened: unknown) => {
    try {
      if (typeof deafened !== "boolean") {
        throw new DesktopApiError(
          IPC_ERROR_CODES.VALIDATION_ERROR,
          400,
          "deafened must be a boolean",
        );
      }

      const result = await helpers.withAccessToken(async (accessToken) => {
        return deps.backendClient.setLobbyDeafen(accessToken, deafened);
      });

      return helpers.ok({ accepted: result.accepted === true });
    } catch (error) {
      return helpers.fail(error);
    }
  });

  ipcMain.handle(
    "desktop:lobby-speaking",
    async (_event, speaking: unknown) => {
      try {
        if (typeof speaking !== "boolean") {
          throw new DesktopApiError(
            IPC_ERROR_CODES.VALIDATION_ERROR,
            400,
            "speaking must be a boolean",
          );
        }

        const result = await helpers.withAccessToken(async (accessToken) => {
          return deps.backendClient.setLobbySpeaking(accessToken, speaking);
        });

        return helpers.ok({ accepted: result.accepted === true });
      } catch (error) {
        return helpers.fail(error);
      }
    },
  );

  ipcMain.handle("desktop:rtc-signal", async (_event, payload: unknown) => {
    try {
      const session = deps.sessionStore.get();
      if (!session) {
        throw new DesktopApiError(
          IPC_ERROR_CODES.UNAUTHORIZED,
          401,
          "No active session",
        );
      }

      helpers.ensureRealtimeConnected();
      parseOutgoingRtcSignal(payload, session.user.id);
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
