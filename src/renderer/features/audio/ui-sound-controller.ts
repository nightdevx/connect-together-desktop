export type UiSoundEffect =
  | "mic-on"
  | "mic-off"
  | "headphone-on"
  | "headphone-off"
  | "connect"
  | "disconnect"
  | "participant-share-on"
  | "lobby-member-join"
  | "lobby-member-leave";

interface UiSoundController {
  setEnabled: (enabled: boolean) => void;
  getEnabled: () => boolean;
  play: (effect: UiSoundEffect) => void;
}

const envelope = (
  gain: GainNode,
  context: AudioContext,
  startAt: number,
  peak: number,
  duration: number,
): void => {
  gain.gain.cancelScheduledValues(startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
};

const playTone = (
  context: AudioContext,
  options: {
    frequency: number;
    type: OscillatorType;
    duration: number;
    peak: number;
    detune?: number;
    when?: number;
  },
): void => {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startAt = options.when ?? context.currentTime;

  oscillator.type = options.type;
  oscillator.frequency.setValueAtTime(options.frequency, startAt);
  if (typeof options.detune === "number") {
    oscillator.detune.setValueAtTime(options.detune, startAt);
  }

  oscillator.connect(gain);
  gain.connect(context.destination);
  envelope(gain, context, startAt, options.peak, options.duration);

  oscillator.start(startAt);
  oscillator.stop(startAt + options.duration + 0.02);
};

export const createUiSoundController = (): UiSoundController => {
  const AudioContextCtor =
    window.AudioContext ||
    ((window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext ??
      null);

  let enabled = true;
  let context: AudioContext | null = null;

  const ensureContext = (): AudioContext | null => {
    if (!AudioContextCtor) {
      return null;
    }

    if (!context) {
      context = new AudioContextCtor();
    }

    if (context.state === "suspended") {
      void context.resume();
    }

    return context;
  };

  const play = (effect: UiSoundEffect): void => {
    if (!enabled) {
      return;
    }

    const ctx = ensureContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;

    switch (effect) {
      case "mic-on": {
        playTone(ctx, {
          frequency: 760,
          type: "sine",
          duration: 0.09,
          peak: 0.045,
          when: now,
        });
        playTone(ctx, {
          frequency: 980,
          type: "sine",
          duration: 0.08,
          peak: 0.04,
          when: now + 0.07,
        });
        return;
      }
      case "mic-off": {
        playTone(ctx, {
          frequency: 980,
          type: "triangle",
          duration: 0.1,
          peak: 0.04,
          when: now,
        });
        playTone(ctx, {
          frequency: 650,
          type: "triangle",
          duration: 0.11,
          peak: 0.038,
          when: now + 0.07,
        });
        return;
      }
      case "headphone-on": {
        playTone(ctx, {
          frequency: 520,
          type: "sine",
          duration: 0.08,
          peak: 0.038,
          when: now,
        });
        playTone(ctx, {
          frequency: 690,
          type: "sine",
          duration: 0.08,
          peak: 0.034,
          when: now + 0.06,
        });
        return;
      }
      case "headphone-off": {
        playTone(ctx, {
          frequency: 580,
          type: "square",
          duration: 0.07,
          peak: 0.03,
          when: now,
        });
        playTone(ctx, {
          frequency: 430,
          type: "square",
          duration: 0.09,
          peak: 0.03,
          when: now + 0.06,
        });
        return;
      }
      case "connect": {
        playTone(ctx, {
          frequency: 540,
          type: "triangle",
          duration: 0.09,
          peak: 0.04,
          when: now,
        });
        playTone(ctx, {
          frequency: 720,
          type: "triangle",
          duration: 0.09,
          peak: 0.038,
          when: now + 0.07,
        });
        playTone(ctx, {
          frequency: 920,
          type: "triangle",
          duration: 0.12,
          peak: 0.036,
          when: now + 0.14,
        });
        return;
      }
      case "disconnect": {
        playTone(ctx, {
          frequency: 760,
          type: "triangle",
          duration: 0.1,
          peak: 0.038,
          when: now,
        });
        playTone(ctx, {
          frequency: 500,
          type: "triangle",
          duration: 0.12,
          peak: 0.036,
          when: now + 0.08,
        });
        return;
      }
      case "participant-share-on": {
        playTone(ctx, {
          frequency: 660,
          type: "sine",
          duration: 0.07,
          peak: 0.03,
          when: now,
        });
        playTone(ctx, {
          frequency: 900,
          type: "sine",
          duration: 0.08,
          peak: 0.028,
          when: now + 0.055,
        });
        return;
      }
      case "lobby-member-join": {
        playTone(ctx, {
          frequency: 520,
          type: "sine",
          duration: 0.06,
          peak: 0.026,
          when: now,
        });
        playTone(ctx, {
          frequency: 730,
          type: "triangle",
          duration: 0.08,
          peak: 0.028,
          when: now + 0.05,
        });
        return;
      }
      case "lobby-member-leave": {
        playTone(ctx, {
          frequency: 700,
          type: "triangle",
          duration: 0.07,
          peak: 0.024,
          when: now,
        });
        playTone(ctx, {
          frequency: 480,
          type: "sine",
          duration: 0.09,
          peak: 0.025,
          when: now + 0.055,
        });
        return;
      }
    }
  };

  return {
    setEnabled: (value: boolean) => {
      enabled = value;
    },
    getEnabled: () => enabled,
    play,
  };
};
