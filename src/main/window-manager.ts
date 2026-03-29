import { BrowserWindow } from "electron";
import type { DesktopUpdateState } from "./types";
import { createMainWindow } from "./window/create-main-window";
import {
  createUpdateInstallWindow,
  setUpdateInstallWindowPhase,
  type UpdateInstallPhase,
} from "./window/create-update-install-window";

interface WindowManagerDeps {
  shouldHideMainWindowOnClose: () => boolean;
  onHideToTrayRequested: () => void;
}

export interface WindowManager {
  ensureMainWindow: () => Promise<void>;
  showMainWindow: () => Promise<void>;
  hideMainWindow: () => void;
  showUpdateInstallWindow: (phase?: UpdateInstallPhase) => Promise<boolean>;
  hideUpdateInstallWindow: () => void;
  updateInstallWindowPhase: (phase: UpdateInstallPhase) => void;
  emitRealtimeEvent: (payload: unknown) => void;
  emitUpdateEvent: (payload: DesktopUpdateState) => void;
}

export const createWindowManager = (deps: WindowManagerDeps): WindowManager => {
  let mainWindow: BrowserWindow | null = null;
  let updateInstallWindow: BrowserWindow | null = null;

  const bindMainWindowEvents = (win: BrowserWindow): void => {
    win.on("close", (event) => {
      if (!deps.shouldHideMainWindowOnClose()) {
        return;
      }

      event.preventDefault();
      deps.onHideToTrayRequested();
      win.hide();
    });

    win.on("closed", () => {
      mainWindow = null;
    });
  };

  const createAndBindMainWindow = async (): Promise<BrowserWindow> => {
    const win = await createMainWindow();
    bindMainWindowEvents(win);
    mainWindow = win;
    return win;
  };

  const ensureMainWindow = async (): Promise<void> => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
      return;
    }

    await createAndBindMainWindow();
  };

  const showMainWindow = async (): Promise<void> => {
    const win =
      mainWindow && !mainWindow.isDestroyed()
        ? mainWindow
        : await createAndBindMainWindow();

    if (win.isMinimized()) {
      win.restore();
    }
    win.show();
    win.focus();
  };

  const hideMainWindow = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.hide();
  };

  const waitForUpdateInstallWindowVisible = async (
    win: BrowserWindow,
    timeoutMs = 4500,
  ): Promise<boolean> => {
    if (!win || win.isDestroyed()) {
      return false;
    }

    if (win.isVisible()) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      let resolved = false;

      const complete = (value: boolean): void => {
        if (resolved) {
          return;
        }

        resolved = true;
        clearTimeout(timeoutRef);
        win.removeListener("show", onShow);
        win.removeListener("closed", onClosed);
        resolve(value);
      };

      const onShow = (): void => {
        complete(true);
      };

      const onClosed = (): void => {
        complete(false);
      };

      const timeoutRef = setTimeout(() => {
        complete(!win.isDestroyed() && win.isVisible());
      }, timeoutMs);

      win.once("show", onShow);
      win.once("closed", onClosed);
    });
  };

  const showUpdateInstallWindow = (
    phase: UpdateInstallPhase = "installing",
  ): Promise<boolean> => {
    if (updateInstallWindow && !updateInstallWindow.isDestroyed()) {
      setUpdateInstallWindowPhase(updateInstallWindow, phase);
      updateInstallWindow.show();
      updateInstallWindow.focus();
      return Promise.resolve(true);
    }

    updateInstallWindow = createUpdateInstallWindow(phase);
    updateInstallWindow.on("closed", () => {
      updateInstallWindow = null;
    });

    return waitForUpdateInstallWindowVisible(updateInstallWindow);
  };

  const hideUpdateInstallWindow = (): void => {
    if (!updateInstallWindow || updateInstallWindow.isDestroyed()) {
      return;
    }

    updateInstallWindow.hide();
  };

  const updateInstallWindowPhase = (phase: UpdateInstallPhase): void => {
    if (!updateInstallWindow || updateInstallWindow.isDestroyed()) {
      return;
    }

    setUpdateInstallWindowPhase(updateInstallWindow, phase);
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

  return {
    ensureMainWindow,
    showMainWindow,
    hideMainWindow,
    showUpdateInstallWindow,
    hideUpdateInstallWindow,
    updateInstallWindowPhase,
    emitRealtimeEvent,
    emitUpdateEvent,
  };
};
