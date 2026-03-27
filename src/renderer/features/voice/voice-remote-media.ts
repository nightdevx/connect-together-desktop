import type { MediaSourceType } from "../../../shared/contracts";
import type { DomRefs } from "../../ui/dom";

interface RemoteAudioEntry {
  userId: string;
  container: HTMLDivElement;
  audio: HTMLAudioElement;
  label: HTMLDivElement;
  sourceNode: MediaStreamAudioSourceNode | null;
  gainNode: GainNode | null;
  streamId: string | null;
}

interface RemoteVideoEntry {
  userId: string;
  sourceType: MediaSourceType;
  container: HTMLDivElement;
  video: HTMLVideoElement;
  label: HTMLDivElement;
}

export interface RemoteMediaUiController {
  attachRemoteTrack: (payload: {
    key: string;
    userId: string;
    kind: "audio" | "video";
    sourceType: MediaSourceType;
    stream: MediaStream;
  }) => void;
  updateRemoteLabel: (payload: {
    key: string;
    userId: string;
    kind: "audio" | "video";
    sourceType: MediaSourceType;
  }) => void;
  removeRemoteTrack: (key: string, kind?: "audio" | "video") => void;
  syncRemoteVideoSlots: () => void;
  setRemoteAudioVolume: (volumeLevel: number, muted: boolean) => void;
  setParticipantAudioState: (
    userId: string,
    payload: { muted?: boolean; volumePercent?: number },
  ) => void;
  getParticipantAudioState: (userId: string) => {
    muted: boolean;
    volumePercent: number;
  };
  clearAll: () => void;
}

interface CreateRemoteMediaUiControllerDeps {
  dom: DomRefs;
  resolveMemberName: (userId: string) => string;
}

export const createRemoteMediaUiController = (
  deps: CreateRemoteMediaUiControllerDeps,
): RemoteMediaUiController => {
  const remoteAudioMap = new Map<string, RemoteAudioEntry>();
  const remoteVideoMap = new Map<string, RemoteVideoEntry>();
  const participantAudioStateMap = new Map<
    string,
    { muted: boolean; volumePercent: number }
  >();

  let outputVolumeLevel = 1;
  let outputMuted = false;
  let remoteAudioContext: AudioContext | null = null;

  let expandedVideoKey: string | null = null;

  const clampParticipantVolume = (value: number): number => {
    if (!Number.isFinite(value)) {
      return 100;
    }

    return Math.max(0, Math.min(200, Math.round(value)));
  };

  const applyRemoteAudioStateToAllEntries = (): void => {
    for (const entry of remoteAudioMap.values()) {
      ensureRemoteAudioGraphForEntry(entry);
      applyRemoteAudioStateToEntry(entry);
    }
  };

  const disconnectRemoteAudioGraphForEntry = (
    entry: RemoteAudioEntry,
  ): void => {
    try {
      entry.sourceNode?.disconnect();
    } catch {
      // no-op
    }

    try {
      entry.gainNode?.disconnect();
    } catch {
      // no-op
    }

    entry.sourceNode = null;
    entry.gainNode = null;
    entry.streamId = null;
  };

  const getParticipantAudioStateInternal = (
    userId: string,
  ): { muted: boolean; volumePercent: number } => {
    const existing = participantAudioStateMap.get(userId);
    if (existing) {
      return existing;
    }

    return {
      muted: false,
      volumePercent: 100,
    };
  };

  const ensureRemoteAudioContext = (): AudioContext | null => {
    if (!remoteAudioContext) {
      try {
        remoteAudioContext = new AudioContext({
          latencyHint: "interactive",
        });

        remoteAudioContext.onstatechange = () => {
          if (remoteAudioContext?.state === "running") {
            for (const entry of remoteAudioMap.values()) {
              ensureRemoteAudioGraphForEntry(entry);
            }
          }
          applyRemoteAudioStateToAllEntries();
        };
      } catch {
        return null;
      }
    }

    if (remoteAudioContext.state === "suspended") {
      void remoteAudioContext.resume().catch(() => {
        // no-op
      });
    }

    return remoteAudioContext;
  };

  const getStreamId = (stream: MediaStream): string => {
    return stream.id || stream.getAudioTracks()[0]?.id || "";
  };

  const ensureRemoteAudioGraphForEntry = (entry: RemoteAudioEntry): void => {
    const stream = entry.audio.srcObject;
    if (!(stream instanceof MediaStream)) {
      disconnectRemoteAudioGraphForEntry(entry);
      return;
    }

    const audioContext = ensureRemoteAudioContext();
    if (!audioContext || audioContext.state !== "running") {
      return;
    }

    const nextStreamId = getStreamId(stream);
    if (entry.sourceNode && entry.gainNode && entry.streamId === nextStreamId) {
      return;
    }

    disconnectRemoteAudioGraphForEntry(entry);

    try {
      const sourceNode = audioContext.createMediaStreamSource(stream);
      const gainNode = audioContext.createGain();
      sourceNode.connect(gainNode);
      gainNode.connect(audioContext.destination);
      entry.sourceNode = sourceNode;
      entry.gainNode = gainNode;
      entry.streamId = nextStreamId;
    } catch {
      disconnectRemoteAudioGraphForEntry(entry);
    }
  };

  const tryResumeRemoteAudioContext = (): void => {
    const context = ensureRemoteAudioContext();
    if (!context) {
      return;
    }

    if (context.state === "running") {
      for (const entry of remoteAudioMap.values()) {
        ensureRemoteAudioGraphForEntry(entry);
      }
      applyRemoteAudioStateToAllEntries();
      return;
    }

    void context
      .resume()
      .then(() => {
        for (const entry of remoteAudioMap.values()) {
          ensureRemoteAudioGraphForEntry(entry);
        }
        applyRemoteAudioStateToAllEntries();
      })
      .catch(() => {
        // no-op
      });
  };

  const applyRemoteAudioStateToEntry = (entry: RemoteAudioEntry): void => {
    const participantState = getParticipantAudioStateInternal(entry.userId);
    const participantGain = participantState.muted
      ? 0
      : participantState.volumePercent / 100;
    const effectiveGain = outputMuted
      ? 0
      : Math.max(0, outputVolumeLevel * participantGain);

    const canUseGainNode =
      Boolean(entry.gainNode) && remoteAudioContext?.state === "running";

    if (canUseGainNode && entry.gainNode) {
      entry.audio.muted = true;
      entry.gainNode.gain.value = Math.max(0, Math.min(2, effectiveGain));
      return;
    }

    entry.audio.muted = false;
    entry.audio.volume = Math.max(0, Math.min(1, effectiveGain));
  };

  const handlePlaybackUnlock = (): void => {
    tryResumeRemoteAudioContext();
  };

  window.addEventListener("pointerdown", handlePlaybackUnlock, {
    passive: true,
  });
  window.addEventListener("keydown", handlePlaybackUnlock);

  const applyRemoteAudioStateToUser = (userId: string): void => {
    for (const entry of remoteAudioMap.values()) {
      if (entry.userId !== userId) {
        continue;
      }

      applyRemoteAudioStateToEntry(entry);
    }
  };

  const createMediaPlaceholder = (): HTMLDivElement => {
    const placeholder = document.createElement("div");
    placeholder.className = "participant-media-placeholder";

    const logo = document.createElement("img");
    logo.className = "participant-media-placeholder-logo";
    logo.src = "./images/logo.png";
    logo.alt = "Connect Together";

    const text = document.createElement("span");
    text.className = "participant-media-placeholder-text";
    text.textContent = "Kamera veya ekran kapali";

    placeholder.appendChild(logo);
    placeholder.appendChild(text);

    return placeholder;
  };

  const findParticipantMediaSlot = (userId: string): HTMLElement | null => {
    const slots = deps.dom.participantGrid.querySelectorAll<HTMLElement>(
      "[data-participant-media-slot]",
    );
    for (const slot of Array.from(slots)) {
      if (slot.dataset.participantMediaSlot === userId) {
        return slot;
      }
    }

    return null;
  };

  const clearSlotPlaceholder = (slot: HTMLElement): void => {
    const placeholder = slot.querySelector(".participant-media-placeholder");
    if (placeholder) {
      placeholder.remove();
    }
  };

  const restoreSlotPlaceholderIfEmpty = (slot: HTMLElement): void => {
    const hasStreamCard = slot.querySelector(".participant-stream-card");
    if (hasStreamCard) {
      return;
    }

    const placeholder = createMediaPlaceholder();
    slot.appendChild(placeholder);
  };

  const applyExpandedMediaState = (): void => {
    for (const card of Array.from(
      deps.dom.participantGrid.querySelectorAll<HTMLElement>(
        ".participant-card",
      ),
    )) {
      card.classList.remove("is-spotlight", "is-dimmed");
    }

    for (const entry of remoteVideoMap.values()) {
      entry.container.classList.remove("is-expanded");
    }

    if (!expandedVideoKey) {
      deps.dom.participantGrid.classList.remove("has-expanded-media");
      return;
    }

    const expandedEntry = remoteVideoMap.get(expandedVideoKey);
    if (!expandedEntry || !expandedEntry.container.isConnected) {
      expandedVideoKey = null;
      deps.dom.participantGrid.classList.remove("has-expanded-media");
      return;
    }

    const spotlightCard =
      expandedEntry.container.closest<HTMLElement>(".participant-card");
    if (!spotlightCard) {
      expandedVideoKey = null;
      deps.dom.participantGrid.classList.remove("has-expanded-media");
      return;
    }

    deps.dom.participantGrid.classList.add("has-expanded-media");
    expandedEntry.container.classList.add("is-expanded");

    for (const card of Array.from(
      deps.dom.participantGrid.querySelectorAll<HTMLElement>(
        ".participant-card",
      ),
    )) {
      if (card === spotlightCard) {
        card.classList.add("is-spotlight");
      } else {
        card.classList.add("is-dimmed");
      }
    }
  };

  const syncFullscreenState = (): void => {
    const fullscreenElement = document.fullscreenElement;
    for (const entry of remoteVideoMap.values()) {
      entry.container.classList.toggle(
        "is-native-fullscreen",
        fullscreenElement === entry.container,
      );
    }
  };

  document.addEventListener("fullscreenchange", () => {
    syncFullscreenState();
  });

  const attachVideoEntryToSlot = (entry: RemoteVideoEntry): void => {
    const slot = findParticipantMediaSlot(entry.userId);
    if (!slot) {
      return;
    }

    clearSlotPlaceholder(slot);
    if (entry.container.parentElement !== slot) {
      slot.appendChild(entry.container);
    }

    applyExpandedMediaState();
  };

  const formatRemoteConsumerLabel = (
    userId: string,
    kind: "audio" | "video",
    sourceType: MediaSourceType,
  ): string => {
    const name = deps.resolveMemberName(userId);
    if (kind === "audio") {
      return `Ses: ${name}`;
    }

    if (sourceType === "screen") {
      return `Ekran: ${name}`;
    }

    return `Kamera: ${name}`;
  };

  const attachRemoteAudio = (
    key: string,
    userId: string,
    labelText: string,
    stream: MediaStream,
  ): void => {
    let existing = remoteAudioMap.get(key);
    if (!existing) {
      const container = document.createElement("div");
      container.className = "remote-audio-item";

      const label = document.createElement("div");
      label.textContent = labelText;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.playsInline = true;

      container.appendChild(label);
      container.appendChild(audio);
      deps.dom.remoteAudioContainer.appendChild(container);

      existing = {
        userId,
        container,
        audio,
        label,
        sourceNode: null,
        gainNode: null,
        streamId: null,
      };
      remoteAudioMap.set(key, existing);
    }

    const nextStreamId = getStreamId(stream);
    if (existing.streamId && existing.streamId !== nextStreamId) {
      disconnectRemoteAudioGraphForEntry(existing);
    }

    existing.userId = userId;
    existing.label.textContent = labelText;
    existing.audio.srcObject = stream;
    existing.streamId = nextStreamId;
    ensureRemoteAudioGraphForEntry(existing);
    void existing.audio.play().catch(() => {
      // no-op
    });
    tryResumeRemoteAudioContext();
    applyRemoteAudioStateToEntry(existing);
  };

  const attachRemoteVideo = (
    key: string,
    userId: string,
    sourceType: MediaSourceType,
    labelText: string,
    stream: MediaStream,
  ): void => {
    let existing = remoteVideoMap.get(key);
    if (!existing) {
      const container = document.createElement("div");
      container.className =
        "participant-stream-card rounded-lg border border-border bg-surface-2/65 p-2 flex flex-col gap-2";

      const label = document.createElement("div");
      label.className = "participant-stream-label";
      label.textContent = labelText;

      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.className = "w-full rounded-lg bg-surface-0";
      video.title = "Tikla ve bu alanda buyut";

      const fullscreenButton = document.createElement("button");
      fullscreenButton.type = "button";
      fullscreenButton.className = "participant-stream-fullscreen-button";
      fullscreenButton.title = "Tam ekran";
      fullscreenButton.textContent = "Tam ekran";

      fullscreenButton.addEventListener("click", (event) => {
        event.stopPropagation();
        void container.requestFullscreen().catch(() => {
          // no-op
        });
      });

      const exitFullscreenButton = document.createElement("button");
      exitFullscreenButton.type = "button";
      exitFullscreenButton.className = "participant-stream-exit-fullscreen";
      exitFullscreenButton.title = "Kucuk ekran";
      exitFullscreenButton.textContent = "Kucuk ekran";

      exitFullscreenButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (document.fullscreenElement !== container) {
          return;
        }

        void document.exitFullscreen().catch(() => {
          // no-op
        });
      });

      container.addEventListener("click", (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest("button")) {
          return;
        }

        expandedVideoKey = expandedVideoKey === key ? null : key;
        applyExpandedMediaState();
      });

      container.appendChild(label);
      container.appendChild(video);
      container.appendChild(fullscreenButton);
      container.appendChild(exitFullscreenButton);

      existing = { userId, sourceType, container, video, label };
      remoteVideoMap.set(key, existing);
    }

    existing.userId = userId;
    existing.sourceType = sourceType;
    existing.container.dataset.sourceType = sourceType;
    existing.label.textContent = labelText;
    existing.video.srcObject = stream;
    attachVideoEntryToSlot(existing);
    syncFullscreenState();
  };

  const removeRemoteAudio = (key: string): void => {
    const existing = remoteAudioMap.get(key);
    if (!existing) {
      return;
    }

    existing.audio.srcObject = null;
    existing.audio.pause();
    disconnectRemoteAudioGraphForEntry(existing);

    existing.container.remove();
    remoteAudioMap.delete(key);

    if (remoteAudioMap.size === 0 && remoteAudioContext) {
      void remoteAudioContext.close().catch(() => {
        // no-op
      });
      remoteAudioContext = null;
    }
  };

  const removeRemoteVideo = (key: string): void => {
    const existing = remoteVideoMap.get(key);
    if (!existing) {
      return;
    }

    if (document.fullscreenElement === existing.container) {
      void document.exitFullscreen().catch(() => {
        // no-op
      });
    }

    const parent = existing.container.parentElement as HTMLElement | null;
    existing.video.srcObject = null;
    existing.container.remove();
    remoteVideoMap.delete(key);

    if (expandedVideoKey === key) {
      expandedVideoKey = null;
    }

    if (parent?.dataset.participantMediaSlot) {
      restoreSlotPlaceholderIfEmpty(parent);
    }

    applyExpandedMediaState();
    syncFullscreenState();
  };

  const updateRemoteAudioLabel = (key: string, labelText: string): void => {
    const existing = remoteAudioMap.get(key);
    if (existing) {
      existing.label.textContent = labelText;
    }
  };

  const updateRemoteVideoLabel = (key: string, labelText: string): void => {
    const existing = remoteVideoMap.get(key);
    if (existing) {
      existing.label.textContent = labelText;
    }
  };

  const attachRemoteTrack: RemoteMediaUiController["attachRemoteTrack"] = (
    payload,
  ) => {
    const label = formatRemoteConsumerLabel(
      payload.userId,
      payload.kind,
      payload.sourceType,
    );

    if (payload.kind === "video") {
      attachRemoteVideo(
        payload.key,
        payload.userId,
        payload.sourceType,
        label,
        payload.stream,
      );
      return;
    }

    attachRemoteAudio(payload.key, payload.userId, label, payload.stream);
  };

  const updateRemoteLabel: RemoteMediaUiController["updateRemoteLabel"] = (
    payload,
  ) => {
    const label = formatRemoteConsumerLabel(
      payload.userId,
      payload.kind,
      payload.sourceType,
    );

    if (payload.kind === "video") {
      updateRemoteVideoLabel(payload.key, label);
      return;
    }

    updateRemoteAudioLabel(payload.key, label);
  };

  const removeRemoteTrack: RemoteMediaUiController["removeRemoteTrack"] = (
    key,
    kind,
  ) => {
    if (kind === "audio") {
      removeRemoteAudio(key);
      return;
    }

    if (kind === "video") {
      removeRemoteVideo(key);
      return;
    }

    removeRemoteAudio(key);
    removeRemoteVideo(key);
  };

  const setRemoteAudioVolume: RemoteMediaUiController["setRemoteAudioVolume"] =
    (volumeLevel, muted) => {
      outputVolumeLevel = Math.max(0, Math.min(1, volumeLevel));
      outputMuted = muted;
      tryResumeRemoteAudioContext();
      applyRemoteAudioStateToAllEntries();
    };

  const setParticipantAudioState: RemoteMediaUiController["setParticipantAudioState"] =
    (userId, payload) => {
      if (!userId) {
        return;
      }

      const current = getParticipantAudioStateInternal(userId);
      const next = {
        muted: payload.muted ?? current.muted,
        volumePercent:
          payload.volumePercent === undefined
            ? current.volumePercent
            : clampParticipantVolume(payload.volumePercent),
      };

      participantAudioStateMap.set(userId, next);
      tryResumeRemoteAudioContext();
      applyRemoteAudioStateToUser(userId);
    };

  const getParticipantAudioState: RemoteMediaUiController["getParticipantAudioState"] =
    (userId) => {
      const state = getParticipantAudioStateInternal(userId);
      return {
        muted: state.muted,
        volumePercent: state.volumePercent,
      };
    };

  const syncRemoteVideoSlots: RemoteMediaUiController["syncRemoteVideoSlots"] =
    () => {
      for (const entry of remoteVideoMap.values()) {
        attachVideoEntryToSlot(entry);
      }

      applyExpandedMediaState();
      syncFullscreenState();
    };

  const clearAll = (): void => {
    for (const key of Array.from(remoteAudioMap.keys())) {
      removeRemoteAudio(key);
    }

    for (const key of Array.from(remoteVideoMap.keys())) {
      removeRemoteVideo(key);
    }

    if (remoteAudioContext) {
      remoteAudioContext.onstatechange = null;
      void remoteAudioContext.close().catch(() => {
        // no-op
      });
      remoteAudioContext = null;
    }

    expandedVideoKey = null;
    applyExpandedMediaState();
    syncFullscreenState();
  };

  return {
    attachRemoteTrack,
    updateRemoteLabel,
    removeRemoteTrack,
    syncRemoteVideoSlots,
    setRemoteAudioVolume,
    setParticipantAudioState,
    getParticipantAudioState,
    clearAll,
  };
};
