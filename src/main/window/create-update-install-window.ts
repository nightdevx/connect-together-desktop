import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";

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

const resolveUpdateWindowIconPath = (): string => {
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

const resolveLogoDataUrl = (): string | null => {
  const preferredFiles: Array<"logo.png" | "logo.ico"> = [
    "logo.png",
    "logo.ico",
  ];

  for (const fileName of preferredFiles) {
    const logoPath = resolveLogoAssetPath(fileName);
    if (!fs.existsSync(logoPath)) {
      continue;
    }

    try {
      const encoded = fs.readFileSync(logoPath).toString("base64");
      const mimeType = fileName === "logo.png" ? "image/png" : "image/x-icon";
      return `data:${mimeType};base64,${encoded}`;
    } catch {
      continue;
    }
  }

  return null;
};

const buildNeonLogoSvg = (): string => {
  return `
<svg class="neon-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="loopGradient" x1="8" y1="80" x2="92" y2="18" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#1c46c8" />
      <stop offset="45%" stop-color="#2586e7" />
      <stop offset="100%" stop-color="#35f0e8" />
    </linearGradient>
    <filter id="loopGlow" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="1.6" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <filter id="traceGlow" x="-80%" y="-80%" width="260%" height="260%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="1" result="b1" />
      <feGaussianBlur stdDeviation="2.2" result="b2" />
      <feMerge>
        <feMergeNode in="b2" />
        <feMergeNode in="b1" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path class="loop-base" d="M44 20C37 16 29 14 22 16C12 19 5 28 4 39C3 50 7 60 16 67C24 74 35 76 45 71C52 67 57 60 60 52" />
    <path class="loop-base" d="M47 25C54 17 64 13 74 14C86 16 95 26 96 38C97 50 91 60 81 66L84 76L73 70C62 71 53 67 47 59" />
    <path class="loop-core" d="M44 20C37 16 29 14 22 16C12 19 5 28 4 39C3 50 7 60 16 67C24 74 35 76 45 71C52 67 57 60 60 52" />
    <path class="loop-core" d="M47 25C54 17 64 13 74 14C86 16 95 26 96 38C97 50 91 60 81 66L84 76L73 70C62 71 53 67 47 59" />
    <path class="loop-core center" d="M50 31C54 37 55 44 54 51C53 58 49 64 44 68" />

    <path class="loop-trace trace-left" d="M44 20C37 16 29 14 22 16C12 19 5 28 4 39C3 50 7 60 16 67C24 74 35 76 45 71C52 67 57 60 60 52" />
    <path class="loop-trace trace-right" d="M47 25C54 17 64 13 74 14C86 16 95 26 96 38C97 50 91 60 81 66L84 76L73 70C62 71 53 67 47 59" />
    <path class="loop-trace trace-center" d="M50 31C54 37 55 44 54 51C53 58 49 64 44 68" />
  </g>
</svg>
`;
};

const createMarkup = (): string => {
  const logoDataUrl = resolveLogoDataUrl();
  const logoImageMarkup = logoDataUrl
    ? `<img class="logo-underlay" src="${logoDataUrl}" alt="" aria-hidden="true" />`
    : "";

  const logoContent = `
    <div class="logo-stage" role="img" aria-label="Connect Together logosu">
      ${logoImageMarkup}
      ${buildNeonLogoSvg()}
      ${logoDataUrl ? "" : '<div class="logo-fallback">CT</div>'}
    </div>
  `;

  return `
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Güncelleniyor</title>
    <style>
      :root {
        color-scheme: dark;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: "Segoe UI", sans-serif;
        background: radial-gradient(circle at 20% 15%, #2b3552, #111623 65%);
      }

      .card {
        width: 280px;
        height: 280px;
        border-radius: 24px;
        border: 1px solid rgba(152, 172, 216, 0.26);
        background: linear-gradient(160deg, #192238 0%, #111729 100%);
        box-shadow: 0 20px 54px rgba(0, 0, 0, 0.44);
        display: grid;
        place-items: center;
        grid-template-rows: auto auto;
        align-content: center;
        gap: 18px;
      }

      .logo-wrap {
        width: 132px;
        height: 116px;
        border-radius: 20px;
        background: rgba(12, 16, 28, 0.72);
        border: 1px solid rgba(157, 183, 236, 0.22);
        display: grid;
        place-items: center;
        overflow: hidden;
        position: relative;
      }

      .logo-wrap::before {
        content: "";
        position: absolute;
        width: 126px;
        height: 84px;
        border-radius: 100%;
        background: radial-gradient(
          circle at center,
          rgba(53, 240, 232, 0.22),
          rgba(28, 70, 200, 0)
        );
        filter: blur(6px);
        animation: logo-halo 3.4s ease-in-out infinite;
      }

      .logo-stage {
        width: 112px;
        height: 96px;
        position: relative;
        display: grid;
        place-items: center;
        animation: logo-breathe 3.2s ease-in-out infinite;
      }

      .logo-underlay {
        position: absolute;
        width: 78px;
        height: 78px;
        object-fit: contain;
        user-select: none;
        -webkit-user-drag: none;
        filter: saturate(1.1) contrast(1.06);
        opacity: 0.68;
      }

      .neon-logo {
        width: 112px;
        height: 96px;
      }

      .loop-base {
        stroke: url(#loopGradient);
        stroke-width: 15;
        opacity: 0.18;
        filter: url(#loopGlow);
      }

      .loop-core {
        stroke: url(#loopGradient);
        stroke-width: 11;
        opacity: 0.94;
        filter: url(#loopGlow);
      }

      .loop-core.center {
        stroke-width: 8;
        opacity: 0.78;
      }

      .loop-trace {
        stroke: #92fffe;
        stroke-width: 3.3;
        stroke-dasharray: 14 150;
        filter: url(#traceGlow);
        opacity: 0.95;
        animation: neon-trace 3.7s linear infinite;
      }

      .trace-right {
        animation-delay: -1.2s;
      }

      .trace-center {
        stroke-width: 2.5;
        stroke-dasharray: 8 80;
        animation-duration: 2.9s;
        animation-delay: -0.6s;
      }

      .logo-fallback {
        position: absolute;
        font-size: 26px;
        font-weight: 700;
        letter-spacing: 0.04em;
        color: #dff3ff;
        text-shadow:
          0 0 10px rgba(84, 213, 255, 0.55),
          0 0 24px rgba(41, 121, 255, 0.4);
      }

      p {
        margin: 0;
        color: #edf3ff;
        font-weight: 600;
        letter-spacing: 0.01em;
      }

      @keyframes neon-trace {
        from {
          stroke-dashoffset: 0;
        }
        to {
          stroke-dashoffset: -260;
        }
      }

      @keyframes logo-breathe {
        0%,
        100% {
          transform: scale(0.985);
          opacity: 0.92;
        }
        50% {
          transform: scale(1.02);
          opacity: 1;
        }
      }

      @keyframes logo-halo {
        0%,
        100% {
          opacity: 0.35;
          transform: scale(0.95);
        }
        50% {
          opacity: 0.75;
          transform: scale(1.06);
        }
      }
    </style>
  </head>
  <body>
    <main class="card" role="status" aria-live="assertive">
      <div class="logo-wrap">${logoContent}</div>
      <p>Güncelleniyor...</p>
    </main>
  </body>
</html>
`;
};

export const createUpdateInstallWindow = (): BrowserWindow => {
  const win = new BrowserWindow({
    width: 360,
    height: 360,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    movable: false,
    closable: false,
    frame: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    icon: resolveUpdateWindowIconPath(),
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    transparent: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.removeMenu();

  const markup = createMarkup();
  void win.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(markup)}`,
  );

  win.once("ready-to-show", () => {
    if (win.isDestroyed()) {
      return;
    }

    win.show();
    win.focus();
  });

  return win;
};
