export const getMediaDevicesSafe = (): MediaDevices => {
  const mediaDevices = navigator.mediaDevices;
  if (mediaDevices && typeof mediaDevices.getUserMedia === "function") {
    return mediaDevices;
  }

  throw new Error("Tarayici medya API'si hazir degil");
};

export const getUserMediaSafe = async (
  constraints: MediaStreamConstraints,
): Promise<MediaStream> => {
  const mediaDevices = getMediaDevicesSafe();
  return mediaDevices.getUserMedia(constraints);
};

export const getDisplayMediaSafe = async (
  constraints: MediaStreamConstraints,
): Promise<MediaStream> => {
  const mediaDevices = getMediaDevicesSafe();
  if (typeof mediaDevices.getDisplayMedia !== "function") {
    throw new Error("Ekran paylasimi API'si bu ortamda desteklenmiyor");
  }

  return mediaDevices.getDisplayMedia(constraints);
};

export interface VideoCaptureQuality {
  width: number;
  height: number;
  fps: number;
}

export const getDesktopSourceMediaSafe = async (payload: {
  sourceId: string;
  quality: VideoCaptureQuality;
}): Promise<MediaStream> => {
  const mediaDevices = getMediaDevicesSafe();

  const width = Math.max(640, Math.round(payload.quality.width));
  const height = Math.max(360, Math.round(payload.quality.height));
  const fps = Math.max(10, Math.round(payload.quality.fps));

  const videoConstraints = {
    mandatory: {
      chromeMediaSource: "desktop",
      chromeMediaSourceId: payload.sourceId,
      minWidth: 640,
      maxWidth: width,
      minHeight: 360,
      maxHeight: height,
      minFrameRate: 10,
      maxFrameRate: fps,
    },
  } as unknown as MediaTrackConstraints;

  return mediaDevices.getUserMedia({
    audio: false,
    video: videoConstraints,
  });
};

export const enumerateDevicesSafe = async (): Promise<MediaDeviceInfo[]> => {
  const mediaDevices = getMediaDevicesSafe();
  if (typeof mediaDevices.enumerateDevices === "function") {
    return mediaDevices.enumerateDevices();
  }

  return [];
};

export const getSupportedConstraintsSafe =
  (): MediaTrackSupportedConstraints => {
    const mediaDevices = getMediaDevicesSafe();
    if (typeof mediaDevices.getSupportedConstraints === "function") {
      return mediaDevices.getSupportedConstraints();
    }

    return {};
  };

export const stopMediaStream = (stream: MediaStream | null): void => {
  if (!stream) {
    return;
  }

  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // no-op
    }
  }
};
