import type { RtcSignalPayload } from "../../shared/contracts";
import { ipcMain } from "electron";
import {
  DesktopApiError,
  type LobbyCreateResponse,
  type LobbyDeleteResponse,
  type LobbyChatListResponse,
  type LobbyChatSendResponse,
  type LobbyListResponse,
  type LobbyStateResponse,
  type LobbyUpdateResponse,
} from "../backend-client";
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

  const parseLobbySelectionPayload = (
    payload: unknown,
  ): { lobbyId: string } => {
    const source = helpers.ensureObject(payload, "lobby selection payload");
    return {
      lobbyId: helpers.ensureValidString(source.lobbyId, "lobbyId", 3, 64),
    };
  };

  const parseLobbyCreatePayload = (payload: unknown): { name: string } => {
    const source = helpers.ensureObject(payload, "lobby create payload");
    return {
      name: helpers.ensureValidString(source.name, "name", 3, 64),
    };
  };

  const parseLobbyUpdatePayload = (
    payload: unknown,
  ): { lobbyId: string; name: string } => {
    const source = helpers.ensureObject(payload, "lobby update payload");
    return {
      lobbyId: helpers.ensureValidString(source.lobbyId, "lobbyId", 3, 64),
      name: helpers.ensureValidString(source.name, "name", 3, 64),
    };
  };

  const parseLobbyDeletePayload = (payload: unknown): { lobbyId: string } => {
    const source = helpers.ensureObject(payload, "lobby delete payload");
    return {
      lobbyId: helpers.ensureValidString(source.lobbyId, "lobbyId", 3, 64),
    };
  };

  ipcMain.handle("desktop:lobbies-list", async () => {
    try {
      const response = await helpers.withAccessToken(async (accessToken) => {
        return deps.backendClient.listLobbies(accessToken);
      });

      return helpers.ok<LobbyListResponse>(response);
    } catch (error) {
      return helpers.fail<LobbyListResponse>(error);
    }
  });

  ipcMain.handle("desktop:lobbies-create", async (_event, payload: unknown) => {
    try {
      const parsed = parseLobbyCreatePayload(payload);
      const response = await helpers.withAccessToken(async (accessToken) => {
        return deps.backendClient.createLobby(accessToken, parsed.name);
      });

      return helpers.ok<LobbyCreateResponse>(response);
    } catch (error) {
      return helpers.fail<LobbyCreateResponse>(error);
    }
  });

  ipcMain.handle("desktop:lobbies-update", async (_event, payload: unknown) => {
    try {
      const parsed = parseLobbyUpdatePayload(payload);
      const response = await helpers.withAccessToken(async (accessToken) => {
        return deps.backendClient.updateLobby(
          accessToken,
          parsed.lobbyId,
          parsed.name,
        );
      });

      return helpers.ok<LobbyUpdateResponse>(response);
    } catch (error) {
      return helpers.fail<LobbyUpdateResponse>(error);
    }
  });

  ipcMain.handle("desktop:lobbies-delete", async (_event, payload: unknown) => {
    try {
      const parsed = parseLobbyDeletePayload(payload);
      const response = await helpers.withAccessToken(async (accessToken) => {
        return deps.backendClient.deleteLobby(accessToken, parsed.lobbyId);
      });

      if (
        response.deleted === true &&
        parsed.lobbyId.trim() === helpers.getActiveLobbyId()
      ) {
        helpers.setActiveLobbyId(deps.getRuntimeConfig().liveKitDefaultRoom);
      }

      return helpers.ok<LobbyDeleteResponse>(response);
    } catch (error) {
      return helpers.fail<LobbyDeleteResponse>(error);
    }
  });

  ipcMain.handle("desktop:lobby-select", async (_event, payload: unknown) => {
    try {
      const parsed = parseLobbySelectionPayload(payload);
      helpers.setActiveLobbyId(parsed.lobbyId);
      helpers.setAutoJoinLobbyEnabled(false);
      helpers.ensureRealtimeConnected();
      return helpers.ok({ lobbyId: helpers.getActiveLobbyId() });
    } catch (error) {
      return helpers.fail<{ lobbyId: string }>(error);
    }
  });

  ipcMain.handle("desktop:lobby-active", async () => {
    try {
      return helpers.ok({ lobbyId: helpers.getActiveLobbyId() });
    } catch (error) {
      return helpers.fail<{ lobbyId: string }>(error);
    }
  });

  ipcMain.handle("desktop:lobby-join", async () => {
    try {
      helpers.setAutoJoinLobbyEnabled(true);
      helpers.ensureRealtimeConnected();
      const backendJoin = await helpers.withAccessToken(async (accessToken) => {
        return deps.backendClient.joinLobby(
          accessToken,
          helpers.getActiveLobbyId(),
        );
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
            return deps.backendClient.leaveLobby(
              accessToken,
              helpers.getActiveLobbyId(),
            );
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
        return deps.backendClient.setLobbyMute(
          accessToken,
          muted,
          helpers.getActiveLobbyId(),
        );
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
        return deps.backendClient.setLobbyDeafen(
          accessToken,
          deafened,
          helpers.getActiveLobbyId(),
        );
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
          return deps.backendClient.setLobbySpeaking(
            accessToken,
            speaking,
            helpers.getActiveLobbyId(),
          );
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
        return deps.backendClient.getLobbyStateFor(
          accessToken,
          helpers.getActiveLobbyId(),
        );
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

  ipcMain.handle(
    "desktop:lobby-state-by-id",
    async (_event, payload: unknown) => {
      try {
        const parsed = parseLobbySelectionPayload(payload);
        const lobby = await helpers.withAccessToken(async (accessToken) => {
          return deps.backendClient.getLobbyStateFor(
            accessToken,
            parsed.lobbyId,
          );
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
    },
  );

  ipcMain.handle(
    "desktop:chat-list-lobby-messages",
    async (_event, payload: unknown) => {
      try {
        let limit: number | undefined;

        if (payload !== undefined) {
          const source = helpers.ensureObject(payload, "chat list payload");
          if (source.limit !== undefined) {
            if (
              typeof source.limit !== "number" ||
              !Number.isFinite(source.limit)
            ) {
              throw new DesktopApiError(
                IPC_ERROR_CODES.VALIDATION_ERROR,
                400,
                "limit must be a number",
              );
            }

            limit = Math.max(1, Math.min(200, Math.floor(source.limit)));
          }
        }

        const response = await helpers.withAccessToken(async (accessToken) => {
          return deps.backendClient.listLobbyMessages(
            accessToken,
            helpers.getActiveLobbyId(),
            limit,
          );
        });

        return helpers.ok<LobbyChatListResponse>(response);
      } catch (error) {
        return helpers.fail<LobbyChatListResponse>(error);
      }
    },
  );

  ipcMain.handle(
    "desktop:chat-send-lobby-message",
    async (_event, payload: unknown) => {
      try {
        const source = helpers.ensureObject(payload, "chat send payload");
        const body = helpers.ensureValidString(source.body, "body", 1, 1200);

        const response = await helpers.withAccessToken(async (accessToken) => {
          return deps.backendClient.sendLobbyMessage(
            accessToken,
            helpers.getActiveLobbyId(),
            body,
          );
        });

        return helpers.ok<LobbyChatSendResponse>(response);
      } catch (error) {
        return helpers.fail<LobbyChatSendResponse>(error);
      }
    },
  );

  ipcMain.handle(
    "desktop:chat-list-direct-messages",
    async (_event, payload: unknown) => {
      try {
        const source = helpers.ensureObject(
          payload,
          "direct message list payload",
        );
        const peerUserId = helpers.ensureValidString(
          source.peerUserId,
          "peerUserId",
          3,
          128,
        );

        let limit: number | undefined;
        if (source.limit !== undefined) {
          if (
            typeof source.limit !== "number" ||
            !Number.isFinite(source.limit)
          ) {
            throw new DesktopApiError(
              IPC_ERROR_CODES.VALIDATION_ERROR,
              400,
              "limit must be a number",
            );
          }

          limit = Math.max(1, Math.min(200, Math.floor(source.limit)));
        }

        const response = await helpers.withAccessToken(async (accessToken) => {
          return deps.backendClient.listDirectMessages(
            accessToken,
            peerUserId,
            limit,
          );
        });

        return helpers.ok<LobbyChatListResponse>(response);
      } catch (error) {
        return helpers.fail<LobbyChatListResponse>(error);
      }
    },
  );

  ipcMain.handle(
    "desktop:chat-send-direct-message",
    async (_event, payload: unknown) => {
      try {
        const source = helpers.ensureObject(
          payload,
          "direct message send payload",
        );
        const peerUserId = helpers.ensureValidString(
          source.peerUserId,
          "peerUserId",
          3,
          128,
        );
        const body = helpers.ensureValidString(source.body, "body", 1, 1200);

        const response = await helpers.withAccessToken(async (accessToken) => {
          return deps.backendClient.sendDirectMessage(
            accessToken,
            peerUserId,
            body,
          );
        });

        return helpers.ok<LobbyChatSendResponse>(response);
      } catch (error) {
        return helpers.fail<LobbyChatSendResponse>(error);
      }
    },
  );
};
