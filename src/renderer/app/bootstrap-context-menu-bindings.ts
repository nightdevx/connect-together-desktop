import type { DomRefs } from "../ui/dom";
import type { LifecycleScope } from "./lifecycle-scope";

interface BootstrapContextMenuBindingsDeps {
  dom: DomRefs;
  lifecycle: LifecycleScope;
  getParticipantAudioMenuUserId: () => string | null;
  closeParticipantAudioMenu: () => void;
  resolveContextMenuUserId: (target: EventTarget | null) => string | null;
  openParticipantAudioMenu: (
    userId: string,
    clientX: number,
    clientY: number,
  ) => void;
  toggleParticipantMute: (userId: string) => void;
  updateParticipantAudioVolume: (userId: string, volumePercent: number) => void;
}

export const bindContextMenuAndParticipantAudioControls = (
  deps: BootstrapContextMenuBindingsDeps,
): void => {
  const {
    dom,
    lifecycle,
    getParticipantAudioMenuUserId,
    closeParticipantAudioMenu,
    resolveContextMenuUserId,
    openParticipantAudioMenu,
    toggleParticipantMute,
    updateParticipantAudioVolume,
  } = deps;

  lifecycle.on(document, "click", (event) => {
    if (getParticipantAudioMenuUserId() === null) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      closeParticipantAudioMenu();
      return;
    }

    if (dom.participantAudioMenu.contains(target)) {
      return;
    }

    closeParticipantAudioMenu();
  });

  lifecycle.on(document, "contextmenu", (event) => {
    if (getParticipantAudioMenuUserId() === null) {
      return;
    }

    const target = event.target;
    if (target instanceof Node && dom.participantAudioMenu.contains(target)) {
      return;
    }

    if (resolveContextMenuUserId(target)) {
      return;
    }

    closeParticipantAudioMenu();
  });

  const handleParticipantContextMenu = (event: MouseEvent): void => {
    const userId = resolveContextMenuUserId(event.target);
    if (!userId) {
      return;
    }

    event.preventDefault();
    openParticipantAudioMenu(userId, event.clientX, event.clientY);
  };

  lifecycle.on(dom.members, "contextmenu", (event) => {
    handleParticipantContextMenu(event as MouseEvent);
  });
  lifecycle.on(dom.participantGrid, "contextmenu", (event) => {
    handleParticipantContextMenu(event as MouseEvent);
  });
  lifecycle.on(dom.usersDirectoryList, "contextmenu", (event) => {
    handleParticipantContextMenu(event as MouseEvent);
  });

  dom.participantAudioMuteToggle.addEventListener("click", () => {
    const userId = getParticipantAudioMenuUserId();
    if (!userId) {
      return;
    }

    toggleParticipantMute(userId);
  });

  dom.participantAudioVolumeSlider.addEventListener("input", () => {
    const userId = getParticipantAudioMenuUserId();
    if (!userId) {
      return;
    }

    updateParticipantAudioVolume(
      userId,
      Number(dom.participantAudioVolumeSlider.value || "100"),
    );
  });

  dom.participantAudioPreset100.addEventListener("click", () => {
    const userId = getParticipantAudioMenuUserId();
    if (!userId) {
      return;
    }

    updateParticipantAudioVolume(userId, 100);
  });

  dom.participantAudioPreset150.addEventListener("click", () => {
    const userId = getParticipantAudioMenuUserId();
    if (!userId) {
      return;
    }

    updateParticipantAudioVolume(userId, 150);
  });

  dom.participantAudioPreset200.addEventListener("click", () => {
    const userId = getParticipantAudioMenuUserId();
    if (!userId) {
      return;
    }

    updateParticipantAudioVolume(userId, 200);
  });
};
