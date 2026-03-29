import type { MediaSourceType } from "../../../shared/contracts";
import type { DomRefs } from "../../ui/dom";

interface RemoteAudioEntry {
  userId: string;
  container: HTMLDivElement;
  audio: HTMLAudioElement;
  label: HTMLDivElement;
  sourceNode: MediaStreamAudioSourceNode | null;
  splitterNode: ChannelSplitterNode | null;
  leftMixGainNode: GainNode | null;
  rightMixGainNode: GainNode | null;
  mergerNode: ChannelMergerNode | null;
  gainNode: GainNode | null;
  streamId: string | null;
}

interface RemoteVideoEntry {
  userId: string;
  sourceType: MediaSourceType;
  container: HTMLDivElement;
  video: HTMLVideoElement;
  label: HTMLDivElement;
  liveKitTrack: any | null;
}

interface ExpandedVideoSelection {
  key: string;
  userId: string;
  sourceType: MediaSourceType;
}

export interface RemoteMediaUiController {
  attachRemoteTrack: (payload: {
    key: string;
    userId: string;
    kind: "audio" | "video";
    sourceType: MediaSourceType;
    stream?: MediaStream;
    trackRef?: any;
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

  let expandedVideoSelection: ExpandedVideoSelection | null = null;

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
      entry.splitterNode?.disconnect();
    } catch {
      // no-op
    }

    try {
      entry.leftMixGainNode?.disconnect();
    } catch {
      // no-op
    }

    try {
      entry.rightMixGainNode?.disconnect();
    } catch {
      // no-op
    }

    try {
      entry.mergerNode?.disconnect();
    } catch {
      // no-op
    }

    try {
      entry.gainNode?.disconnect();
    } catch {
      // no-op
    }

    entry.sourceNode = null;
    entry.splitterNode = null;
    entry.leftMixGainNode = null;
    entry.rightMixGainNode = null;
    entry.mergerNode = null;
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
      const splitterNode = audioContext.createChannelSplitter(2);
      const leftMixGainNode = audioContext.createGain();
      const rightMixGainNode = audioContext.createGain();
      const mergerNode = audioContext.createChannelMerger(2);
      const gainNode = audioContext.createGain();

      // Force dual-mono output to prevent one-sided playback on some devices.
      leftMixGainNode.gain.value = 0.5;
      rightMixGainNode.gain.value = 0.5;

      sourceNode.connect(splitterNode);
      splitterNode.connect(leftMixGainNode, 0);
      splitterNode.connect(rightMixGainNode, 1);

      leftMixGainNode.connect(mergerNode, 0, 0);
      leftMixGainNode.connect(mergerNode, 0, 1);
      rightMixGainNode.connect(mergerNode, 0, 0);
      rightMixGainNode.connect(mergerNode, 0, 1);

      mergerNode.connect(gainNode);
      gainNode.connect(audioContext.destination);

      entry.sourceNode = sourceNode;
      entry.splitterNode = splitterNode;
      entry.leftMixGainNode = leftMixGainNode;
      entry.rightMixGainNode = rightMixGainNode;
      entry.mergerNode = mergerNode;
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

  const createMediaPlaceholder = (displayName: string): HTMLDivElement => {
    const placeholder = document.createElement("div");
    placeholder.className = "participant-media-placeholder";

    const initials = document.createElement("span");
    initials.className = "participant-media-placeholder-initial";
    initials.textContent = displayName.charAt(0).toUpperCase();

    const text = document.createElement("span");
    text.className = "participant-media-placeholder-text";
    text.textContent = "Kamera veya ekran kapalı";

    placeholder.appendChild(initials);
    placeholder.appendChild(text);

    return placeholder;
  };

  const findParticipantMediaSlot = (
    userId: string,
    sourceType: MediaSourceType,
  ): HTMLElement | null => {
    const preferredKey = `${userId}:${sourceType}`;
    const slots = deps.dom.participantGrid.querySelectorAll<HTMLElement>(
      "[data-participant-media-slot]",
    );

    for (const slot of Array.from(slots)) {
      if (slot.dataset.participantMediaSlot === preferredKey) {
        return slot;
      }
    }

    for (const slot of Array.from(slots)) {
      if (slot.dataset.participantMediaSlot === userId) {
        return slot;
      }
    }

    for (const slot of Array.from(slots)) {
      const slotKey = slot.dataset.participantMediaSlot ?? "";
      if (slotKey.startsWith(`${userId}:`)) {
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

    const rawKey = slot.dataset.participantMediaSlot ?? "";
    const userId = rawKey.split(":")[0] ?? rawKey;
    const displayName = deps.resolveMemberName(userId || rawKey);
    const placeholder = createMediaPlaceholder(displayName);
    slot.appendChild(placeholder);
  };

  const resolveExpandedVideoEntry = (): RemoteVideoEntry | null => {
    if (!expandedVideoSelection) {
      return null;
    }

    const entryByKey = remoteVideoMap.get(expandedVideoSelection.key);
    if (entryByKey) {
      expandedVideoSelection = {
        key: expandedVideoSelection.key,
        userId: entryByKey.userId,
        sourceType: entryByKey.sourceType,
      };
      return entryByKey;
    }

    for (const [key, entry] of remoteVideoMap.entries()) {
      if (
        entry.userId === expandedVideoSelection.userId &&
        entry.sourceType === expandedVideoSelection.sourceType
      ) {
        expandedVideoSelection = {
          key,
          userId: entry.userId,
          sourceType: entry.sourceType,
        };
        return entry;
      }
    }

    return null;
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

    delete deps.dom.participantGrid.dataset.otherCount;

    if (!expandedVideoSelection) {
      deps.dom.participantGrid.classList.remove("has-expanded-media");
      return;
    }

    const expandedEntry = resolveExpandedVideoEntry();
    if (!expandedEntry) {
      expandedVideoSelection = null;
      deps.dom.participantGrid.classList.remove("has-expanded-media");
      return;
    }

    if (!expandedEntry.container.isConnected) {
      deps.dom.participantGrid.classList.remove("has-expanded-media");
      return;
    }

    const spotlightCard =
      expandedEntry.container.closest<HTMLElement>(".participant-card");
    if (!spotlightCard) {
      deps.dom.participantGrid.classList.remove("has-expanded-media");
      return;
    }

    deps.dom.participantGrid.classList.add("has-expanded-media");
    expandedEntry.container.classList.add("is-expanded");

    const stageCards = Array.from(
      deps.dom.participantGrid.querySelectorAll<HTMLElement>(
        ".participant-card",
      ),
    );
    deps.dom.participantGrid.dataset.otherCount = String(
      Math.max(0, stageCards.length - 1),
    );

    for (const card of stageCards) {
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
    const slot = findParticipantMediaSlot(entry.userId, entry.sourceType);
    if (!slot) {
      return;
    }

    clearSlotPlaceholder(slot);
    if (entry.container.parentElement !== slot) {
      slot.appendChild(entry.container);
    }
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
      audio.setAttribute("playsinline", "");

      container.appendChild(label);
      container.appendChild(audio);
      deps.dom.remoteAudioContainer.appendChild(container);

      existing = {
        userId,
        container,
        audio,
        label,
        sourceNode: null,
        splitterNode: null,
        leftMixGainNode: null,
        rightMixGainNode: null,
        mergerNode: null,
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
    trackRef?: any,
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
      fullscreenButton.title = "Tam ekrana gec";
      fullscreenButton.setAttribute("aria-label", "Tam ekrana gec");
      fullscreenButton.innerHTML =
        '<svg viewBox="0 0 24 24" class="w-4 h-4 fill-current" aria-hidden="true" focusable="false"><path d="M4 9a1 1 0 0 0 2 0V6h3a1 1 0 1 0 0-2H5a1 1 0 0 0-1 1v4Zm15 0a1 1 0 1 0 2 0V5a1 1 0 0 0-1-1h-4a1 1 0 1 0 0 2h3v3ZM4 15a1 1 0 0 1 2 0v3h3a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1v-4Zm16 0a1 1 0 1 1 2 0v4a1 1 0 0 1-1 1h-4a1 1 0 1 1 0-2h3v-3Z"/></svg>';

      fullscreenButton.addEventListener("click", (event) => {
        event.stopPropagation();
        void container.requestFullscreen().catch(() => {
          // no-op
        });
      });

      const exitFullscreenButton = document.createElement("button");
      exitFullscreenButton.type = "button";
      exitFullscreenButton.className = "participant-stream-exit-fullscreen";
      exitFullscreenButton.title = "Tam ekrandan cik";
      exitFullscreenButton.setAttribute("aria-label", "Tam ekrandan cik");
      exitFullscreenButton.innerHTML =
        '<svg viewBox="0 0 24 24" class="w-4 h-4 fill-current" aria-hidden="true" focusable="false"><path d="M9 4a1 1 0 0 1 0 2H7.41L10 8.59A1 1 0 0 1 8.59 10L6 7.41V9a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1h4Zm6 0a1 1 0 1 0 0 2h1.59L14 8.59A1 1 0 0 0 15.41 10L18 7.41V9a1 1 0 1 0 2 0V5a1 1 0 0 0-1-1h-4Zm-5 11.41L7.41 18H9a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1v-4a1 1 0 1 1 2 0v1.59L8.59 14A1 1 0 0 1 10 15.41Zm4 0L16.59 18H15a1 1 0 1 0 0 2h4a1 1 0 0 0 1-1v-4a1 1 0 1 0-2 0v1.59L15.41 14A1 1 0 1 0 14 15.41Z"/></svg>';

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

        const selectedEntry = remoteVideoMap.get(key);
        const isSameSelection = expandedVideoSelection?.key === key;
        expandedVideoSelection = isSameSelection
          ? null
          : {
              key,
              userId: selectedEntry?.userId ?? userId,
              sourceType: selectedEntry?.sourceType ?? sourceType,
            };
        applyExpandedMediaState();
      });

      container.appendChild(label);
      container.appendChild(video);
      container.appendChild(fullscreenButton);
      container.appendChild(exitFullscreenButton);

      existing = {
        userId,
        sourceType,
        container,
        video,
        label,
        liveKitTrack: null,
      };
      remoteVideoMap.set(key, existing);
    }

    const detachLiveKitTrack = (): void => {
      if (
        !existing?.liveKitTrack ||
        typeof existing.liveKitTrack.detach !== "function"
      ) {
        return;
      }

      try {
        existing.liveKitTrack.detach(existing.video);
      } catch {
        // no-op
      }
    };

    if (existing.liveKitTrack !== trackRef) {
      detachLiveKitTrack();
      existing.liveKitTrack = trackRef ?? null;
    }

    existing.userId = userId;
    existing.sourceType = sourceType;
    existing.container.dataset.sourceType = sourceType;
    existing.label.textContent = labelText;

    if (
      existing.liveKitTrack &&
      typeof existing.liveKitTrack.attach === "function"
    ) {
      try {
        existing.liveKitTrack.attach(existing.video);
      } catch {
        existing.video.srcObject = stream;
      }
    } else {
      existing.video.srcObject = stream;
    }

    attachVideoEntryToSlot(existing);
    applyExpandedMediaState();
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

    if (
      existing.liveKitTrack &&
      typeof existing.liveKitTrack.detach === "function"
    ) {
      try {
        existing.liveKitTrack.detach(existing.video);
      } catch {
        // no-op
      }
    }

    existing.container.remove();
    remoteVideoMap.delete(key);

    if (expandedVideoSelection?.key === key) {
      let replacement: ExpandedVideoSelection | null = null;
      for (const [replacementKey, entry] of remoteVideoMap.entries()) {
        if (replacementKey === key) {
          continue;
        }

        if (
          entry.userId === existing.userId &&
          entry.sourceType === existing.sourceType
        ) {
          replacement = {
            key: replacementKey,
            userId: entry.userId,
            sourceType: entry.sourceType,
          };
          break;
        }
      }

      expandedVideoSelection = replacement;
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
      const fallbackStream =
        payload.stream ??
        (() => {
          const mediaStreamTrack = payload.trackRef?.mediaStreamTrack as
            | MediaStreamTrack
            | undefined;
          if (!mediaStreamTrack) {
            return null;
          }

          return new MediaStream([mediaStreamTrack]);
        })();

      if (!fallbackStream) {
        return;
      }

      attachRemoteVideo(
        payload.key,
        payload.userId,
        payload.sourceType,
        label,
        fallbackStream,
        payload.trackRef,
      );
      return;
    }

    if (!payload.stream) {
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

    expandedVideoSelection = null;
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
