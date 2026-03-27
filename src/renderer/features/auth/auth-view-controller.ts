import type { SessionSnapshot } from "../../types/desktop-api";
import type { DomRefs } from "../../ui/dom";

interface AuthViewControllerDeps {
  dom: DomRefs;
  setConnectionState: (message: string, tone: "ok" | "warn" | "error") => void;
  onUnauthenticated: () => void;
}

interface AuthViewController {
  bindNavigationEvents: () => void;
  setAuthPage: (page: "login" | "register") => void;
  renderSession: (snapshot: SessionSnapshot) => void;
  getSelfUserId: () => string | null;
}

export const createAuthViewController = (
  deps: AuthViewControllerDeps,
): AuthViewController => {
  let selfUserId: string | null = null;

  const setAuthPage = (page: "login" | "register"): void => {
    const loginActive = page === "login";
    deps.dom.loginPane.classList.toggle("active", loginActive);
    deps.dom.registerPane.classList.toggle("active", !loginActive);
    deps.dom.loginTab.classList.toggle("active", loginActive);
    deps.dom.registerTab.classList.toggle("active", !loginActive);
  };

  const renderSession = (snapshot: SessionSnapshot): void => {
    if (snapshot.authenticated) {
      selfUserId = snapshot.user ? snapshot.user.id : null;
      deps.dom.authView.classList.add("hidden");
      deps.dom.lobbyView.classList.remove("hidden");
      deps.dom.currentUser.textContent = snapshot.user
        ? snapshot.user.username
        : "-";
      deps.setConnectionState("Kimlik doğrulandı", "ok");
      return;
    }

    selfUserId = null;
    deps.dom.authView.classList.remove("hidden");
    deps.dom.lobbyView.classList.add("hidden");
    deps.dom.currentUser.textContent = "-";
    deps.setConnectionState("Giriş gerekli", "warn");
    setAuthPage("login");
    deps.onUnauthenticated();
  };

  const bindNavigationEvents = (): void => {
    deps.dom.loginTab.addEventListener("click", () => {
      setAuthPage("login");
    });

    deps.dom.registerTab.addEventListener("click", () => {
      setAuthPage("register");
    });

    deps.dom.goRegister.addEventListener("click", () => {
      setAuthPage("register");
    });

    deps.dom.goLogin.addEventListener("click", () => {
      setAuthPage("login");
    });
  };

  return {
    bindNavigationEvents,
    setAuthPage,
    renderSession,
    getSelfUserId: () => selfUserId,
  };
};
