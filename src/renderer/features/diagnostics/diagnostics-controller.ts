import type { DomRefs } from "../../ui/dom";

const DIAG_STATUS_ICON_PATHS = {
  idle: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5a1 1 0 1 0-2 0v5c0 .38.21.72.55.89l3 1.8a1 1 0 1 0 1-1.72L13 11.44V7Z",
  ok: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.3 7.7a1 1 0 0 0-1.42-1.4l-3.9 3.94-1.86-1.86a1 1 0 1 0-1.42 1.41l2.57 2.58a1 1 0 0 0 1.42 0l4.61-4.67Z",
  warn: "M12 3.5 2.9 19.1a1 1 0 0 0 .86 1.5h16.48a1 1 0 0 0 .86-1.5L12.97 3.5a1.1 1.1 0 0 0-1.94 0ZM13 9a1 1 0 1 0-2 0v4a1 1 0 1 0 2 0V9Zm-1 8.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z",
  error:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.7 13.7a1 1 0 0 1-1.4 0L12 13.41l-2.3 2.3a1 1 0 1 1-1.4-1.42l2.29-2.29-2.3-2.3a1 1 0 0 1 1.42-1.4l2.29 2.29 2.3-2.3a1 1 0 1 1 1.4 1.42l-2.29 2.29 2.3 2.3a1 1 0 0 1 0 1.4Z",
} as const;

type DiagnosticsBannerState = keyof typeof DIAG_STATUS_ICON_PATHS;

export interface DiagnosticMetrics {
  voiceConnected: boolean;
  voiceConnectionInProgress: boolean;
  realtimeConnectionStatus: "connected" | "disconnected" | "error";
  realtimeLatencyMs: number | null;
  realtimePacketLossPercent: number;
  realtimeReconnectAttempts: number;
  latencySamplesMs: number[];
}

interface DiagnosticsControllerDeps {
  dom: DomRefs;
  setStatus: (message: string, isError: boolean) => void;
  getMetrics: () => DiagnosticMetrics;
}

export interface DiagnosticsController {
  updateConnectionDiagnostics: () => void;
  setConnectionDiagTab: (tab: "connection" | "privacy") => void;
  setConnectionDiagExpanded: (expanded: boolean) => void;
  bindEvents: () => void;
  initialize: () => void;
}

export const createDiagnosticsController = (
  deps: DiagnosticsControllerDeps,
): DiagnosticsController => {
  const { dom, setStatus, getMetrics } = deps;
  let connectionDiagActiveTab: "connection" | "privacy" = "connection";
  let connectionDiagExpanded = false;

  const resolveLatencyQuality = (latencyMs: number | null): string => {
    if (latencyMs === null) {
      return "Ölçülüyor";
    }

    if (latencyMs <= 60) {
      return "Çok iyi";
    }

    if (latencyMs <= 120) {
      return "İyi";
    }

    if (latencyMs <= 220) {
      return "Orta";
    }

    return "Zayıf";
  };

  const getAverageLatencyMs = (samples: number[]): number | null => {
    if (samples.length === 0) {
      return null;
    }

    const total = samples.reduce((sum, value) => sum + value, 0);
    return Math.round(total / samples.length);
  };

  const buildConnectionHint = (
    averagePing: number | null,
    lastPing: number | null,
    packetLossPercent: number,
    metrics: DiagnosticMetrics,
  ): string => {
    if (metrics.voiceConnectionInProgress) {
      return "Sohbete bağlanma sürüyor. Ses bağlantısı kurulduğunda ping ve paket kaybı canlı görünecek.";
    }

    if (!metrics.voiceConnected) {
      return "Sohbete bağlanınca gecikme ve bağlantı sağlığı burada canlı güncellenir.";
    }

    if (metrics.realtimeConnectionStatus !== "connected") {
      return "Realtime bağlantısı kararsız. Ses kesilmesi yaşarsan ağ bağlantını kontrol et.";
    }

    if (packetLossPercent >= 5 || (lastPing !== null && lastPing >= 220)) {
      return "Yüksek gecikme veya paket kaybı algılandı. Ağ kalitesini kontrol etmen önerilir.";
    }

    if ((averagePing ?? 0) >= 120) {
      return "Bağlantı orta seviyede. Oyun/konuşma senkronunda küçük gecikmeler olabilir.";
    }

    return "Bağlantı stabil görünüyor. Ses iletimi sağlıklı durumda.";
  };

  const updateConnectionDiagnostics = (): void => {
    const metrics = getMetrics();
    const hasLiveVoiceMetrics =
      metrics.voiceConnected &&
      metrics.realtimeConnectionStatus === "connected";
    const averagePing = hasLiveVoiceMetrics
      ? getAverageLatencyMs(metrics.latencySamplesMs)
      : null;
    const lastPing = hasLiveVoiceMetrics ? metrics.realtimeLatencyMs : null;
    const packetLossPercent = hasLiveVoiceMetrics
      ? metrics.realtimePacketLossPercent
      : metrics.voiceConnected && metrics.realtimeConnectionStatus === "error"
        ? Math.max(8.5, metrics.realtimePacketLossPercent)
        : 0;

    const qualityLabel = resolveLatencyQuality(lastPing);

    let bannerState: DiagnosticsBannerState = "idle";
    let bannerText = "Ses bağlantısı bekleniyor";

    if (metrics.voiceConnectionInProgress) {
      bannerState = "warn";
      bannerText = "Sohbete bağlanılıyor";
    } else if (
      metrics.voiceConnected &&
      metrics.realtimeConnectionStatus === "connected"
    ) {
      const hasRisk =
        packetLossPercent >= 4 ||
        qualityLabel === "Zayıf" ||
        metrics.realtimeReconnectAttempts > 0;
      bannerState = hasRisk ? "warn" : "ok";
      bannerText = hasRisk
        ? "Ses bağlantısı kararsız"
        : "Ses bağlantısı stabil";
    } else if (
      metrics.voiceConnected &&
      metrics.realtimeConnectionStatus === "error"
    ) {
      bannerState = "error";
      bannerText = "Ses bağlantısı kesildi";
    } else if (metrics.voiceConnected) {
      bannerState = "warn";
      bannerText = "Ses bağlantısı yeniden bağlanıyor";
    }

    dom.connectionDiagBanner.dataset.state = bannerState;
    dom.connectionDiagStatus.textContent = bannerText;
    dom.connectionDiagIconPath.setAttribute(
      "d",
      DIAG_STATUS_ICON_PATHS[bannerState],
    );

    dom.connectionDiagAvgPing.textContent =
      averagePing === null ? "-" : `${averagePing} ms`;
    dom.connectionDiagLastPing.textContent =
      lastPing === null ? "-" : `${lastPing} ms`;
    dom.connectionDiagPacketLoss.textContent = `%${packetLossPercent.toFixed(1)}`;
    dom.connectionDiagHint.textContent = buildConnectionHint(
      averagePing,
      lastPing,
      packetLossPercent,
      metrics,
    );
    dom.connectionDiagEncryption.textContent =
      metrics.realtimeConnectionStatus === "error"
        ? "Şifreleme doğrulanıyor"
        : "Uçtan uca şifrelenmiş";
  };

  const setConnectionDiagTab = (tab: "connection" | "privacy"): void => {
    connectionDiagActiveTab = tab;
    const isConnectionTab = tab === "connection";

    dom.connectionDiagTabConnection.classList.toggle("active", isConnectionTab);
    dom.connectionDiagTabConnection.setAttribute(
      "aria-selected",
      isConnectionTab ? "true" : "false",
    );
    dom.connectionDiagTabPrivacy.classList.toggle("active", !isConnectionTab);
    dom.connectionDiagTabPrivacy.setAttribute(
      "aria-selected",
      !isConnectionTab ? "true" : "false",
    );

    dom.connectionDiagPanelConnection.classList.toggle(
      "hidden",
      !isConnectionTab,
    );
    dom.connectionDiagPanelPrivacy.classList.toggle("hidden", isConnectionTab);
  };

  const setConnectionDiagExpanded = (expanded: boolean): void => {
    connectionDiagExpanded = expanded;
    dom.connectionDiagBanner.setAttribute(
      "aria-expanded",
      expanded ? "true" : "false",
    );
    dom.connectionDiagDetailsCard.classList.toggle("hidden", !expanded);
    dom.connectionDiagBanner.classList.toggle("expanded", expanded);
  };

  const bindEvents = (): void => {
    dom.connectionDiagBanner.addEventListener("click", () => {
      setConnectionDiagExpanded(!connectionDiagExpanded);
    });

    document.addEventListener("click", (event) => {
      if (!connectionDiagExpanded) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        dom.connectionDiagBanner.contains(target) ||
        dom.connectionDiagDetailsCard.contains(target)
      ) {
        return;
      }

      setConnectionDiagExpanded(false);
    });

    dom.connectionDiagTabConnection.addEventListener("click", () => {
      setConnectionDiagTab("connection");
    });

    dom.connectionDiagTabPrivacy.addEventListener("click", () => {
      setConnectionDiagTab("privacy");
    });

    dom.connectionDiagLearnMore.addEventListener("click", () => {
      setConnectionDiagExpanded(true);
      setConnectionDiagTab("privacy");
      setStatus(
        "Ses bağlantısı şifreli iletilir. Daha iyi kalite için mümkünse kablolu ağ kullan ve arka plandaki yüksek bant genişliği tüketimini azalt.",
        false,
      );
    });
  };

  const initialize = (): void => {
    setConnectionDiagExpanded(connectionDiagExpanded);
    setConnectionDiagTab(connectionDiagActiveTab);
    updateConnectionDiagnostics();
  };

  return {
    updateConnectionDiagnostics,
    setConnectionDiagTab,
    setConnectionDiagExpanded,
    bindEvents,
    initialize,
  };
};
