import type { LoginRequest, RegisterRequest } from "../../shared/contracts";
import { ipcMain } from "electron";
import type {
  DesktopIpcModuleHelpers,
  RegisterDesktopIpcHandlersDeps,
} from "./ipc-module-types";

export const registerAuthIpcHandlers = (
  deps: RegisterDesktopIpcHandlersDeps,
  helpers: DesktopIpcModuleHelpers,
): void => {
  const parseLoginPayload = (payload: unknown): LoginRequest => {
    const source = payload as Partial<LoginRequest>;
    return {
      username: helpers.ensureValidString(source.username, "username", 3),
      password: helpers.ensureValidString(source.password, "password", 8),
    };
  };

  const parseRegisterPayload = (payload: unknown): RegisterRequest => {
    const source = payload as Partial<RegisterRequest>;
    return {
      username: helpers.ensureValidString(source.username, "username", 3),
      password: helpers.ensureValidString(source.password, "password", 8),
    };
  };

  const parseProfilePayload = (payload: unknown) => {
    const source = helpers.ensureObject(payload, "profile payload");
    const displayName = helpers.ensureValidString(
      source.displayName,
      "displayName",
      3,
    );

    const emailRaw =
      typeof source.email === "string" ? source.email.trim() : "";
    const email = emailRaw.length > 0 ? emailRaw : null;

    const bioRaw = typeof source.bio === "string" ? source.bio.trim() : "";
    const bio = bioRaw.length > 0 ? bioRaw : null;

    return {
      displayName,
      email,
      bio,
    };
  };

  const parseChangePasswordPayload = (payload: unknown) => {
    const source = helpers.ensureObject(payload, "password payload");
    return {
      currentPassword: helpers.ensureValidString(
        source.currentPassword,
        "currentPassword",
        8,
      ),
      newPassword: helpers.ensureValidString(
        source.newPassword,
        "newPassword",
        8,
      ),
    };
  };

  ipcMain.handle("desktop:get-version", () => {
    return deps.getAppVersion();
  });

  ipcMain.handle("desktop:get-runtime-config", () => {
    return deps.getRuntimeConfig();
  });

  ipcMain.handle("desktop:auth-register", async (_event, payload: unknown) => {
    try {
      const parsed = parseRegisterPayload(payload);
      const result = await deps.backendClient.register(parsed);
      helpers.persistAuthResult(result);
      return helpers.ok(helpers.getSessionSnapshot());
    } catch (error) {
      return helpers.fail(error);
    }
  });

  ipcMain.handle("desktop:auth-login", async (_event, payload: unknown) => {
    try {
      const parsed = parseLoginPayload(payload);
      const result = await deps.backendClient.login(parsed);
      helpers.persistAuthResult(result);
      return helpers.ok(helpers.getSessionSnapshot());
    } catch (error) {
      return helpers.fail(error);
    }
  });

  ipcMain.handle("desktop:auth-logout", async () => {
    helpers.setAutoJoinLobbyEnabled(false);
    helpers.clearSessionAndRealtime();
    return helpers.ok(helpers.getSessionSnapshot());
  });

  ipcMain.handle("desktop:auth-session", async () => {
    return helpers.ok(helpers.getSessionSnapshot());
  });

  ipcMain.handle("desktop:auth-profile", async () => {
    try {
      const result = await helpers.withAccessToken((accessToken) => {
        return deps.backendClient.getProfile(accessToken);
      });
      return helpers.ok(result);
    } catch (error) {
      return helpers.fail(error);
    }
  });

  ipcMain.handle("desktop:auth-users", async () => {
    try {
      const result = await helpers.withAccessToken((accessToken) => {
        return deps.backendClient.getRegisteredUsers(accessToken);
      });
      return helpers.ok(result);
    } catch (error) {
      return helpers.fail(error);
    }
  });

  ipcMain.handle(
    "desktop:auth-update-profile",
    async (_event, payload: unknown) => {
      try {
        const parsed = parseProfilePayload(payload);
        const result = await helpers.withAccessToken((accessToken) => {
          return deps.backendClient.updateProfile(accessToken, parsed);
        });
        return helpers.ok(result);
      } catch (error) {
        return helpers.fail(error);
      }
    },
  );

  ipcMain.handle(
    "desktop:auth-change-password",
    async (_event, payload: unknown) => {
      try {
        const parsed = parseChangePasswordPayload(payload);
        const result = await helpers.withAccessToken((accessToken) => {
          return deps.backendClient.changePassword(accessToken, parsed);
        });
        return helpers.ok(result);
      } catch (error) {
        return helpers.fail(error);
      }
    },
  );

  ipcMain.handle("desktop:realtime-connect", async () => {
    try {
      helpers.connectRealtimeForCurrentSession();
      return helpers.ok({ connected: true });
    } catch (error) {
      return helpers.fail(error);
    }
  });
};
