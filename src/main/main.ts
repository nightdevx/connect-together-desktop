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

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
app.disableHardwareAcceleration();

console.log(
  `[desktop] backend base url resolved: ${backendBaseUrl} (env: ${loadedEnvPath ?? "none"})`,
);

const backendClient = new BackendClient(backendBaseUrl);
const realtimeClient = new RealtimeClient(backendBaseUrl);
const sessionStore = new SessionStore();
const desktopPreferencesStore = new DesktopPreferencesStore();
const appUpdater = createDesktopAppUpdater();

const applyLaunchAtStartup = (enabled: boolean): void => {
  app.setLoginItemSettings({ openAtLogin: enabled });
};

const resolveLogoPath = (): string => {
  const devPath = path.join(__dirname, "../../public/images/logo.png");
  if (fs.existsSync(devPath)) {
    return devPath;
  }

  return path.join(__dirname, "../renderer/images/logo.png");
};

const createTrayIcon = () => {
  const image = nativeImage.createFromPath(resolveLogoPath());
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
    const next = desktopPreferencesStore.update(patch);
    applyLaunchAtStartup(next.launchAtStartup);
    if (!next.closeToTrayOnClose) {
      destroyTray();
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
