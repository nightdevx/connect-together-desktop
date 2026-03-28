import type {
  DesktopRealtimeEvent,
  LobbyMemberSnapshot,
} from "../../types/desktop-api";
import type { LobbyChatMessage } from "../../../shared/contracts";

interface RealtimeControllerDeps {
  onConnection: (
    status: "connected" | "disconnected" | "error",
    detail?: string,
  ) => void;
  onConnectionMetrics: (payload: {
    latencyMs: number | null;
    packetLossPercent: number;
    transport: string;
    reconnectAttempts: number;
    connected: boolean;
  }) => void;
  onLobbyState: (members: LobbyMemberSnapshot[], revision?: number) => void;
  onMemberJoined: (member: LobbyMemberSnapshot, revision?: number) => void;
  onMemberUpdated: (member: LobbyMemberSnapshot, revision?: number) => void;
  onMemberLeft: (userId: string, revision?: number) => void;
  onLobbyChatHistory: (messages: LobbyChatMessage[]) => void;
  onLobbyMessage: (message: LobbyChatMessage) => void;
  onAutoRejoin: () => void;
  onRtcSignal: (payload: unknown) => void;
  onProducerAvailable: (payload: {
    userId: string;
    producerId: string;
    kind: "audio" | "video";
    sourceType: "microphone" | "camera" | "screen";
  }) => void;
  onProducerClosed: (producerId: string) => void;
  onSystemError: (message: string) => void;
}

export const subscribeRealtimeEvents = (
  deps: RealtimeControllerDeps,
): (() => void) => {
  return window.desktopApi.onRealtimeEvent((event: DesktopRealtimeEvent) => {
    if (event.type === "connection") {
      if (
        event.status === "connected" ||
        event.status === "disconnected" ||
        event.status === "error"
      ) {
        deps.onConnection(event.status, event.detail);
      }
      return;
    }

    if (event.type === "connection-metrics") {
      deps.onConnectionMetrics({
        latencyMs:
          typeof event.latencyMs === "number" || event.latencyMs === null
            ? event.latencyMs
            : null,
        packetLossPercent:
          typeof event.packetLossPercent === "number" &&
          Number.isFinite(event.packetLossPercent)
            ? Math.max(0, Math.min(100, event.packetLossPercent))
            : 0,
        transport:
          typeof event.transport === "string" && event.transport.length > 0
            ? event.transport
            : "unknown",
        reconnectAttempts:
          typeof event.reconnectAttempts === "number"
            ? Math.max(0, Math.floor(event.reconnectAttempts))
            : 0,
        connected: event.connected === true,
      });
      return;
    }

    if (event.type === "lobby-state" && Array.isArray(event.members)) {
      deps.onLobbyState(event.members, event.revision);
      return;
    }

    if (event.type === "lobby-member-joined" && event.member) {
      deps.onMemberJoined(event.member, event.revision);
      return;
    }

    if (event.type === "lobby-member-updated" && event.member) {
      deps.onMemberUpdated(event.member, event.revision);
      return;
    }

    if (event.type === "lobby-member-left" && event.userId) {
      deps.onMemberLeft(event.userId, event.revision);
      return;
    }

    if (event.type === "lobby-chat-history" && Array.isArray(event.messages)) {
      deps.onLobbyChatHistory(event.messages);
      return;
    }

    if (event.type === "lobby-message" && event.chatMessage) {
      deps.onLobbyMessage(event.chatMessage);
      return;
    }

    if (event.type === "lobby:auto-rejoin") {
      deps.onAutoRejoin();
      return;
    }

    if (event.type === "rtc-signal" && event.payload) {
      deps.onRtcSignal(event.payload);
      return;
    }

    if (event.type === "media-producer-available" && event.payload) {
      const payload = event.payload as unknown as {
        userId: string;
        producerId: string;
        kind: "audio" | "video";
        sourceType: "microphone" | "camera" | "screen";
      };
      deps.onProducerAvailable(payload);
      return;
    }

    if (event.type === "media-producer-closed" && event.payload) {
      const payload = event.payload as unknown as { producerId?: string };
      if (payload.producerId) {
        deps.onProducerClosed(payload.producerId);
      }
      return;
    }

    if (event.type === "system-error") {
      deps.onSystemError(event.message || event.code || "bilinmeyen hata");
    }
  });
};
