import type {
  DesktopApi,
  SessionSnapshot,
} from "../../shared/desktop-api-types";
import type { DomRefs } from "../ui/dom";

interface BootstrapSessionBindingsDeps {
  dom: DomRefs;
  desktopApi: DesktopApi;
  setStatus: (message: string, isError: boolean) => void;
  getErrorMessage: (error?: { message?: string }) => string;
  onLogoutSuccess: (session: SessionSnapshot) => Promise<void>;
}

export const bindLogoutControl = (deps: BootstrapSessionBindingsDeps): void => {
  const { dom, desktopApi, setStatus, getErrorMessage, onLogoutSuccess } = deps;

  dom.logoutButton.addEventListener("click", async () => {
    await desktopApi.lobbyLeave();
    const result = await desktopApi.logout();
    if (!result.ok || !result.data) {
      setStatus(`Çıkış başarısız: ${getErrorMessage(result.error)}`, true);
      return;
    }

    await onLogoutSuccess(result.data);
    setStatus("Çıkış yapıldı", false);
  });
};
