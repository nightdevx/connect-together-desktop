import type { DomRefs } from "../ui/dom";

type ScreenCaptureKind = "any" | "screen" | "window";

interface BootstrapMediaBindingsDeps {
  dom: DomRefs;
  normalizeScreenCaptureKind: (value: string | null) => ScreenCaptureKind;
  setCameraResolution: (value: string) => void;
  setCameraFps: (value: string) => void;
  setScreenResolution: (value: string) => void;
  setScreenFps: (value: string) => void;
  getScreenShareMode: () => ScreenCaptureKind;
  setScreenShareMode: (value: ScreenCaptureKind) => void;
  setScreenCaptureTab: (kind: "screen" | "window") => void;
  persistSharePreferences: () => void;
  onQuickCameraToggle: () => void;
  onQuickScreenToggle: () => void;
  onCameraTestToggle: () => void;
  onScreenTestToggle: () => void;
  completeScreenModalSelection: (confirmed: boolean) => void;
  refreshScreenCaptureSources: () => void;
  renderScreenCaptureSourceList: () => void;
  clearMediaDebugLogs: () => void;
  copyMediaDebugLogs: () => void;
}

export const bindMediaAndShareControls = (
  deps: BootstrapMediaBindingsDeps,
): void => {
  const {
    dom,
    normalizeScreenCaptureKind,
    setCameraResolution,
    setCameraFps,
    setScreenResolution,
    setScreenFps,
    getScreenShareMode,
    setScreenShareMode,
    setScreenCaptureTab,
    persistSharePreferences,
    onQuickCameraToggle,
    onQuickScreenToggle,
    onCameraTestToggle,
    onScreenTestToggle,
    completeScreenModalSelection,
    refreshScreenCaptureSources,
    renderScreenCaptureSourceList,
    clearMediaDebugLogs,
    copyMediaDebugLogs,
  } = deps;

  dom.quickCameraToggle.addEventListener("click", onQuickCameraToggle);
  dom.quickScreenToggle.addEventListener("click", onQuickScreenToggle);

  dom.cameraResolutionSelect.addEventListener("change", () => {
    setCameraResolution(dom.cameraResolutionSelect.value);
    persistSharePreferences();
  });

  dom.cameraFpsSelect.addEventListener("change", () => {
    setCameraFps(dom.cameraFpsSelect.value);
    persistSharePreferences();
  });

  dom.screenResolutionSelect.addEventListener("change", () => {
    setScreenResolution(dom.screenResolutionSelect.value);
    dom.modalScreenResolutionSelect.value = dom.screenResolutionSelect.value;
    persistSharePreferences();
  });

  dom.screenFpsSelect.addEventListener("change", () => {
    setScreenFps(dom.screenFpsSelect.value);
    dom.modalScreenFpsSelect.value = dom.screenFpsSelect.value;
    persistSharePreferences();
  });

  dom.screenShareModeSelect.addEventListener("change", () => {
    const nextMode = normalizeScreenCaptureKind(
      dom.screenShareModeSelect.value,
    );
    setScreenShareMode(nextMode);
    if (nextMode === "screen" || nextMode === "window") {
      setScreenCaptureTab(nextMode);
    }
    persistSharePreferences();
  });

  dom.modalScreenResolutionSelect.addEventListener("change", () => {
    setScreenResolution(dom.modalScreenResolutionSelect.value);
    dom.screenResolutionSelect.value = dom.modalScreenResolutionSelect.value;
    persistSharePreferences();
  });

  dom.modalScreenFpsSelect.addEventListener("change", () => {
    setScreenFps(dom.modalScreenFpsSelect.value);
    dom.screenFpsSelect.value = dom.modalScreenFpsSelect.value;
    persistSharePreferences();
  });

  dom.cameraTestToggle.addEventListener("click", onCameraTestToggle);
  dom.screenTestToggle.addEventListener("click", onScreenTestToggle);

  dom.screenShareModalClose.addEventListener("click", () => {
    completeScreenModalSelection(false);
  });

  dom.screenShareModalCancel.addEventListener("click", () => {
    completeScreenModalSelection(false);
  });

  dom.screenShareModalConfirm.addEventListener("click", () => {
    completeScreenModalSelection(true);
  });

  dom.screenCaptureRefreshButton.addEventListener("click", () => {
    refreshScreenCaptureSources();
  });

  dom.mediaDebugClearButton.addEventListener("click", clearMediaDebugLogs);
  dom.mediaDebugCopyButton.addEventListener("click", copyMediaDebugLogs);

  dom.screenCaptureTabMonitors.addEventListener("click", () => {
    setScreenCaptureTab("screen");
    setScreenShareMode("screen");
    dom.screenShareModeSelect.value = "screen";
    persistSharePreferences();
    refreshScreenCaptureSources();
  });

  dom.screenCaptureTabWindows.addEventListener("click", () => {
    setScreenCaptureTab("window");
    setScreenShareMode("window");
    dom.screenShareModeSelect.value = "window";
    persistSharePreferences();
    refreshScreenCaptureSources();
  });

  dom.screenMonitorSelect.addEventListener("change", () => {
    renderScreenCaptureSourceList();
  });

  dom.screenShareModal.addEventListener("click", (event) => {
    if (event.target === dom.screenShareModal) {
      completeScreenModalSelection(false);
    }
  });

  const mode = getScreenShareMode();
  if (mode === "screen" || mode === "window") {
    setScreenCaptureTab(mode);
  }
};
