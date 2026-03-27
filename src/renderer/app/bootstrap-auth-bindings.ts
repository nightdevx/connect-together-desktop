import type {
  DesktopApi,
  SessionSnapshot,
} from "../../shared/desktop-api-types";
import type { DomRefs } from "../ui/dom";

interface BootstrapAuthBindingsDeps {
  dom: DomRefs;
  desktopApi: DesktopApi;
  setStatus: (message: string, isError: boolean) => void;
  getErrorMessage: (error?: { message?: string }) => string;
  renderSession: (snapshot: SessionSnapshot) => void;
  setSelfUserId: (userId: string | null) => void;
  onSessionAuthenticated: () => Promise<void>;
  onProfileDisplayNameUpdated: (displayName: string) => Promise<void>;
}

const handleAuthSuccess = async (
  snapshot: SessionSnapshot,
  deps: BootstrapAuthBindingsDeps,
): Promise<void> => {
  deps.renderSession(snapshot);
  deps.setSelfUserId(snapshot.user?.id ?? null);
  await deps.onSessionAuthenticated();
};

export const bindAuthAndProfileForms = (
  deps: BootstrapAuthBindingsDeps,
): void => {
  const { dom, desktopApi, setStatus, getErrorMessage } = deps;

  dom.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      username: dom.loginUsername.value,
      password: dom.loginPassword.value,
    };

    const result = await desktopApi.login(payload);
    if (!result.ok || !result.data) {
      setStatus(`Giriş başarısız: ${getErrorMessage(result.error)}`, true);
      return;
    }

    await handleAuthSuccess(result.data, deps);
    setStatus(
      "Giriş başarılı. Sohbete bağlanmak için bağlan butonunu kullan.",
      false,
    );
  });

  dom.registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      username: dom.registerUsername.value,
      password: dom.registerPassword.value,
    };

    const result = await desktopApi.register(payload);
    if (!result.ok || !result.data) {
      if (result.error?.code === "INVALID_INVITE_CODE") {
        setStatus(
          "Kayıt için davet kodu gerekmiyor. Backend sürecini yeniden başlatıp tekrar deneyin.",
          true,
        );
        return;
      }

      setStatus(`Kayıt başarısız: ${getErrorMessage(result.error)}`, true);
      return;
    }

    await handleAuthSuccess(result.data, deps);
    setStatus(
      "Kayıt ve giriş başarılı. Sohbete bağlanmak için bağlan butonunu kullan.",
      false,
    );
  });

  dom.profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const displayName = dom.profileDisplayName.value.trim();
    const email = dom.profileEmail.value.trim();
    const bio = dom.profileBio.value.trim();

    if (displayName.length < 3) {
      setStatus("Görünen ad en az 3 karakter olmalı", true);
      return;
    }

    const result = await desktopApi.updateProfile({
      displayName,
      email: email.length > 0 ? email : null,
      bio: bio.length > 0 ? bio : null,
    });

    if (!result.ok || !result.data) {
      setStatus(
        `Profil güncellenemedi: ${getErrorMessage(result.error)}`,
        true,
      );
      return;
    }

    dom.currentUser.textContent = result.data.profile.displayName;
    await deps.onProfileDisplayNameUpdated(result.data.profile.displayName);
    setStatus("Profil bilgileri güncellendi", false);
  });

  dom.passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const currentPassword = dom.currentPassword.value;
    const newPassword = dom.newPassword.value;
    const confirmPassword = dom.confirmPassword.value;

    if (newPassword !== confirmPassword) {
      setStatus("Yeni şifre alanları birbiriyle uyuşmuyor", true);
      return;
    }

    const result = await desktopApi.changePassword({
      currentPassword,
      newPassword,
    });

    if (!result.ok || !result.data) {
      setStatus(
        `Şifre değişikliği başarısız: ${getErrorMessage(result.error)}`,
        true,
      );
      return;
    }

    dom.passwordForm.reset();
    setStatus("Şifre başarıyla güncellendi", false);
  });
};
