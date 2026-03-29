import { app, nativeImage } from "electron";
import { createDesktopAppUpdater } from "./app-updater";
import {
  resolveLogoAssetPath,
  resolvePreferredLogoAssetPath,
} from "./asset-resolver";
import { BackendClient } from "./backend-client";
import {
  backendBaseUrl,
  desktopRtcConfig,
  liveKitDefaultRoom,
  mediaQualityProfile,
  loadedEnvPath,
} from "./config";
import { DesktopPreferencesStore } from "./desktop-preferences-store";
import { registerDesktopIpcHandlers } from "./ipc/register-desktop-ipc";
import { RealtimeClient } from "./realtime-client";
import { SessionStore } from "./session-store";
import { createTrayManager } from "./tray-manager";
import { createWindowManager } from "./window-manager";

let isQuitting = false;
const desktopPreferencesStore = new DesktopPreferencesStore();
const APP_USER_MODEL_ID = "com.nightdijital.connecttogether.desktop";

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

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

let trayManager: ReturnType<typeof createTrayManager>;
const windowManager = createWindowManager({
  shouldHideMainWindowOnClose: () => {
    const prefs = desktopPreferencesStore.get();
    return !isQuitting && prefs.closeToTrayOnClose;
  },
  onHideToTrayRequested: () => {
    trayManager.ensureTray();
  },
});

const appUpdater = createDesktopAppUpdater({
  onBeforeQuitAndInstall: () => {
    isQuitting = true;
    trayManager.destroyTray();
    windowManager.hideMainWindow();
    windowManager.showUpdateInstallWindow("installing");
  },
});

const applyLaunchAtStartup = (enabled: boolean): void => {
  app.setLoginItemSettings({ openAtLogin: enabled });
};

const resolveTrayLogoPath = (): string => {
  return resolvePreferredLogoAssetPath(["logo.png", "logo.ico"], "logo.png");
};

const createTrayIcon = () => {
  let image = nativeImage.createFromPath(resolveTrayLogoPath());
  if (image.isEmpty()) {
    image = nativeImage.createFromPath(resolveLogoAssetPath("logo.ico"));
  }

  return image.resize({ width: 16, height: 16 });
};

trayManager = createTrayManager({
  createTrayIcon,
  onOpenMainWindow: () => {
    void windowManager.showMainWindow();
  },
  onQuitRequested: () => {
    isQuitting = true;
    app.quit();
  },
});

app.on("second-instance", () => {
  if (isQuitting) {
    return;
  }

  void windowManager.showMainWindow();
});

appUpdater.onStateChanged((state) => {
  windowManager.emitUpdateEvent(state);

  if (state.status === "downloading") {
    windowManager.hideMainWindow();
    windowManager.showUpdateInstallWindow("downloading");
    return;
  }

  if (state.status === "downloaded" || state.status === "installing") {
    windowManager.hideMainWindow();
    windowManager.showUpdateInstallWindow("installing");
    windowManager.updateInstallWindowPhase("installing");
    return;
  }

  if (state.status === "error") {
    if (!isQuitting) {
      windowManager.hideUpdateInstallWindow();
      void windowManager.showMainWindow();
    }
    return;
  }

  if (!isQuitting) {
    windowManager.hideUpdateInstallWindow();
  }
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
    mediaQualityProfile,
  }),
  getDesktopPreferences: () => desktopPreferencesStore.get(),
  updateDesktopPreferences: (patch) => {
    const previous = desktopPreferencesStore.get();
    const next = desktopPreferencesStore.update(patch);
    applyLaunchAtStartup(next.launchAtStartup);
    if (!next.closeToTrayOnClose) {
      trayManager.destroyTray();
    }

    if (previous.gpuAccelerationEnabled !== next.gpuAccelerationEnabled) {
      windowManager.emitRealtimeEvent({
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
  emitRealtimeEvent: windowManager.emitRealtimeEvent,
  emitUpdateEvent: windowManager.emitUpdateEvent,
});

app.whenReady().then(async () => {
  applyLaunchAtStartup(desktopPreferencesStore.get().launchAtStartup);
  await windowManager.ensureMainWindow();
  appUpdater.startBackgroundChecks();

  app.on("activate", async () => {
    await windowManager.ensureMainWindow();
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

    windowManager.emitRealtimeEvent({
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
