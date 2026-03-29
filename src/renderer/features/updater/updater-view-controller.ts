import type { DesktopApi, DesktopUpdateState } from "../../types/desktop-api";
import type { DomRefs } from "../../ui/dom";

interface UpdaterActionError {
  code?: string;
  message?: string;
  statusCode?: number;
}

interface UpdaterViewControllerDeps {
  dom: DomRefs;
  desktopApi: DesktopApi;
  setStatus: (message: string, isError: boolean) => void;
  getErrorMessage: (error?: { message?: string }) => string;
}

export interface UpdaterViewController {
  renderDesktopUpdateState: (state: DesktopUpdateState) => void;
  bindEvents: () => void;
  initialize: () => Promise<void>;
}

export const createUpdaterViewController = (
  deps: UpdaterViewControllerDeps,
): UpdaterViewController => {
  const { dom, desktopApi, setStatus, getErrorMessage } = deps;
  let latestDesktopUpdateState: DesktopUpdateState | null = null;
  let isActionInFlight = false;

  const formatCheckedAt = (checkedAt: string | null): string => {
    if (!checkedAt) {
      return "-";
    }

    const parsed = new Date(checkedAt);
    if (Number.isNaN(parsed.getTime())) {
      return checkedAt;
    }

    return parsed.toLocaleString("tr-TR");
  };

  const resolveAvailableVersionLabel = (state: DesktopUpdateState): string => {
    return state.availableVersion && state.availableVersion.trim().length > 0
      ? `v${state.availableVersion}`
      : "yeni sürüm";
  };

  const setSettingsSummary = (
    message: string,
    tone: "ok" | "warn" | "error",
  ): void => {
    dom.settingsUpdateSummary.textContent = message;
    dom.settingsUpdateSummary.dataset.tone = tone;
  };

  const setSettingsMeta = (state: DesktopUpdateState): void => {
    const availableVersion =
      state.availableVersion && state.availableVersion.trim().length > 0
        ? `v${state.availableVersion}`
        : "-";

    dom.settingsUpdateMeta.textContent = `Mevcut: v${state.currentVersion} | Uzak: ${availableVersion} | Son kontrol: ${formatCheckedAt(state.checkedAt)}`;
  };

  const setDetailedError = (details: string | null): void => {
    if (!details || details.trim().length === 0) {
      dom.settingsUpdateErrorContainer.classList.add("hidden");
      dom.settingsUpdateErrorContainer.open = false;
      dom.settingsUpdateErrorDetails.textContent = "";
      return;
    }

    dom.settingsUpdateErrorContainer.classList.remove("hidden");
    dom.settingsUpdateErrorContainer.open = true;
    dom.settingsUpdateErrorDetails.textContent = details;
  };

  const setSettingsUpdateInstallButton = (
    options: {
      label: string;
      disabled?: boolean;
    } | null,
  ): void => {
    if (!options) {
      dom.settingsUpdateInstallButton.classList.add("hidden");
      dom.settingsUpdateInstallButton.disabled = false;
      dom.settingsUpdateInstallButton.textContent = "Güncelle";
      return;
    }

    dom.settingsUpdateInstallButton.classList.remove("hidden");
    dom.settingsUpdateInstallButton.disabled = options.disabled === true;
    dom.settingsUpdateInstallButton.textContent = options.label;
  };

  const setActionBusy = (busy: boolean): void => {
    isActionInFlight = busy;
    dom.settingsUpdateCheckButton.disabled = busy;

    if (!busy) {
      dom.settingsUpdateCheckButton.textContent = "Güncelleme Kontrol Et";
      return;
    }

    dom.settingsUpdateCheckButton.textContent = "İşleniyor...";
  };

  const buildActionErrorDetails = (
    actionName: "kontrol" | "güncelleme",
    error: UpdaterActionError | undefined,
    fallbackMessage: string,
    state: DesktopUpdateState | null,
  ): string => {
    const lines = [
      `İşlem: ${actionName}`,
      `Mesaj: ${fallbackMessage}`,
      `Kod: ${error?.code ?? "-"}`,
      `Durum Kodu: ${typeof error?.statusCode === "number" ? error.statusCode : "-"}`,
      `Zaman: ${new Date().toLocaleString("tr-TR")}`,
    ];

    if (state) {
      lines.push(`State Status: ${state.status}`);
      lines.push(`Current Version: v${state.currentVersion}`);
      lines.push(
        `Available Version: ${state.availableVersion ? `v${state.availableVersion}` : "-"}`,
      );
      lines.push(`Last Checked: ${formatCheckedAt(state.checkedAt)}`);
    }

    return lines.join("\n");
  };

  const setUpdateHint = (message: string | null): void => {
    if (!message || message.trim().length === 0) {
      dom.updateHint.textContent = "";
      dom.updateHint.classList.add("hidden");
      return;
    }

    dom.updateHint.textContent = message;
    dom.updateHint.classList.remove("hidden");
  };

  const setUpdateActionButton = (
    options: {
      label: string;
      disabled?: boolean;
    } | null,
  ): void => {
    if (!options) {
      dom.updateActionButton.classList.add("hidden");
      dom.updateActionButton.disabled = false;
      dom.updateActionButton.textContent = "Güncelle";
      return;
    }

    dom.updateActionButton.classList.remove("hidden");
    dom.updateActionButton.disabled = options.disabled === true;
    dom.updateActionButton.textContent = options.label;
  };

  const renderDesktopUpdateState = (state: DesktopUpdateState): void => {
    latestDesktopUpdateState = state;
    const availableVersion = resolveAvailableVersionLabel(state);
    setSettingsMeta(state);
    setDetailedError(state.status === "error" ? state.message : null);

    if (state.status === "disabled") {
      const message =
        state.message ?? "Geliştirme modunda otomatik güncelleme devre dışı.";
      setUpdateHint(message);
      setUpdateActionButton(null);
      setSettingsSummary(message, "warn");
      setSettingsUpdateInstallButton(null);
      dom.settingsUpdateCheckButton.disabled = true;
      dom.settingsUpdateCheckButton.textContent =
        "Paketli Sürümde Kullanılabilir";
      return;
    }

    dom.settingsUpdateCheckButton.disabled =
      isActionInFlight ||
      state.status === "checking" ||
      state.status === "downloading" ||
      state.status === "installing";
    dom.settingsUpdateCheckButton.textContent =
      state.status === "checking"
        ? "Kontrol Ediliyor..."
        : state.status === "downloading"
          ? "İndirme Sürüyor..."
          : state.status === "installing"
            ? "Kurulum Sürüyor..."
            : isActionInFlight
              ? "İşleniyor..."
              : "Güncelleme Kontrol Et";

    if (state.status === "idle" || state.status === "not-available") {
      setUpdateHint(null);
      setUpdateActionButton(null);

      if (state.status === "idle") {
        setSettingsSummary("Henüz güncelleme kontrolü yapılmadı.", "warn");
      } else {
        setSettingsSummary("Uygulama güncel görünüyor.", "ok");
      }

      setSettingsUpdateInstallButton(null);
      return;
    }

    if (state.status === "checking") {
      setUpdateHint("Güncelleme kontrol ediliyor...");
      setUpdateActionButton(null);
      setSettingsSummary("Güncelleme kontrol ediliyor...", "warn");
      setSettingsUpdateInstallButton(null);
      return;
    }

    if (state.status === "available") {
      setUpdateHint(`${availableVersion} var`);
      setUpdateActionButton({
        label: "Güncelle",
      });
      setSettingsSummary(`${availableVersion} indirilmeye hazır.`, "ok");
      setSettingsUpdateInstallButton({
        label: "Güncelle",
        disabled: isActionInFlight,
      });
      return;
    }

    if (state.status === "downloading") {
      const progress = Math.max(
        0,
        Math.min(100, Math.round(state.downloadProgressPercent ?? 0)),
      );
      setUpdateHint(`${availableVersion} indiriliyor (%${progress})`);
      setUpdateActionButton({
        label: "İndiriliyor...",
        disabled: true,
      });
      setSettingsSummary(
        `${availableVersion} indiriliyor (%${progress}).`,
        "warn",
      );
      setSettingsUpdateInstallButton({
        label: "İndiriliyor...",
        disabled: true,
      });
      return;
    }

    if (state.status === "downloaded") {
      setUpdateHint("Güncelleme tamamlandı, otomatik kuruluyor...");
      setUpdateActionButton(null);
      setSettingsSummary(
        `${availableVersion} indirildi. Kurulum tamamlanınca uygulama otomatik yeniden başlayacak.`,
        "ok",
      );
      setSettingsUpdateInstallButton(null);
      return;
    }

    if (state.status === "installing") {
      setUpdateHint("Güncelleme kuruluyor, uygulama yeniden başlatılacak...");
      setUpdateActionButton(null);
      setSettingsSummary(
        `${availableVersion} kuruluyor. Kurulum bitince uygulama otomatik açılacak.`,
        "warn",
      );
      setSettingsUpdateInstallButton({
        label: "Kuruluyor...",
        disabled: true,
      });
      return;
    }

    const errorText =
      typeof state.message === "string" && state.message.trim().length > 0
        ? state.message.trim()
        : "Bilinmeyen hata";

    const isOldFilesUninstallError =
      /failed to uninstall old application files/i.test(errorText) ||
      /onceki surum dosyalari kaldirilamadi/i.test(errorText);

    if (isOldFilesUninstallError) {
      setUpdateHint(
        "Kurulumda eski surum dosyalari kaldirilamadi. Tum Connect Together sureclerini kapatip tekrar deneyin.",
      );
      setUpdateActionButton({
        label: "Tekrar Dene",
      });
      setSettingsSummary(
        "Kurulum dosya kilidi nedeniyle tamamlanamadi.",
        "error",
      );
      setSettingsUpdateInstallButton(null);

      setDetailedError(
        [
          `Mesaj: ${errorText}`,
          `Status: ${state.status}`,
          `Current Version: v${state.currentVersion}`,
          `Available Version: ${state.availableVersion ? `v${state.availableVersion}` : "-"}`,
          `Last Checked: ${formatCheckedAt(state.checkedAt)}`,
          "Oneri: Gorev Yoneticisi'nden acik Connect Together sureclerini kapatin ve guncellemeyi tekrar baslatin.",
        ].join("\n"),
      );
      return;
    }

    setUpdateHint(`Güncelleme hatası: ${errorText}`);
    setUpdateActionButton({
      label: "Tekrar Dene",
    });
    setSettingsSummary("Güncelleme sırasında hata oluştu.", "error");
    setSettingsUpdateInstallButton(null);

    setDetailedError(
      [
        `Mesaj: ${errorText}`,
        `Status: ${state.status}`,
        `Current Version: v${state.currentVersion}`,
        `Available Version: ${state.availableVersion ? `v${state.availableVersion}` : "-"}`,
        `Last Checked: ${formatCheckedAt(state.checkedAt)}`,
      ].join("\n"),
    );
  };

  const checkForUpdates = async (): Promise<void> => {
    if (isActionInFlight) {
      return;
    }

    const currentState = latestDesktopUpdateState;
    if (!currentState || currentState.status === "disabled") {
      return;
    }

    if (
      currentState.status === "checking" ||
      currentState.status === "downloading"
    ) {
      return;
    }

    setActionBusy(true);
    let failureDetails: string | null = null;

    try {
      const checkResult = await desktopApi.checkForUpdates();
      if (!checkResult.ok || !checkResult.data) {
        const message = getErrorMessage(checkResult.error);
        setStatus(`Güncelleme kontrolü başarısız: ${message}`, true);
        setSettingsSummary("Güncelleme kontrolü başarısız.", "error");
        failureDetails = buildActionErrorDetails(
          "kontrol",
          checkResult.error,
          message,
          latestDesktopUpdateState,
        );
        setDetailedError(failureDetails);
        return;
      }

      renderDesktopUpdateState(checkResult.data.state);

      if (checkResult.data.state.status === "not-available") {
        setStatus("Uygulama güncel.", false);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "bilinmeyen hata";
      setStatus(`Güncelleme kontrolü başarısız: ${message}`, true);
      setSettingsSummary("Güncelleme kontrolü başarısız.", "error");
      failureDetails = buildActionErrorDetails(
        "kontrol",
        undefined,
        message,
        latestDesktopUpdateState,
      );
      setDetailedError(failureDetails);
    } finally {
      setActionBusy(false);
      if (latestDesktopUpdateState) {
        renderDesktopUpdateState(latestDesktopUpdateState);
      }

      if (failureDetails) {
        setSettingsSummary("Güncelleme kontrolü başarısız.", "error");
        setDetailedError(failureDetails);
      }
    }
  };

  const applyUpdate = async (): Promise<void> => {
    if (isActionInFlight) {
      return;
    }

    const currentState = latestDesktopUpdateState;
    if (!currentState) {
      return;
    }

    if (currentState.status === "disabled") {
      return;
    }

    if (
      currentState.status !== "available" &&
      currentState.status !== "downloaded"
    ) {
      await checkForUpdates();
      return;
    }

    setActionBusy(true);
    let failureDetails: string | null = null;

    try {
      const applyResult = await desktopApi.applyUpdate();
      if (!applyResult.ok || !applyResult.data) {
        const message = getErrorMessage(applyResult.error);
        setStatus(`Güncelleme işlemi başarısız: ${message}`, true);
        setSettingsSummary("Güncelleme işlemi başarısız.", "error");
        failureDetails = buildActionErrorDetails(
          "güncelleme",
          applyResult.error,
          message,
          latestDesktopUpdateState,
        );
        setDetailedError(failureDetails);
        return;
      }

      renderDesktopUpdateState(applyResult.data.state);

      if (currentState.status === "available") {
        if (applyResult.data.accepted) {
          setStatus(
            "Yeni sürüm indiriliyor, tamamlanınca uygulama otomatik yeniden başlayacak...",
            false,
          );
        } else {
          setStatus("Güncelleme indirilemedi", true);
        }
        return;
      }

      if (currentState.status === "downloaded") {
        setStatus("Uygulama güncelleme için yeniden başlatılıyor...", false);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "bilinmeyen hata";
      setStatus(`Güncelleme işlemi başarısız: ${message}`, true);
      setSettingsSummary("Güncelleme işlemi başarısız.", "error");
      failureDetails = buildActionErrorDetails(
        "güncelleme",
        undefined,
        message,
        latestDesktopUpdateState,
      );
      setDetailedError(failureDetails);
    } finally {
      setActionBusy(false);
      if (latestDesktopUpdateState) {
        renderDesktopUpdateState(latestDesktopUpdateState);
      }

      if (failureDetails) {
        setSettingsSummary("Güncelleme işlemi başarısız.", "error");
        setDetailedError(failureDetails);
      }
    }
  };

  const handleUpdateActionClick = async (): Promise<void> => {
    const currentState = latestDesktopUpdateState;
    if (!currentState) {
      return;
    }

    if (
      currentState.status === "available" ||
      currentState.status === "downloaded"
    ) {
      await applyUpdate();
      return;
    }

    await checkForUpdates();
  };

  const bindEvents = (): void => {
    dom.updateActionButton.addEventListener("click", () => {
      void handleUpdateActionClick();
    });

    dom.settingsUpdateCheckButton.addEventListener("click", () => {
      void checkForUpdates();
    });

    dom.settingsUpdateInstallButton.addEventListener("click", () => {
      void applyUpdate();
    });
  };

  const initialize = async (): Promise<void> => {
    try {
      const initialDesktopUpdateState = await desktopApi.getUpdateState();
      renderDesktopUpdateState(initialDesktopUpdateState);

      if (
        initialDesktopUpdateState.status === "idle" ||
        initialDesktopUpdateState.status === "not-available" ||
        initialDesktopUpdateState.status === "error"
      ) {
        void desktopApi.checkForUpdates().then((result) => {
          if (result.ok && result.data) {
            renderDesktopUpdateState(result.data.state);
          }
        });
      }
    } catch {
      setUpdateHint(null);
      setUpdateActionButton(null);
      setSettingsSummary("Güncelleme durumu alınamadı.", "error");
      setDetailedError("Başlangıç güncelleme durumu alınamadı.");
    }
  };

  return {
    renderDesktopUpdateState,
    bindEvents,
    initialize,
  };
};
