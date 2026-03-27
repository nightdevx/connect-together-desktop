import { Menu, Tray, type NativeImage } from "electron";

interface TrayManagerDeps {
  createTrayIcon: () => NativeImage;
  onOpenMainWindow: () => void;
  onQuitRequested: () => void;
}

export interface TrayManager {
  ensureTray: () => void;
  destroyTray: () => void;
}

export const createTrayManager = (deps: TrayManagerDeps): TrayManager => {
  let tray: Tray | null = null;

  const ensureTray = (): void => {
    if (tray) {
      return;
    }

    tray = new Tray(deps.createTrayIcon());
    tray.setToolTip("Connect Together Desktop");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: "Uygulamayi Ac",
          click: () => {
            deps.onOpenMainWindow();
          },
        },
        {
          label: "Cikis",
          click: () => {
            deps.onQuitRequested();
          },
        },
      ]),
    );

    tray.on("double-click", () => {
      deps.onOpenMainWindow();
    });
  };

  const destroyTray = (): void => {
    if (!tray) {
      return;
    }

    tray.destroy();
    tray = null;
  };

  return {
    ensureTray,
    destroyTray,
  };
};
