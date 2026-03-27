export interface DomRefs {
  windowMinimize: HTMLButtonElement;
  windowMaximize: HTMLButtonElement;
  windowClose: HTMLButtonElement;
  status: HTMLParagraphElement;
  connectionState: HTMLElement;
  connectionBadge: HTMLElement;
  navUsers: HTMLButtonElement;
  navLobby: HTMLButtonElement;
  navSettings: HTMLButtonElement;
  usersSidebar: HTMLElement;
  lobbySidebar: HTMLElement;
  settingsSidebar: HTMLElement;
  usersPage: HTMLElement;
  lobbyPage: HTMLElement;
  settingsPage: HTMLElement;
  settingsTabProfile: HTMLButtonElement;
  settingsTabSecurity: HTMLButtonElement;
  settingsTabVoice: HTMLButtonElement;
  settingsTabSession: HTMLButtonElement;
  settingsPanelProfile: HTMLElement;
  settingsPanelSecurity: HTMLElement;
  settingsPanelVoice: HTMLElement;
  settingsPanelSession: HTMLElement;
  version: HTMLElement;
  updateHint: HTMLElement;
  updateActionButton: HTMLButtonElement;
  authView: HTMLElement;
  loginPane: HTMLElement;
  registerPane: HTMLElement;
  loginTab: HTMLButtonElement;
  registerTab: HTMLButtonElement;
  lobbyView: HTMLElement;
  currentUser: HTMLElement;
  memberCount: HTMLElement;
  members: HTMLUListElement;
  usersDirectoryCount: HTMLElement;
  usersDirectoryList: HTMLUListElement;
  quickMicToggle: HTMLButtonElement;
  quickCameraToggle: HTMLButtonElement;
  quickScreenToggle: HTMLButtonElement;
  quickHeadphoneToggle: HTMLButtonElement;
  quickConnectionToggle: HTMLButtonElement;
  quickConnectionLabel: HTMLElement;
  microphoneSelect: HTMLSelectElement;
  voiceState: HTMLElement;
  connectionDiagBanner: HTMLButtonElement;
  connectionDiagIconPath: SVGPathElement;
  connectionDiagStatus: HTMLElement;
  connectionDiagDetailsCard: HTMLElement;
  connectionDiagTabConnection: HTMLButtonElement;
  connectionDiagTabPrivacy: HTMLButtonElement;
  connectionDiagPanelConnection: HTMLElement;
  connectionDiagPanelPrivacy: HTMLElement;
  connectionDiagAvgPing: HTMLElement;
  connectionDiagLastPing: HTMLElement;
  connectionDiagPacketLoss: HTMLElement;
  connectionDiagHint: HTMLElement;
  connectionDiagEncryption: HTMLElement;
  connectionDiagLearnMore: HTMLButtonElement;
  participantGrid: HTMLElement;
  remoteAudioContainer: HTMLElement;
  outputVolume: HTMLInputElement;
  outputVolumeValue: HTMLElement;
  speakingThresholdMode: HTMLSelectElement;
  speakingThreshold: HTMLInputElement;
  speakingThresholdValue: HTMLElement;
  speakingThresholdHint: HTMLElement;
  uiSoundsToggle: HTMLButtonElement;
  rnnoiseToggle: HTMLButtonElement;
  micTestToggle: HTMLButtonElement;
  cameraResolutionSelect: HTMLSelectElement;
  cameraFpsSelect: HTMLSelectElement;
  cameraTestToggle: HTMLButtonElement;
  cameraTestPreview: HTMLVideoElement;
  screenShareModeSelect: HTMLSelectElement;
  screenResolutionSelect: HTMLSelectElement;
  screenFpsSelect: HTMLSelectElement;
  screenTestToggle: HTMLButtonElement;
  screenTestPreview: HTMLVideoElement;
  screenShareModal: HTMLElement;
  shareModalTitle: HTMLElement;
  screenCaptureFilters: HTMLElement;
  screenCaptureTabMonitors: HTMLButtonElement;
  screenCaptureTabWindows: HTMLButtonElement;
  screenShareModalClose: HTMLButtonElement;
  screenShareModalCancel: HTMLButtonElement;
  screenShareModalConfirm: HTMLButtonElement;
  sharePreviewHint: HTMLElement;
  sharePreviewImage: HTMLImageElement;
  sharePreviewVideo: HTMLVideoElement;
  modalScreenResolutionSelect: HTMLSelectElement;
  modalScreenFpsSelect: HTMLSelectElement;
  screenMonitorSelect: HTMLSelectElement;
  screenCaptureRefreshButton: HTMLButtonElement;
  screenCaptureSourceList: HTMLElement;
  participantAudioMenu: HTMLElement;
  participantAudioMenuTitle: HTMLElement;
  participantAudioMuteToggle: HTMLButtonElement;
  participantAudioVolumeSlider: HTMLInputElement;
  participantAudioVolumeValue: HTMLElement;
  participantAudioPreset100: HTMLButtonElement;
  participantAudioPreset150: HTMLButtonElement;
  participantAudioPreset200: HTMLButtonElement;
  profileForm: HTMLFormElement;
  profileDisplayName: HTMLInputElement;
  profileEmail: HTMLInputElement;
  profileBio: HTMLTextAreaElement;
  passwordForm: HTMLFormElement;
  currentPassword: HTMLInputElement;
  newPassword: HTMLInputElement;
  confirmPassword: HTMLInputElement;
  goRegister: HTMLButtonElement;
  goLogin: HTMLButtonElement;
  loginForm: HTMLFormElement;
  registerForm: HTMLFormElement;
  loginUsername: HTMLInputElement;
  loginPassword: HTMLInputElement;
  registerUsername: HTMLInputElement;
  registerPassword: HTMLInputElement;
  logoutButton: HTMLButtonElement;
  closeToTrayToggle: HTMLButtonElement;
  launchAtStartupToggle: HTMLButtonElement;
}

const requireElement = <T extends Element>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element as T;
};

export const queryDomRefs = (): DomRefs => {
  return {
    windowMinimize: requireElement<HTMLButtonElement>("windowMinimize"),
    windowMaximize: requireElement<HTMLButtonElement>("windowMaximize"),
    windowClose: requireElement<HTMLButtonElement>("windowClose"),
    status: requireElement<HTMLParagraphElement>("status"),
    connectionState: requireElement("connectionState"),
    connectionBadge: requireElement("connectionBadge"),
    navUsers: requireElement<HTMLButtonElement>("navUsers"),
    navLobby: requireElement<HTMLButtonElement>("navLobby"),
    navSettings: requireElement<HTMLButtonElement>("navSettings"),
    usersSidebar: requireElement("usersSidebar"),
    lobbySidebar: requireElement("lobbySidebar"),
    settingsSidebar: requireElement("settingsSidebar"),
    usersPage: requireElement("usersPage"),
    lobbyPage: requireElement("lobbyPage"),
    settingsPage: requireElement("settingsPage"),
    settingsTabProfile: requireElement<HTMLButtonElement>("settingsTabProfile"),
    settingsTabSecurity: requireElement<HTMLButtonElement>(
      "settingsTabSecurity",
    ),
    settingsTabVoice: requireElement<HTMLButtonElement>("settingsTabVoice"),
    settingsTabSession: requireElement<HTMLButtonElement>("settingsTabSession"),
    settingsPanelProfile: requireElement("settingsPanelProfile"),
    settingsPanelSecurity: requireElement("settingsPanelSecurity"),
    settingsPanelVoice: requireElement("settingsPanelVoice"),
    settingsPanelSession: requireElement("settingsPanelSession"),
    version: requireElement("version"),
    updateHint: requireElement("updateHint"),
    updateActionButton: requireElement<HTMLButtonElement>("updateActionButton"),
    authView: requireElement("authView"),
    loginPane: requireElement("loginPane"),
    registerPane: requireElement("registerPane"),
    loginTab: requireElement<HTMLButtonElement>("loginTab"),
    registerTab: requireElement<HTMLButtonElement>("registerTab"),
    lobbyView: requireElement("lobbyView"),
    currentUser: requireElement("currentUser"),
    memberCount: requireElement("memberCount"),
    members: requireElement<HTMLUListElement>("members"),
    usersDirectoryCount: requireElement("usersDirectoryCount"),
    usersDirectoryList: requireElement<HTMLUListElement>("usersDirectoryList"),
    quickMicToggle: requireElement<HTMLButtonElement>("quickMicToggle"),
    quickCameraToggle: requireElement<HTMLButtonElement>("quickCameraToggle"),
    quickScreenToggle: requireElement<HTMLButtonElement>("quickScreenToggle"),
    quickHeadphoneToggle: requireElement<HTMLButtonElement>(
      "quickHeadphoneToggle",
    ),
    quickConnectionToggle: requireElement<HTMLButtonElement>(
      "quickConnectionToggle",
    ),
    quickConnectionLabel: requireElement("quickConnectionLabel"),
    microphoneSelect: requireElement<HTMLSelectElement>("microphoneSelect"),
    voiceState: requireElement("voiceState"),
    connectionDiagBanner: requireElement<HTMLButtonElement>(
      "connectionDiagBanner",
    ),
    connectionDiagIconPath: requireElement<SVGPathElement>(
      "connectionDiagIconPath",
    ),
    connectionDiagStatus: requireElement("connectionDiagStatus"),
    connectionDiagDetailsCard: requireElement("connectionDiagDetailsCard"),
    connectionDiagTabConnection: requireElement<HTMLButtonElement>(
      "connectionDiagTabConnection",
    ),
    connectionDiagTabPrivacy: requireElement<HTMLButtonElement>(
      "connectionDiagTabPrivacy",
    ),
    connectionDiagPanelConnection: requireElement(
      "connectionDiagPanelConnection",
    ),
    connectionDiagPanelPrivacy: requireElement("connectionDiagPanelPrivacy"),
    connectionDiagAvgPing: requireElement("connectionDiagAvgPing"),
    connectionDiagLastPing: requireElement("connectionDiagLastPing"),
    connectionDiagPacketLoss: requireElement("connectionDiagPacketLoss"),
    connectionDiagHint: requireElement("connectionDiagHint"),
    connectionDiagEncryption: requireElement("connectionDiagEncryption"),
    connectionDiagLearnMore: requireElement<HTMLButtonElement>(
      "connectionDiagLearnMore",
    ),
    participantGrid: requireElement("participantGrid"),
    remoteAudioContainer: requireElement("remoteAudioContainer"),
    outputVolume: requireElement<HTMLInputElement>("outputVolume"),
    outputVolumeValue: requireElement("outputVolumeValue"),
    speakingThresholdMode: requireElement<HTMLSelectElement>(
      "speakingThresholdMode",
    ),
    speakingThreshold: requireElement<HTMLInputElement>("speakingThreshold"),
    speakingThresholdValue: requireElement("speakingThresholdValue"),
    speakingThresholdHint: requireElement("speakingThresholdHint"),
    uiSoundsToggle: requireElement<HTMLButtonElement>("uiSoundsToggle"),
    rnnoiseToggle: requireElement<HTMLButtonElement>("rnnoiseToggle"),
    micTestToggle: requireElement<HTMLButtonElement>("micTestToggle"),
    cameraResolutionSelect: requireElement<HTMLSelectElement>(
      "cameraResolutionSelect",
    ),
    cameraFpsSelect: requireElement<HTMLSelectElement>("cameraFpsSelect"),
    cameraTestToggle: requireElement<HTMLButtonElement>("cameraTestToggle"),
    cameraTestPreview: requireElement<HTMLVideoElement>("cameraTestPreview"),
    screenShareModeSelect: requireElement<HTMLSelectElement>(
      "screenShareModeSelect",
    ),
    screenResolutionSelect: requireElement<HTMLSelectElement>(
      "screenResolutionSelect",
    ),
    screenFpsSelect: requireElement<HTMLSelectElement>("screenFpsSelect"),
    screenTestToggle: requireElement<HTMLButtonElement>("screenTestToggle"),
    screenTestPreview: requireElement<HTMLVideoElement>("screenTestPreview"),
    screenShareModal: requireElement("screenShareModal"),
    shareModalTitle: requireElement("shareModalTitle"),
    screenCaptureFilters: requireElement("screenCaptureFilters"),
    screenCaptureTabMonitors: requireElement<HTMLButtonElement>(
      "screenCaptureTabMonitors",
    ),
    screenCaptureTabWindows: requireElement<HTMLButtonElement>(
      "screenCaptureTabWindows",
    ),
    screenShareModalClose: requireElement<HTMLButtonElement>(
      "screenShareModalClose",
    ),
    screenShareModalCancel: requireElement<HTMLButtonElement>(
      "screenShareModalCancel",
    ),
    screenShareModalConfirm: requireElement<HTMLButtonElement>(
      "screenShareModalConfirm",
    ),
    sharePreviewHint: requireElement("sharePreviewHint"),
    sharePreviewImage: requireElement<HTMLImageElement>("sharePreviewImage"),
    sharePreviewVideo: requireElement<HTMLVideoElement>("sharePreviewVideo"),
    modalScreenResolutionSelect: requireElement<HTMLSelectElement>(
      "modalScreenResolutionSelect",
    ),
    modalScreenFpsSelect: requireElement<HTMLSelectElement>(
      "modalScreenFpsSelect",
    ),
    screenMonitorSelect: requireElement<HTMLSelectElement>(
      "screenMonitorSelect",
    ),
    screenCaptureRefreshButton: requireElement<HTMLButtonElement>(
      "screenCaptureRefreshButton",
    ),
    screenCaptureSourceList: requireElement("screenCaptureSourceList"),
    participantAudioMenu: requireElement("participantAudioMenu"),
    participantAudioMenuTitle: requireElement("participantAudioMenuTitle"),
    participantAudioMuteToggle: requireElement<HTMLButtonElement>(
      "participantAudioMuteToggle",
    ),
    participantAudioVolumeSlider: requireElement<HTMLInputElement>(
      "participantAudioVolumeSlider",
    ),
    participantAudioVolumeValue: requireElement("participantAudioVolumeValue"),
    participantAudioPreset100: requireElement<HTMLButtonElement>(
      "participantAudioPreset100",
    ),
    participantAudioPreset150: requireElement<HTMLButtonElement>(
      "participantAudioPreset150",
    ),
    participantAudioPreset200: requireElement<HTMLButtonElement>(
      "participantAudioPreset200",
    ),
    profileForm: requireElement<HTMLFormElement>("profileForm"),
    profileDisplayName: requireElement<HTMLInputElement>("profileDisplayName"),
    profileEmail: requireElement<HTMLInputElement>("profileEmail"),
    profileBio: requireElement<HTMLTextAreaElement>("profileBio"),
    passwordForm: requireElement<HTMLFormElement>("passwordForm"),
    currentPassword: requireElement<HTMLInputElement>("currentPassword"),
    newPassword: requireElement<HTMLInputElement>("newPassword"),
    confirmPassword: requireElement<HTMLInputElement>("confirmPassword"),
    goRegister: requireElement<HTMLButtonElement>("goRegister"),
    goLogin: requireElement<HTMLButtonElement>("goLogin"),
    loginForm: requireElement<HTMLFormElement>("loginForm"),
    registerForm: requireElement<HTMLFormElement>("registerForm"),
    loginUsername: requireElement<HTMLInputElement>("loginUsername"),
    loginPassword: requireElement<HTMLInputElement>("loginPassword"),
    registerUsername: requireElement<HTMLInputElement>("registerUsername"),
    registerPassword: requireElement<HTMLInputElement>("registerPassword"),
    logoutButton: requireElement<HTMLButtonElement>("logoutButton"),
    closeToTrayToggle: requireElement<HTMLButtonElement>("closeToTrayToggle"),
    launchAtStartupToggle: requireElement<HTMLButtonElement>(
      "launchAtStartupToggle",
    ),
  };
};
