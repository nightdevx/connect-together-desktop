import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export interface DesktopPreferences {
  closeToTrayOnClose: boolean;
  launchAtStartup: boolean;
  gpuAccelerationEnabled: boolean;
}

const DEFAULT_PREFERENCES: DesktopPreferences = {
  closeToTrayOnClose: false,
  launchAtStartup: false,
  gpuAccelerationEnabled: false,
};

const isBoolean = (value: unknown): value is boolean => {
  return typeof value === "boolean";
};

export class DesktopPreferencesStore {
  private readonly filePath: string;

  private preferences: DesktopPreferences = { ...DEFAULT_PREFERENCES };

  public constructor() {
    this.filePath = path.join(
      app.getPath("userData"),
      "desktop-preferences.json",
    );
    this.loadFromDisk();
  }

  public get(): DesktopPreferences {
    return { ...this.preferences };
  }

  public update(patch: Partial<DesktopPreferences>): DesktopPreferences {
    const next: DesktopPreferences = {
      closeToTrayOnClose: isBoolean(patch.closeToTrayOnClose)
        ? patch.closeToTrayOnClose
        : this.preferences.closeToTrayOnClose,
      launchAtStartup: isBoolean(patch.launchAtStartup)
        ? patch.launchAtStartup
        : this.preferences.launchAtStartup,
      gpuAccelerationEnabled: isBoolean(patch.gpuAccelerationEnabled)
        ? patch.gpuAccelerationEnabled
        : this.preferences.gpuAccelerationEnabled,
    };

    this.preferences = next;
    this.persist();
    return this.get();
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        return;
      }

      const raw = fs.readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<DesktopPreferences>;
      this.preferences = {
        closeToTrayOnClose: isBoolean(parsed.closeToTrayOnClose)
          ? parsed.closeToTrayOnClose
          : DEFAULT_PREFERENCES.closeToTrayOnClose,
        launchAtStartup: isBoolean(parsed.launchAtStartup)
          ? parsed.launchAtStartup
          : DEFAULT_PREFERENCES.launchAtStartup,
        gpuAccelerationEnabled: isBoolean(parsed.gpuAccelerationEnabled)
          ? parsed.gpuAccelerationEnabled
          : DEFAULT_PREFERENCES.gpuAccelerationEnabled,
      };
    } catch {
      this.preferences = { ...DEFAULT_PREFERENCES };
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(
        this.filePath,
        JSON.stringify(this.preferences, null, 2),
        "utf-8",
      );
    } catch {
      // no-op
    }
  }
}
