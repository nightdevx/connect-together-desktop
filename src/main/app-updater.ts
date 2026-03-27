import { app } from "electron";
import { autoUpdater } from "electron-updater";
import type { DesktopUpdateState } from "./types";

interface DesktopAppUpdater {
  getState: () => DesktopUpdateState;
  checkForUpdates: () => Promise<DesktopUpdateState>;
  applyUpdate: () => Promise<{ accepted: boolean; state: DesktopUpdateState }>;
  onStateChanged: (listener: (state: DesktopUpdateState) => void) => () => void;
  startBackgroundChecks: () => void;
}

const cloneState = (state: DesktopUpdateState): DesktopUpdateState => {
  return {
    status: state.status,
    currentVersion: state.currentVersion,
    availableVersion: state.availableVersion,
    downloadProgressPercent: state.downloadProgressPercent,
    message: state.message,
    checkedAt: state.checkedAt,
  };
};

export const createDesktopAppUpdater = (): DesktopAppUpdater => {
  const listeners = new Set<(state: DesktopUpdateState) => void>();

  let state: DesktopUpdateState = {
    status: app.isPackaged ? "idle" : "disabled",
    currentVersion: app.getVersion(),
    availableVersion: null,
    downloadProgressPercent: null,
    message: app.isPackaged
      ? null
      : "Geliştirme modunda otomatik güncelleme devre dışı.",
    checkedAt: null,
  };

  let intervalRef: NodeJS.Timeout | null = null;
  let didBindAutoUpdaterEvents = false;
  let installAfterDownloadRequested = false;

  const emit = (): void => {
    const snapshot = cloneState(state);
    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  const updateState = (patch: Partial<DesktopUpdateState>): void => {
    state = {
      ...state,
      ...patch,
      currentVersion: app.getVersion(),
    };
    emit();
  };

  const bindAutoUpdaterEvents = (): void => {
    if (didBindAutoUpdaterEvents || !app.isPackaged) {
      return;
    }

    didBindAutoUpdaterEvents = true;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("checking-for-update", () => {
      updateState({
        status: "checking",
        message: "Güncelleme kontrol ediliyor...",
        checkedAt: new Date().toISOString(),
      });
    });

    autoUpdater.on("update-available", (info) => {
      updateState({
        status: "available",
        availableVersion:
          typeof info?.version === "string" ? info.version : null,
        downloadProgressPercent: null,
        message: "Yeni sürüm bulundu.",
        checkedAt: new Date().toISOString(),
      });
    });

    autoUpdater.on("update-not-available", () => {
      updateState({
        status: "not-available",
        availableVersion: null,
        downloadProgressPercent: null,
        message: "Uygulama güncel.",
        checkedAt: new Date().toISOString(),
      });
    });

    autoUpdater.on("download-progress", (progress) => {
      const percent = Number.isFinite(progress?.percent)
        ? Math.max(0, Math.min(100, Math.round(progress.percent)))
        : 0;
      updateState({
        status: "downloading",
        downloadProgressPercent: percent,
        message: "Güncelleme indiriliyor...",
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      updateState({
        status: "downloaded",
        availableVersion:
          typeof info?.version === "string"
            ? info.version
            : state.availableVersion,
        downloadProgressPercent: 100,
        message: installAfterDownloadRequested
          ? "Güncelleme tamamlandı, uygulama yeniden başlatılıyor..."
          : "Güncelleme indirildi.",
      });

      if (installAfterDownloadRequested) {
        setTimeout(() => {
          autoUpdater.quitAndInstall();
        }, 250);
      }
    });

    autoUpdater.on("error", (error) => {
      const message =
        error instanceof Error ? error.message : "Bilinmeyen güncelleme hatası";
      updateState({
        status: "error",
        message,
        checkedAt: new Date().toISOString(),
      });
    });
  };

  const checkForUpdates = async (): Promise<DesktopUpdateState> => {
    if (!app.isPackaged) {
      return cloneState(state);
    }

    bindAutoUpdaterEvents();

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Güncelleme kontrol edilemedi";
      updateState({
        status: "error",
        message,
        checkedAt: new Date().toISOString(),
      });
    }

    return cloneState(state);
  };

  const applyUpdate = async (): Promise<{
    accepted: boolean;
    state: DesktopUpdateState;
  }> => {
    if (!app.isPackaged) {
      return {
        accepted: false,
        state: cloneState(state),
      };
    }

    bindAutoUpdaterEvents();

    if (state.status === "downloaded") {
      autoUpdater.quitAndInstall();
      return {
        accepted: true,
        state: cloneState(state),
      };
    }

    if (state.status !== "available") {
      return {
        accepted: false,
        state: cloneState(state),
      };
    }

    try {
      installAfterDownloadRequested = true;
      updateState({
        status: "downloading",
        downloadProgressPercent: 0,
        message: "Güncelleme indiriliyor...",
      });
      await autoUpdater.downloadUpdate();
      return {
        accepted: true,
        state: cloneState(state),
      };
    } catch (error) {
      installAfterDownloadRequested = false;
      const message =
        error instanceof Error ? error.message : "Güncelleme indirilemedi";
      updateState({
        status: "error",
        message,
      });
      return {
        accepted: false,
        state: cloneState(state),
      };
    }
  };

  const startBackgroundChecks = (): void => {
    if (!app.isPackaged) {
      return;
    }

    bindAutoUpdaterEvents();
    void checkForUpdates();

    if (intervalRef) {
      return;
    }

    intervalRef = setInterval(
      () => {
        void checkForUpdates();
      },
      20 * 60 * 1000,
    );

    intervalRef.unref();
  };

  return {
    getState: () => cloneState(state),
    checkForUpdates,
    applyUpdate,
    onStateChanged: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    startBackgroundChecks,
  };
};
