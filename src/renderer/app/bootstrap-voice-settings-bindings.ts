import type { DomRefs } from "../ui/dom";

interface BootstrapVoiceSettingsBindingsDeps {
  dom: DomRefs;
  onQuickMicToggle: () => Promise<void>;
  onQuickHeadphoneToggle: () => Promise<void>;
  onUiSoundsToggle: () => void;
  onRnnoiseToggle: () => Promise<void>;
  onMicrophoneChange: (deviceId: string) => Promise<void>;
  onMicTestToggle: () => Promise<boolean>;
  onOutputVolumeInput: (value: number) => void;
  onInputGainInput: (value: number) => void;
  onInputGainChange: (value: number) => void;
  onSpeakingModeChange: (value: string) => void;
  onSpeakingThresholdInput: (value: number) => void;
  onSpeakingThresholdChange: () => void;
  defaultSpeakingThresholdPercent: number;
}

export const bindVoiceSettingsControls = (
  deps: BootstrapVoiceSettingsBindingsDeps,
): void => {
  const {
    dom,
    onQuickMicToggle,
    onQuickHeadphoneToggle,
    onUiSoundsToggle,
    onRnnoiseToggle,
    onMicrophoneChange,
    onMicTestToggle,
    onOutputVolumeInput,
    onInputGainInput,
    onInputGainChange,
    onSpeakingModeChange,
    onSpeakingThresholdInput,
    onSpeakingThresholdChange,
    defaultSpeakingThresholdPercent,
  } = deps;

  dom.quickMicToggle.addEventListener("click", () => {
    void onQuickMicToggle();
  });

  dom.quickHeadphoneToggle.addEventListener("click", () => {
    void onQuickHeadphoneToggle();
  });

  dom.uiSoundsToggle.addEventListener("click", () => {
    onUiSoundsToggle();
  });

  dom.rnnoiseToggle.addEventListener("click", () => {
    void onRnnoiseToggle();
  });

  dom.microphoneSelect.addEventListener("change", () => {
    void onMicrophoneChange(dom.microphoneSelect.value);
  });

  dom.micTestToggle.addEventListener("click", () => {
    void onMicTestToggle().then((isTesting) => {
      dom.micTestToggle.textContent = isTesting
        ? "Ses Testini Durdur"
        : "Ses Testini Başlat";
    });
  });

  dom.outputVolume.addEventListener("input", () => {
    onOutputVolumeInput(Number(dom.outputVolume.value || "100"));
  });

  dom.inputGain.addEventListener("input", () => {
    onInputGainInput(Number(dom.inputGain.value || "100"));
  });

  dom.inputGain.addEventListener("change", () => {
    onInputGainChange(Number(dom.inputGain.value || "100"));
  });

  dom.speakingThresholdMode.addEventListener("change", () => {
    onSpeakingModeChange(dom.speakingThresholdMode.value);
  });

  dom.speakingThreshold.addEventListener("input", () => {
    onSpeakingThresholdInput(
      Number(
        dom.speakingThreshold.value || `${defaultSpeakingThresholdPercent}`,
      ),
    );
  });

  dom.speakingThreshold.addEventListener("change", () => {
    onSpeakingThresholdChange();
  });
};
