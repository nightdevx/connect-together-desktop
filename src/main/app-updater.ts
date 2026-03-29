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

interface CreateDesktopAppUpdaterOptions {
  onBeforeQuitAndInstall?: () => void;
}

const isFinalCheckState = (status: DesktopUpdateState["status"]): boolean => {
  return (
    status === "available" || status === "not-available" || status === "error"
  );
};

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

export const createDesktopAppUpdater = (
  options: CreateDesktopAppUpdaterOptions = {},
): DesktopAppUpdater => {
  const listeners = new Set<(state: DesktopUpdateState) => void>();

  const normalizeUpdaterErrorMessage = (error: unknown): string => {
    if (!(error instanceof Error)) {
      return "Bilinmeyen güncelleme hatası";
    }

    const rawMessage = (error.message || "").trim();
    if (!rawMessage) {
      return "Bilinmeyen güncelleme hatası";
    }

    const compact = rawMessage.replace(/\s+/g, " ");
    if (compact.length > 220) {
      return `${compact.slice(0, 220)}...`;
    }

    return compact;
  };

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
  let didTriggerQuitAndInstall = false;

  const waitForUpdateState = async (
    predicate: (nextState: DesktopUpdateState) => boolean,
    timeoutMs = 12_000,
  ): Promise<DesktopUpdateState> => {
    const current = cloneState(state);
    if (predicate(current)) {
      return current;
    }

    return new Promise<DesktopUpdateState>((resolve) => {
      let resolved = false;

      const complete = (snapshot: DesktopUpdateState): void => {
        if (resolved) {
          return;
        }

        resolved = true;
        listeners.delete(listener);
        clearTimeout(timeoutRef);
        resolve(snapshot);
      };

      const listener = (nextState: DesktopUpdateState): void => {
        if (predicate(nextState)) {
          complete(nextState);
        }
      };

      const timeoutRef = setTimeout(() => {
        complete(cloneState(state));
      }, timeoutMs);

      listeners.add(listener);
    });
  };

  const quitAndInstall = (): void => {
    if (didTriggerQuitAndInstall) {
      return;
    }

    didTriggerQuitAndInstall = true;
    installAfterDownloadRequested = false;
    updateState({
      status: "installing",
      downloadProgressPercent: 100,
      message: "Güncelleme kuruluyor...",
    });

    try {
      options.onBeforeQuitAndInstall?.();
    } catch (error) {
      console.warn("[desktop] onBeforeQuitAndInstall failed:", error);
    }

    // Give the dedicated update window enough time to paint before quitting.
    setTimeout(() => {
      autoUpdater.quitAndInstall(true, true);
    }, 1350);
  };

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
    autoUpdater.autoRunAppAfterInstall = true;

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
        // Silent install avoids showing NSIS assistant pages during update.
        quitAndInstall();
      }
    });

    autoUpdater.on("error", (error) => {
      const message = normalizeUpdaterErrorMessage(error);
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
      const message = normalizeUpdaterErrorMessage(error);
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
      quitAndInstall();
      return {
        accepted: true,
        state: cloneState(state),
      };
    }

    try {
      if (state.status !== "available") {
        await autoUpdater.checkForUpdates();

        if (!isFinalCheckState(state.status)) {
          await waitForUpdateState((nextState) =>
            isFinalCheckState(nextState.status),
          );
        }
      }

      if (state.status !== "available") {
        return {
          accepted: false,
          state: cloneState(state),
        };
      }

      installAfterDownloadRequested = true;
      updateState({
        status: "downloading",
        downloadProgressPercent: 0,
        message: "Güncelleme indiriliyor...",
      });

      try {
        await autoUpdater.downloadUpdate();
      } catch {
        await autoUpdater.checkForUpdates();
        await autoUpdater.downloadUpdate();
      }

      return {
        accepted: true,
        state: cloneState(state),
      };
    } catch (error) {
      installAfterDownloadRequested = false;
      const message = normalizeUpdaterErrorMessage(error);
      updateState({
        status: "error",
        message,
        checkedAt: new Date().toISOString(),
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
