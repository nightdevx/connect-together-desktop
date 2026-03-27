import type { DesktopApi, DesktopResult } from "../../shared/desktop-api-types";
import type {
  CameraShareOptions,
  ScreenShareOptions,
} from "../features/voice/voice-video-share";
import type { DomRefs } from "../ui/dom";

export type ScreenCaptureKind = "any" | "screen" | "window";

type ShareModalMode = "camera" | "screen";

export interface CaptureSourceItem {
  id: string;
  name: string;
  kind: "screen" | "window";
  displayId: string | null;
  thumbnailDataUrl: string | null;
}

interface BootstrapShareModalControllerDeps {
  dom: DomRefs;
  desktopApi: DesktopApi;
  setStatus: (message: string, isError: boolean) => void;
  getErrorMessage: (error?: { message?: string }) => string;
  getScreenShareMode: () => ScreenCaptureKind;
  getScreenResolution: () => string;
  getScreenFps: () => string;
  getCameraShareOptions: () => CameraShareOptions;
  getScreenShareOptions: (sourceId?: string) => ScreenShareOptions;
  createCameraPreviewStream: (
    options: CameraShareOptions,
  ) => Promise<MediaStream>;
}

export interface BootstrapShareModalController {
  setScreenCaptureTab: (kind: "screen" | "window") => void;
  renderScreenCaptureSourceList: () => void;
  refreshScreenCaptureSources: () => Promise<boolean>;
  requestScreenCaptureSourceSelection: (
    confirmLabel?: string,
  ) => Promise<CaptureSourceItem | null>;
  requestCameraShareConfirmation: () => Promise<boolean>;
  completeScreenModalSelection: (confirmed: boolean) => void;
  closeScreenModal: () => void;
}

const resolveCaptureSources = (
  result: DesktopResult<{
    sources: Array<{
      id: string;
      name: string;
      kind: "screen" | "window";
      displayId: string | null;
      thumbnailDataUrl: string | null;
    }>;
  }>,
): CaptureSourceItem[] => {
  if (!result.ok || !result.data) {
    return [];
  }

  return result.data.sources;
};

export const createBootstrapShareModalController = (
  deps: BootstrapShareModalControllerDeps,
): BootstrapShareModalController => {
  const {
    dom,
    desktopApi,
    setStatus,
    getErrorMessage,
    getScreenShareMode,
    getScreenResolution,
    getScreenFps,
    getCameraShareOptions,
    getScreenShareOptions,
    createCameraPreviewStream,
  } = deps;

  let shareModalMode: ShareModalMode = "screen";
  let modalScreenCaptureKind: "screen" | "window" = "screen";
  let screenModalResolver: ((confirmed: boolean) => void) | null = null;
  let shareModalPreviewStream: MediaStream | null = null;
  let screenCaptureSources: CaptureSourceItem[] = [];
  let selectedScreenCaptureSourceId: string | null = null;

  const stopShareModalPreview = (): void => {
    if (shareModalPreviewStream) {
      for (const track of shareModalPreviewStream.getTracks()) {
        try {
          track.stop();
        } catch {
          // no-op
        }
      }
    }

    shareModalPreviewStream = null;
    dom.sharePreviewVideo.srcObject = null;
    dom.sharePreviewVideo.classList.add("hidden");
  };

  const setScreenModalOpen = (open: boolean): void => {
    dom.screenShareModal.classList.toggle("hidden", !open);
    dom.screenShareModal.setAttribute("aria-hidden", open ? "false" : "true");

    if (!open) {
      stopShareModalPreview();
      dom.sharePreviewImage.classList.add("hidden");
      dom.sharePreviewImage.removeAttribute("src");
      dom.sharePreviewHint.textContent = "Önizleme hazırlanıyor...";
    }
  };

  const setShareModalMode = (mode: ShareModalMode): void => {
    shareModalMode = mode;
    const screenMode = mode === "screen";

    dom.screenCaptureFilters.classList.toggle("hidden", !screenMode);
    dom.screenCaptureSourceList.classList.toggle("hidden", !screenMode);
    dom.screenCaptureTabMonitors.disabled = !screenMode;
    dom.screenCaptureTabWindows.disabled = !screenMode;
    dom.modalScreenResolutionSelect.disabled = !screenMode;
    dom.modalScreenFpsSelect.disabled = !screenMode;
    dom.screenMonitorSelect.disabled = !screenMode;
    dom.screenCaptureRefreshButton.disabled = !screenMode;

    if (screenMode) {
      dom.shareModalTitle.textContent = "Ekran Paylaşımı Seçimi";
      return;
    }

    dom.shareModalTitle.textContent = "Kamera Önizleme";
    dom.sharePreviewHint.textContent =
      "Kamera önizlemesi hazır olduğunda onaylayarak paylaşımı başlatabilirsin.";
  };

  const setScreenCaptureTab = (kind: "screen" | "window"): void => {
    modalScreenCaptureKind = kind;
    dom.screenCaptureTabMonitors.classList.toggle("active", kind === "screen");
    dom.screenCaptureTabMonitors.setAttribute(
      "aria-selected",
      kind === "screen" ? "true" : "false",
    );
    dom.screenCaptureTabWindows.classList.toggle("active", kind === "window");
    dom.screenCaptureTabWindows.setAttribute(
      "aria-selected",
      kind === "window" ? "true" : "false",
    );

    dom.screenMonitorSelect.disabled =
      shareModalMode !== "screen" || kind !== "screen";
  };

  const updateSelectedScreenPreviewImage = (): void => {
    const selected = screenCaptureSources.find(
      (source) => source.id === selectedScreenCaptureSourceId,
    );

    if (!selected) {
      dom.sharePreviewImage.classList.add("hidden");
      dom.sharePreviewImage.removeAttribute("src");
      dom.sharePreviewHint.textContent =
        "Önizleme için bir ekran veya pencere seçin.";
      return;
    }

    dom.sharePreviewVideo.classList.add("hidden");
    dom.sharePreviewImage.classList.remove("hidden");
    dom.sharePreviewImage.src =
      selected.thumbnailDataUrl ??
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='960' height='540'%3E%3Crect width='100%25' height='100%25' fill='%23111425'/%3E%3C/svg%3E";
    dom.sharePreviewHint.textContent = `${selected.name} önizleniyor.`;
  };

  const startCameraShareModalPreview = async (): Promise<boolean> => {
    stopShareModalPreview();
    dom.sharePreviewImage.classList.add("hidden");

    try {
      shareModalPreviewStream = await createCameraPreviewStream(
        getCameraShareOptions(),
      );
      dom.sharePreviewVideo.classList.remove("hidden");
      dom.sharePreviewVideo.srcObject = shareModalPreviewStream;
      await dom.sharePreviewVideo.play().catch(() => {
        // no-op
      });
      dom.sharePreviewHint.textContent =
        "Kamera önizlemesi aktif. Onaylarsan paylaşım başlatılacak.";
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "bilinmeyen hata";
      setStatus(`Kamera önizlemesi açılamadı: ${message}`, true);
      return false;
    }
  };

  const renderScreenCaptureSourceList = (): void => {
    const selectedMonitor = dom.screenMonitorSelect.value;

    const filtered = screenCaptureSources.filter((source) => {
      if (source.kind !== modalScreenCaptureKind) {
        return false;
      }

      if (
        selectedMonitor !== "all" &&
        source.kind === "screen" &&
        source.displayId !== selectedMonitor
      ) {
        return false;
      }

      return true;
    });

    dom.screenCaptureSourceList.innerHTML = "";

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className =
        "rounded-xl border border-border bg-surface-2/40 p-3 text-xs text-text-muted";
      empty.textContent = "Bu filtrede paylaşılabilir kaynak bulunamadı.";
      dom.screenCaptureSourceList.appendChild(empty);
      selectedScreenCaptureSourceId = null;
      updateSelectedScreenPreviewImage();
      return;
    }

    if (
      !selectedScreenCaptureSourceId ||
      !filtered.some((item) => item.id === selectedScreenCaptureSourceId)
    ) {
      selectedScreenCaptureSourceId = filtered[0]?.id ?? null;
    }

    for (const source of filtered) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "capture-source-card";
      card.classList.toggle(
        "selected",
        source.id === selectedScreenCaptureSourceId,
      );

      const thumb = document.createElement("img");
      thumb.className = "capture-source-thumb";
      thumb.alt = source.name;
      thumb.src =
        source.thumbnailDataUrl ??
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='100%25' height='100%25' fill='%23111425'/%3E%3C/svg%3E";

      const title = document.createElement("div");
      title.className = "text-sm text-text-primary font-medium truncate";
      title.textContent = source.name;

      const meta = document.createElement("div");
      meta.className = "capture-source-meta";
      const kind = document.createElement("span");
      kind.textContent = source.kind === "screen" ? "Tüm ekran" : "Pencere";
      const display = document.createElement("span");
      display.textContent = source.displayId
        ? `Monitör ${source.displayId}`
        : "Monitör -";
      meta.appendChild(kind);
      meta.appendChild(display);

      card.appendChild(thumb);
      card.appendChild(title);
      card.appendChild(meta);
      card.addEventListener("click", () => {
        selectedScreenCaptureSourceId = source.id;
        renderScreenCaptureSourceList();
      });

      dom.screenCaptureSourceList.appendChild(card);
    }

    updateSelectedScreenPreviewImage();
  };

  const refreshScreenCaptureSources = async (): Promise<boolean> => {
    const kinds = [modalScreenCaptureKind] as Array<"screen" | "window">;
    const result = await desktopApi.mediaListCaptureSources({ kinds });
    if (!result.ok || !result.data) {
      setStatus(
        `Ekran kaynakları alınamadı: ${getErrorMessage(result.error)}`,
        true,
      );
      return false;
    }

    screenCaptureSources = resolveCaptureSources(result);

    const monitors = Array.from(
      new Set(
        screenCaptureSources
          .filter((source) => source.kind === "screen")
          .map((source) => source.displayId)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    dom.screenMonitorSelect.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "Tümü";
    dom.screenMonitorSelect.appendChild(allOption);

    for (const monitorId of monitors) {
      const option = document.createElement("option");
      option.value = monitorId;
      option.textContent = `Monitör ${monitorId}`;
      dom.screenMonitorSelect.appendChild(option);
    }

    if (modalScreenCaptureKind === "window") {
      dom.screenMonitorSelect.value = "all";
    }

    dom.screenMonitorSelect.disabled = modalScreenCaptureKind !== "screen";

    renderScreenCaptureSourceList();
    return true;
  };

  const completeScreenModalSelection = (confirmed: boolean): void => {
    if (!screenModalResolver) {
      setScreenModalOpen(false);
      return;
    }

    if (
      confirmed &&
      shareModalMode === "screen" &&
      !selectedScreenCaptureSourceId
    ) {
      setStatus("Paylaşım için bir kaynak seçin", true);
      return;
    }

    const resolver = screenModalResolver;
    screenModalResolver = null;
    setScreenModalOpen(false);
    resolver(confirmed);
  };

  const requestScreenCaptureSourceSelection = async (
    confirmLabel = "Onayla ve Paylaş",
  ): Promise<CaptureSourceItem | null> => {
    setShareModalMode("screen");
    dom.screenShareModalConfirm.textContent = confirmLabel;

    const currentMode = getScreenShareMode();
    const initialKind = currentMode === "window" ? "window" : "screen";
    setScreenCaptureTab(initialKind);

    dom.modalScreenResolutionSelect.value = getScreenResolution();
    dom.modalScreenFpsSelect.value = getScreenFps();

    const refreshed = await refreshScreenCaptureSources();
    if (!refreshed) {
      return null;
    }

    setScreenModalOpen(true);
    const confirmed = await new Promise<boolean>((resolve) => {
      screenModalResolver = resolve;
    });

    if (!confirmed) {
      return null;
    }

    const selected = screenCaptureSources.find(
      (source) => source.id === selectedScreenCaptureSourceId,
    );

    return selected ?? null;
  };

  const requestCameraShareConfirmation = async (): Promise<boolean> => {
    setShareModalMode("camera");
    dom.screenShareModalConfirm.textContent = "Onayla ve Paylaş";
    setScreenModalOpen(true);

    const confirmationPromise = new Promise<boolean>((resolve) => {
      screenModalResolver = resolve;
    });

    const previewReady = await startCameraShareModalPreview();
    if (!previewReady) {
      completeScreenModalSelection(false);
      return confirmationPromise;
    }

    if (dom.screenShareModal.classList.contains("hidden")) {
      completeScreenModalSelection(false);
    }

    return confirmationPromise;
  };

  const closeScreenModal = (): void => {
    setScreenModalOpen(false);
  };

  return {
    setScreenCaptureTab,
    renderScreenCaptureSourceList,
    refreshScreenCaptureSources,
    requestScreenCaptureSourceSelection,
    requestCameraShareConfirmation,
    completeScreenModalSelection,
    closeScreenModal,
  };
};
