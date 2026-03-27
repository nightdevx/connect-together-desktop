import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export type LogoAssetFile = "logo.png" | "logo.ico";

export const resolveLogoAssetPath = (fileName: LogoAssetFile): string => {
  const fallbackPath = path.join(process.cwd(), "public", "images", fileName);
  const candidates = [
    fallbackPath,
    path.join(process.cwd(), "dist", "renderer", "images", fileName),
    path.join(__dirname, "../renderer/images", fileName),
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

export const resolvePreferredLogoAssetPath = (
  preferredFiles: LogoAssetFile[],
  fallbackFile: LogoAssetFile,
): string => {
  for (const fileName of preferredFiles) {
    const candidatePath = resolveLogoAssetPath(fileName);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return resolveLogoAssetPath(fallbackFile);
};

export const resolveLogoDataUrl = (
  preferredFiles: LogoAssetFile[] = ["logo.png", "logo.ico"],
): string | null => {
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
