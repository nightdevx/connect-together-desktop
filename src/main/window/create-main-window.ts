import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const resolveLogoAssetPath = (fileName: "logo.png" | "logo.ico"): string => {
  const fallbackPath = path.join(process.cwd(), "public", "images", fileName);
  const candidates = [
    fallbackPath,
    path.join(process.cwd(), "dist", "renderer", "images", fileName),
    path.join(__dirname, "../../renderer/images", fileName),
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

const resolveWindowIconPath = (): string => {
  const fallbackFile: "logo.png" | "logo.ico" =
    process.platform === "win32" ? "logo.ico" : "logo.png";
  const preferredFiles: Array<"logo.png" | "logo.ico"> =
    process.platform === "win32"
      ? ["logo.ico", "logo.png"]
      : ["logo.png", "logo.ico"];

  for (const fileName of preferredFiles) {
    const candidatePath = resolveLogoAssetPath(fileName);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return resolveLogoAssetPath(fallbackFile);
};

const loadFallbackContent = async (win: BrowserWindow): Promise<void> => {
  await win.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Connect Together Desktop</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        font-family: "Segoe UI", sans-serif;
        background: #101522;
        color: #e9edf7;
        display: grid;
        place-items: center;
        min-height: 100vh;
      }
      main {
        width: min(92vw, 540px);
        padding: 24px;
        border-radius: 12px;
        border: 1px solid #2c3751;
        background: #171e2f;
      }
      h1 { margin: 0 0 10px; font-size: 1.15rem; }
      p { margin: 0 0 8px; line-height: 1.5; color: #c5d0e6; }
      code {
        display: inline-block;
        margin-top: 6px;
        padding: 6px 8px;
        border-radius: 6px;
        background: #11182a;
        border: 1px solid #31415d;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Renderer su anda yuklenemedi</h1>
      <p>Vite gelistirme sunucusuna baglanma denemeleri basarisiz oldu.</p>
      <p>Sunucunun acik oldugunu dogrulayin ve uygulamayi yeniden baslatin.</p>
      <code>http://127.0.0.1:5173</code>
    </main>
  </body>
</html>
  `)}`,
  );
};

const loadDevServerWithRetry = async (
  win: BrowserWindow,
  devServerUrl: string,
): Promise<boolean> => {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await win.loadURL(devServerUrl);
      return true;
    } catch (error) {
      if (attempt === maxAttempts) {
        console.error(
          `[desktop] Failed to load renderer after ${maxAttempts} attempts:`,
          error,
        );
        return false;
      }

      await sleep(300);
    }
  }

  return false;
};

export const createMainWindow = async (): Promise<BrowserWindow> => {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    icon: resolveWindowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: true,
    },
    title: "Connect Together Desktop",
    backgroundColor: "#0f1118",
  });

  let didShowWindow = false;
  const showWindowAndEmitState = () => {
    if (didShowWindow || win.isDestroyed()) {
      return;
    }

    didShowWindow = true;
    win.webContents.send("desktop:window-state-changed", {
      isMaximized: win.isMaximized(),
    });
    win.show();
  };

  win.once("ready-to-show", showWindowAndEmitState);

  const emitWindowState = () => {
    if (win.isDestroyed()) {
      return;
    }

    win.webContents.send("desktop:window-state-changed", {
      isMaximized: win.isMaximized(),
    });
  };

  win.on("maximize", emitWindowState);
  win.on("unmaximize", emitWindowState);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL?.trim();
  if (devServerUrl) {
    const loaded = await loadDevServerWithRetry(win, devServerUrl);
    if (!loaded) {
      await loadFallbackContent(win);
    }
  } else {
    const rendererIndexPath = path.join(__dirname, "../../renderer/index.html");
    try {
      await win.loadFile(rendererIndexPath);
    } catch (error) {
      console.error("[desktop] Failed to load packaged renderer:", error);
      await loadFallbackContent(win);
    }
  }

  // If ready-to-show fired before listener attachment timing or is skipped,
  // still ensure the main window becomes visible after content load.
  showWindowAndEmitState();

  return win;
};
