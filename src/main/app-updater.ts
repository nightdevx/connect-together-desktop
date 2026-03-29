import { app } from "electron";
import { autoUpdater } from "electron-updater";
import fs from "node:fs";
import path from "node:path";
import type { DesktopUpdateState } from "./types";

interface DesktopAppUpdater {
  getState: () => DesktopUpdateState;
  checkForUpdates: () => Promise<DesktopUpdateState>;
  applyUpdate: () => Promise<{ accepted: boolean; state: DesktopUpdateState }>;
  onStateChanged: (listener: (state: DesktopUpdateState) => void) => () => void;
  startBackgroundChecks: () => void;
}

interface CreateDesktopAppUpdaterOptions {
  onBeforeQuitAndInstall?: () => void | Promise<void>;
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
  const diagnosticsLogPath = path.join(
    app.getPath("userData"),
    "logs",
    "updater.log",
  );

  const appendDiagnosticsLog = (
    level: "info" | "warn" | "error",
    event: string,
    details?: Record<string, unknown>,
  ): void => {
    try {
      fs.mkdirSync(path.dirname(diagnosticsLogPath), { recursive: true });

      const line = JSON.stringify(
        {
          ts: new Date().toISOString(),
          level,
          event,
          pid: process.pid,
          appVersion: app.getVersion(),
          details,
        },
        (_key, value) => {
          if (value instanceof Error) {
            return {
              name: value.name,
              message: value.message,
              stack: value.stack,
            };
          }

          return value;
        },
      );

      fs.appendFileSync(diagnosticsLogPath, `${line}\n`, "utf-8");
    } catch {
      // Ignore diagnostics failures to avoid blocking updater flow.
    }
  };

  const normalizeUpdaterErrorMessage = (error: unknown): string => {
    appendDiagnosticsLog("error", "updater-error", {
      error,
    });

    if (!(error instanceof Error)) {
      return `Bilinmeyen güncelleme hatasi. Tanilama kaydi: ${diagnosticsLogPath}`;
    }

    const rawMessage = (error.message || "").trim();
    if (!rawMessage) {
      return `Bilinmeyen guncelleme hatasi. Tanilama kaydi: ${diagnosticsLogPath}`;
    }

    const compact = rawMessage.replace(/\s+/g, " ");

    if (/failed to uninstall old application files/i.test(compact)) {
      return [
        "Kurulum asamasinda onceki surum dosyalari kaldirilamadi (Windows code: 2).",
        "Muhtemel neden: uygulamanin baska bir kopyasi hala acik veya dosya kilidi var.",
        "Tum Connect Together sureclerini kapatip guncellemeyi tekrar deneyin.",
        `Tanilama kaydi: ${diagnosticsLogPath}`,
      ].join(" ");
    }

    if (compact.length > 220) {
      return `${compact.slice(0, 220)}... Tanilama kaydi: ${diagnosticsLogPath}`;
    }

    return `${compact} Tanilama kaydi: ${diagnosticsLogPath}`;
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

  appendDiagnosticsLog("info", "updater-created", {
    isPackaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    execPath: process.execPath,
  });

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

  const quitAndInstall = async (): Promise<void> => {
    if (didTriggerQuitAndInstall) {
      appendDiagnosticsLog("warn", "quit-and-install-skip", {
        reason: "already-triggered",
      });
      return;
    }

    didTriggerQuitAndInstall = true;
    installAfterDownloadRequested = false;
    appendDiagnosticsLog("info", "quit-and-install", {
      silent: true,
      forceRunAfter: true,
    });

    updateState({
      status: "installing",
      downloadProgressPercent: 100,
      message: "Güncelleme kuruluyor...",
    });

    try {
      await options.onBeforeQuitAndInstall?.();
    } catch (error) {
      console.warn("[desktop] onBeforeQuitAndInstall failed:", error);
    }

    // Give the dedicated update window enough time to paint before quitting.
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 600);
    });

    appendDiagnosticsLog("info", "quit-and-install-dispatch");
    autoUpdater.quitAndInstall(true, true);
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
      appendDiagnosticsLog("info", "checking-for-update");
      updateState({
        status: "checking",
        message: "Güncelleme kontrol ediliyor...",
        checkedAt: new Date().toISOString(),
      });
    });

    autoUpdater.on("update-available", (info) => {
      appendDiagnosticsLog("info", "update-available", {
        version: typeof info?.version === "string" ? info.version : null,
      });
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
      appendDiagnosticsLog("info", "update-not-available");
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

      if (percent === 0 || percent % 10 === 0 || percent >= 98) {
        appendDiagnosticsLog("info", "download-progress", {
          percent,
          transferred:
            typeof progress?.transferred === "number"
              ? progress.transferred
              : null,
          total: typeof progress?.total === "number" ? progress.total : null,
        });
      }

      updateState({
        status: "downloading",
        downloadProgressPercent: percent,
        message: "Güncelleme indiriliyor...",
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      appendDiagnosticsLog("info", "update-downloaded", {
        version: typeof info?.version === "string" ? info.version : null,
        installAfterDownloadRequested,
      });
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
        void quitAndInstall();
      }
    });

    autoUpdater.on("error", (error) => {
      appendDiagnosticsLog("error", "auto-updater-event-error", {
        error,
      });
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
      appendDiagnosticsLog("info", "check-for-updates-skip", {
        reason: "not-packaged",
      });
      return cloneState(state);
    }

    bindAutoUpdaterEvents();

    try {
      appendDiagnosticsLog("info", "check-for-updates");
      await autoUpdater.checkForUpdates();
    } catch (error) {
      const message = normalizeUpdaterErrorMessage(error);
      appendDiagnosticsLog("error", "check-for-updates-failed", {
        error,
      });
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
      appendDiagnosticsLog("info", "apply-update-skip", {
        reason: "not-packaged",
      });
      return {
        accepted: false,
        state: cloneState(state),
      };
    }

    bindAutoUpdaterEvents();

    if (state.status === "downloaded") {
      appendDiagnosticsLog("info", "apply-update-direct-install", {
        status: state.status,
      });
      void quitAndInstall();
      return {
        accepted: true,
        state: cloneState(state),
      };
    }

    try {
      if (state.status !== "available") {
        appendDiagnosticsLog("info", "apply-update-refresh-check", {
          status: state.status,
        });
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
      appendDiagnosticsLog("info", "apply-update-download-start", {
        targetVersion: state.availableVersion,
      });
      updateState({
        status: "downloading",
        downloadProgressPercent: 0,
        message: "Güncelleme indiriliyor...",
      });

      try {
        await autoUpdater.downloadUpdate();
      } catch {
        appendDiagnosticsLog("warn", "download-retry");
        await autoUpdater.checkForUpdates();
        await autoUpdater.downloadUpdate();
      }

      return {
        accepted: true,
        state: cloneState(state),
      };
    } catch (error) {
      installAfterDownloadRequested = false;
      appendDiagnosticsLog("error", "apply-update-failed", {
        error,
      });
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
