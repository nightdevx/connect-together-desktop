import type { UserProfile } from "../../shared/contracts";
import { app, BrowserWindow, ipcMain } from "electron";
import { DesktopApiError } from "../backend-client";
import type { DesktopPreferences } from "../types";
import type { ApiErrorPayload, DesktopResult, SessionSnapshot } from "../types";
import { IPC_ERROR_CODES } from "./ipc-error-codes";
import type {
  DesktopIpcModuleHelpers,
  RegisterDesktopIpcHandlersDeps,
} from "./ipc-module-types";
import { registerAuthIpcHandlers } from "./register-auth-ipc";
import { registerLobbyIpcHandlers } from "./register-lobby-ipc";
import { registerMediaIpcHandlers } from "./register-media-ipc";

export const registerDesktopIpcHandlers = (
  deps: RegisterDesktopIpcHandlersDeps,
): void => {
  let shouldAutoJoinLobby = false;

  const toErrorPayload = (error: unknown): ApiErrorPayload => {
    if (error instanceof DesktopApiError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
      };
    }

    if (error instanceof Error) {
      return {
        code: IPC_ERROR_CODES.UNEXPECTED_ERROR,
        message: error.message,
        statusCode: 500,
      };
    }

    return {
      code: IPC_ERROR_CODES.UNEXPECTED_ERROR,
      message: "Unexpected desktop error",
      statusCode: 500,
    };
  };

  const ok = <T>(data: T): DesktopResult<T> => ({ ok: true, data });

  const fail = <T>(error: unknown): DesktopResult<T> => ({
    ok: false,
    error: toErrorPayload(error),
  });

  const getSessionSnapshot = (): SessionSnapshot => {
    const current = deps.sessionStore.get();
    if (!current) {
      return {
        authenticated: false,
        user: null,
      };
    }

    return {
      authenticated: true,
      user: current.user,
    };
  };

  const ensureValidString = (
    value: unknown,
    field: string,
    minLength: number,
    maxLength = 512,
  ): string => {
    if (typeof value !== "string") {
      throw new DesktopApiError(
        IPC_ERROR_CODES.VALIDATION_ERROR,
        400,
        `${field} must be a string`,
      );
    }

    const trimmed = value.trim();
    if (trimmed.length < minLength) {
      throw new DesktopApiError(
        IPC_ERROR_CODES.VALIDATION_ERROR,
        400,
        `${field} must be at least ${minLength} chars`,
      );
    }

    if (trimmed.length > maxLength) {
      throw new DesktopApiError(
        IPC_ERROR_CODES.VALIDATION_ERROR,
        400,
        `${field} must be at most ${maxLength} chars`,
      );
    }

    return trimmed;
  };

  const ensureObject = (
    value: unknown,
    field: string,
  ): Record<string, unknown> => {
    if (typeof value !== "object" || value === null) {
      throw new DesktopApiError(
        IPC_ERROR_CODES.VALIDATION_ERROR,
        400,
        `${field} must be an object`,
      );
    }

    return value as Record<string, unknown>;
  };

  const persistAuthResult = (result: {
    user: UserProfile;
    tokens: { accessToken: string; refreshToken: string };
  }): void => {
    deps.sessionStore.set({
      user: result.user,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
    });
  };

  const withAccessToken = async <T>(
    operation: (accessToken: string) => Promise<T>,
  ): Promise<T> => {
    const current = deps.sessionStore.get();
    if (!current) {
      throw new DesktopApiError(
        IPC_ERROR_CODES.UNAUTHORIZED,
        401,
        "No active session",
      );
    }

    try {
      return await operation(current.accessToken);
    } catch (error) {
      if (!(error instanceof DesktopApiError) || error.statusCode !== 401) {
        throw error;
      }

      const refreshed = await deps.backendClient.refresh(current.refreshToken);
      persistAuthResult(refreshed);
      if (deps.realtimeClient.isConnectedOrConnecting()) {
        connectRealtimeForCurrentSession();
      }
      return operation(refreshed.tokens.accessToken);
    }
  };

  const requireSession = (): void => {
    if (!deps.sessionStore.get()) {
      throw new DesktopApiError(
        IPC_ERROR_CODES.UNAUTHORIZED,
        401,
        "No active session",
      );
    }
  };

  const connectRealtimeForCurrentSession = (): void => {
    const current = deps.sessionStore.get();
    if (!current) {
      throw new DesktopApiError(
        IPC_ERROR_CODES.UNAUTHORIZED,
        401,
        "No active session",
      );
    }

    deps.realtimeClient.connect(current.accessToken, (event) => {
      if (
        event.type === "connection" &&
        event.status === "connected" &&
        shouldAutoJoinLobby
      ) {
        deps.emitRealtimeEvent({
          type: "lobby:auto-rejoin",
          message: "Bağlantı sonrası lobi üyeliği geri yüklendi",
        });
      }

      deps.emitRealtimeEvent(event);
    });
  };

  const ensureRealtimeConnected = (): void => {
    requireSession();
    if (!deps.realtimeClient.isConnectedOrConnecting()) {
      connectRealtimeForCurrentSession();
    }
  };

  const clearSessionAndRealtime = (): void => {
    deps.realtimeClient.disconnect();
    deps.sessionStore.clear();
  };

  const helpers: DesktopIpcModuleHelpers = {
    ok,
    fail,
    getSessionSnapshot,
    ensureValidString,
    ensureObject,
    persistAuthResult,
    withAccessToken,
    connectRealtimeForCurrentSession,
    ensureRealtimeConnected,
    isAutoJoinLobbyEnabled: () => shouldAutoJoinLobby,
    setAutoJoinLobbyEnabled: (value: boolean) => {
      shouldAutoJoinLobby = value;
    },
    clearSessionAndRealtime,
  };

  registerAuthIpcHandlers(deps, helpers);
  registerLobbyIpcHandlers(deps, helpers);
  registerMediaIpcHandlers(deps, helpers);

  ipcMain.handle("desktop:window-minimize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.minimize();
    }
  });

  ipcMain.handle("desktop:window-toggle-maximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) {
      return { isMaximized: false };
    }

    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }

    return { isMaximized: win.isMaximized() };
  });

  ipcMain.handle("desktop:window-close", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });

  ipcMain.handle("desktop:app-relaunch", async () => {
    try {
      app.relaunch();
      app.exit(0);
      return helpers.ok({ accepted: true });
    } catch (error) {
      return helpers.fail(error);
    }
  });

  ipcMain.handle("desktop:get-window-state", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return {
      isMaximized: win ? win.isMaximized() : false,
    };
  });

  ipcMain.handle("desktop:get-preferences", () => {
    return deps.getDesktopPreferences();
  });

  ipcMain.handle("desktop:update-preferences", (_event, payload: unknown) => {
    const source = helpers.ensureObject(
      payload,
      "preferences payload",
    ) as Partial<DesktopPreferences>;

    const patch: Partial<DesktopPreferences> = {};
    if (typeof source.closeToTrayOnClose === "boolean") {
      patch.closeToTrayOnClose = source.closeToTrayOnClose;
    }
    if (typeof source.launchAtStartup === "boolean") {
      patch.launchAtStartup = source.launchAtStartup;
    }
    if (typeof source.gpuAccelerationEnabled === "boolean") {
      patch.gpuAccelerationEnabled = source.gpuAccelerationEnabled;
    }

    return deps.updateDesktopPreferences(patch);
  });

  ipcMain.handle("desktop:update-state", () => {
    return deps.getUpdateState();
  });

  ipcMain.handle("desktop:update-check", async () => {
    try {
      const state = await deps.checkForUpdates();
      return helpers.ok({ state });
    } catch (error) {
      return helpers.fail(error);
    }
  });

  ipcMain.handle("desktop:update-apply", async () => {
    try {
      const result = await deps.applyUpdate();
      return helpers.ok(result);
    } catch (error) {
      return helpers.fail(error);
    }
  });
};
