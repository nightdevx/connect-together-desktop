import type {
  DesktopApi,
  DesktopUpdateState,
  SessionSnapshot,
} from "../../shared/desktop-api-types";
import type { DomRefs } from "../ui/dom";

interface UpdaterControllerLike {
  initialize: () => Promise<void>;
  renderDesktopUpdateState: (state: DesktopUpdateState) => void;
}

interface BootstrapUpdaterSessionInitDeps {
  dom: DomRefs;
  desktopApi: DesktopApi;
  updaterController: UpdaterControllerLike;
  setStatus: (message: string, isError: boolean) => void;
  getErrorMessage: (error?: { message?: string }) => string;
  renderSession: (snapshot: SessionSnapshot) => void;
  setSelfUserId: (userId: string | null) => void;
  onAuthenticatedSession: () => Promise<void>;
  onUnauthenticatedSession: () => void;
  addCleanup: (cleanup: () => void) => void;
}

export const initializeUpdaterAndSession = async (
  deps: BootstrapUpdaterSessionInitDeps,
): Promise<void> => {
  const {
    dom,
    desktopApi,
    updaterController,
    setStatus,
    getErrorMessage,
    renderSession,
    setSelfUserId,
    onAuthenticatedSession,
    onUnauthenticatedSession,
    addCleanup,
  } = deps;

  const appVersion = await desktopApi.getAppVersion();
  dom.version.textContent = appVersion;

  await updaterController.initialize();

  const unsubscribeUpdateEvents = desktopApi.onUpdateEvent((state) => {
    updaterController.renderDesktopUpdateState(state);

    if (state.status === "available") {
      const versionSuffix = state.availableVersion
        ? ` (v${state.availableVersion})`
        : "";
      setStatus(`Yeni sürüm bulundu${versionSuffix}.`, false);
      return;
    }

    if (state.status === "downloaded") {
      setStatus(
        "Yeni sürüm indirildi, uygulama otomatik yeniden başlatılıyor...",
        false,
      );
    }
  });
  addCleanup(unsubscribeUpdateEvents);

  const sessionResult = await desktopApi.getSession();
  if (!sessionResult.ok || !sessionResult.data) {
    renderSession({ authenticated: false, user: null });
    setStatus(
      `Oturum bilgisi alınamadı: ${getErrorMessage(sessionResult.error)}`,
      true,
    );
    return;
  }

  renderSession(sessionResult.data);
  setSelfUserId(sessionResult.data.user?.id ?? null);

  if (sessionResult.data.authenticated) {
    await onAuthenticatedSession();
    setStatus(
      "Oturum hazır. Sohbete bağlanmak için bağlan butonunu kullan.",
      false,
    );
    return;
  }

  onUnauthenticatedSession();
};
