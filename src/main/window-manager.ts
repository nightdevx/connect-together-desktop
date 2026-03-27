import { BrowserWindow } from "electron";
import type { DesktopUpdateState } from "./types";
import { createMainWindow } from "./window/create-main-window";
import { createUpdateInstallWindow } from "./window/create-update-install-window";

interface WindowManagerDeps {
  shouldHideMainWindowOnClose: () => boolean;
  onHideToTrayRequested: () => void;
}

export interface WindowManager {
  ensureMainWindow: () => Promise<void>;
  showMainWindow: () => Promise<void>;
  hideMainWindow: () => void;
  showUpdateInstallWindow: () => void;
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
    emitRealtimeEvent,
    emitUpdateEvent,
  };
};
