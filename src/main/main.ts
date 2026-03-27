import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createDesktopAppUpdater } from "./app-updater";
import { BackendClient } from "./backend-client";
import {
  backendBaseUrl,
  desktopRtcConfig,
  liveKitDefaultRoom,
  loadedEnvPath,
} from "./config";
import { DesktopPreferencesStore } from "./desktop-preferences-store";
import { registerDesktopIpcHandlers } from "./ipc/register-desktop-ipc";
import { RealtimeClient } from "./realtime-client";
import { SessionStore } from "./session-store";
import type { DesktopUpdateState } from "./types";
import { createMainWindow } from "./window/create-main-window";
import { createUpdateInstallWindow } from "./window/create-update-install-window";

let mainWindow: BrowserWindow | null = null;
let updateInstallWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
const desktopPreferencesStore = new DesktopPreferencesStore();
const APP_USER_MODEL_ID = "com.nightdijital.connecttogether.desktop";

if (process.platform === "win32") {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

const applyGpuAccelerationPreference = (enabled: boolean): void => {
  if (!enabled) {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch("disable-gpu");
    return;
  }

  // Enable a conservative GPU pipeline for smoother camera/screen rendering.
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("enable-zero-copy");
  app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");
  app.commandLine.appendSwitch("enable-accelerated-video-decode");
  app.commandLine.appendSwitch("enable-accelerated-video-encode");
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
};

const initialDesktopPreferences = desktopPreferencesStore.get();
applyGpuAccelerationPreference(
  initialDesktopPreferences.gpuAccelerationEnabled,
);

console.log(
  `[desktop] backend base url resolved: ${backendBaseUrl} (env: ${loadedEnvPath ?? "none"})`,
);
console.log(
  `[desktop] gpu acceleration ${initialDesktopPreferences.gpuAccelerationEnabled ? "enabled" : "disabled"}`,
);

const backendClient = new BackendClient(backendBaseUrl);
const realtimeClient = new RealtimeClient(backendBaseUrl);
const sessionStore = new SessionStore();

const showUpdateInstallWindow = (): void => {
  if (updateInstallWindow && !updateInstallWindow.isDestroyed()) {
    updateInstallWindow.show();
    updateInstallWindow.focus();
    return;
  }

  updateInstallWindow = createUpdateInstallWindow();
  updateInstallWindow.on("closed", () => {
    updateInstallWindow = null;
  });
};

const appUpdater = createDesktopAppUpdater({
  onBeforeQuitAndInstall: () => {
    isQuitting = true;
    destroyTray();

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }

    showUpdateInstallWindow();
  },
});

const applyLaunchAtStartup = (enabled: boolean): void => {
  app.setLoginItemSettings({ openAtLogin: enabled });
};

const resolveLogoAssetPath = (fileName: "logo.png" | "logo.ico"): string => {
  const fallbackPath = path.join(process.cwd(), "public", "images", fileName);
  const candidates = [
    fallbackPath,
    path.join(process.cwd(), "dist", "renderer", "images", fileName),
    path.join(__dirname, "../renderer/images", fileName),
    path.join(app.getAppPath(), "public", "images", fileName),
    path.join(app.getAppPath(), "dist", "renderer", "images", fileName),
  ];

  for (const candidatePath of candidates) {
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return fallbackPath;
};

const resolveTrayLogoPath = (): string => {
  const preferredFiles: Array<"logo.png" | "logo.ico"> = [
    "logo.png",
    "logo.ico",
  ];

  for (const fileName of preferredFiles) {
    const candidatePath = resolveLogoAssetPath(fileName);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return resolveLogoAssetPath("logo.png");
};

const createTrayIcon = () => {
  let image = nativeImage.createFromPath(resolveTrayLogoPath());
  if (image.isEmpty()) {
    image = nativeImage.createFromPath(resolveLogoAssetPath("logo.ico"));
  }

  return image.resize({ width: 16, height: 16 });
};

const showMainWindow = async (): Promise<void> => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = await createMainWindow();
    bindCloseToTrayBehavior(mainWindow);
    mainWindow.on("closed", () => {
      mainWindow = null;
    });
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
};

const ensureTray = (): void => {
  if (tray) {
    return;
  }

  tray = new Tray(createTrayIcon());
  tray.setToolTip("Connect Together Desktop");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Uygulamayi Ac",
        click: () => {
          void showMainWindow();
        },
      },
      {
        label: "Cikis",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", () => {
    void showMainWindow();
  });
};

const destroyTray = (): void => {
  if (!tray) {
    return;
  }

  tray.destroy();
  tray = null;
};

const bindCloseToTrayBehavior = (win: BrowserWindow): void => {
  win.on("close", (event) => {
    const prefs = desktopPreferencesStore.get();
    if (isQuitting || !prefs.closeToTrayOnClose) {
      return;
    }

    event.preventDefault();
    ensureTray();
    win.hide();
  });
};

const emitRealtimeEvent = (payload: unknown): void => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("desktop:realtime-event", payload);
};

const emitUpdateEvent = (payload: DesktopUpdateState): void => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("desktop:update-event", payload);
};

appUpdater.onStateChanged((state) => {
  emitUpdateEvent(state);
});

registerDesktopIpcHandlers({
  backendClient,
  realtimeClient,
  sessionStore,
  getAppVersion: () => app.getVersion(),
  getRuntimeConfig: () => ({
    backendBaseUrl,
    liveKitDefaultRoom,
    desktopRtcConfig,
  }),
  getDesktopPreferences: () => desktopPreferencesStore.get(),
  updateDesktopPreferences: (patch) => {
    const previous = desktopPreferencesStore.get();
    const next = desktopPreferencesStore.update(patch);
    applyLaunchAtStartup(next.launchAtStartup);
    if (!next.closeToTrayOnClose) {
      destroyTray();
    }

    if (
      previous.gpuAccelerationEnabled !== next.gpuAccelerationEnabled &&
      mainWindow &&
      !mainWindow.isDestroyed()
    ) {
      emitRealtimeEvent({
        type: "system-error",
        code: "GPU_ACCELERATION_RESTART_REQUIRED",
        message:
          "GPU hizlandirma ayari degisti. Degisikligin uygulanmasi icin uygulamayi yeniden baslatin.",
      });
    }

    return next;
  },
  getUpdateState: () => appUpdater.getState(),
  checkForUpdates: () => appUpdater.checkForUpdates(),
  applyUpdate: () => appUpdater.applyUpdate(),
  emitRealtimeEvent,
  emitUpdateEvent,
});

const ensureMainWindow = async (): Promise<void> => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }

  mainWindow = await createMainWindow();
  bindCloseToTrayBehavior(mainWindow);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

app.whenReady().then(async () => {
  applyLaunchAtStartup(desktopPreferencesStore.get().launchAtStartup);
  await ensureMainWindow();
  appUpdater.startBackgroundChecks();

  app.on("activate", async () => {
    await ensureMainWindow();
    void appUpdater.checkForUpdates();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("child-process-gone", (_event, details) => {
  if (details.type !== "GPU") {
    return;
  }

  const reason = details.reason ?? "unknown";
  console.warn(
    `[desktop] gpu process exited: reason=${reason} code=${details.exitCode ?? "n/a"}`,
  );

  if (
    reason !== "clean-exit" &&
    desktopPreferencesStore.get().gpuAccelerationEnabled
  ) {
    desktopPreferencesStore.update({ gpuAccelerationEnabled: false });

    emitRealtimeEvent({
      type: "system-error",
      code: "GPU_ACCELERATION_FALLBACK",
      message:
        "GPU hizlandirma kararsizlik nedeniyle otomatik kapatildi. Stabil mod icin uygulamayi yeniden baslatin.",
    });
  }
});

app.on("window-all-closed", () => {
  const prefs = desktopPreferencesStore.get();
  if (prefs.closeToTrayOnClose && !isQuitting) {
    return;
  }

  realtimeClient.disconnect();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
