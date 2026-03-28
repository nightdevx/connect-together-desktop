import type {
  LobbyChatMessage,
  RtcSignalPayload,
} from "../../shared/contracts";
import { subscribeRealtimeEvents } from "../features/realtime/realtime-controller";
import type { LobbyMemberSnapshot } from "../types/desktop-api";

interface ProducerAvailablePayload {
  userId: string;
  producerId: string;
  kind: "audio" | "video";
  sourceType: "microphone" | "camera" | "screen";
}

interface BootstrapRealtimeOrchestratorDeps {
  shouldApplyLobbyRevision: (revision?: number) => boolean;
  applySelfLobbyRealtimeOverrides: (
    member: LobbyMemberSnapshot,
  ) => LobbyMemberSnapshot;
  syncRemoteMediaAnnouncements: (members: LobbyMemberSnapshot[]) => void;
  isRemoteMediaAnnouncementInitialized: () => boolean;
  getSelfUserId: () => string | null;
  setStatus: (message: string, isError: boolean) => void;
  playUiSound: (effect: "participant-share-on") => void;
  setConnectionState: (message: string, tone: "ok" | "warn" | "error") => void;
  onConnected: () => void;
  setRealtimeConnectionStatus: (
    status: "connected" | "disconnected" | "error",
  ) => void;
  setRealtimeLatencyMs: (value: number | null) => void;
  setRealtimePacketLossPercent: (value: number) => void;
  setRealtimeTransport: (value: string) => void;
  setRealtimeReconnectAttempts: (value: number) => void;
  latencySamplesMs: number[];
  resetRemoteMediaAnnouncementState: () => void;
  handleDisconnectedState: () => void;
  updateDiagnostics: () => void;
  onLobbyStateApplied: (members: LobbyMemberSnapshot[]) => void;
  onMemberJoinedApplied: (member: LobbyMemberSnapshot) => void;
  onMemberUpdatedApplied: (member: LobbyMemberSnapshot) => void;
  onMemberLeftApplied: (userId: string) => void;
  onLobbyChatHistoryApplied: (messages: LobbyChatMessage[]) => void;
  onLobbyMessageApplied: (message: LobbyChatMessage) => void;
  onRtcSignal: (payload: RtcSignalPayload) => void;
  onProducerAvailable: (payload: ProducerAvailablePayload) => void;
  onProducerClosed: (producerId: string) => void;
}

export const subscribeBootstrapRealtimeOrchestrator = (
  deps: BootstrapRealtimeOrchestratorDeps,
): (() => void) => {
  return subscribeRealtimeEvents({
    onConnection: (status, detail) => {
      if (status === "connected") {
        deps.onConnected();
        deps.setConnectionState("Realtime bağlı", "ok");
        deps.updateDiagnostics();
        return;
      }

      if (status === "disconnected") {
        deps.setRealtimeConnectionStatus("disconnected");
        deps.setRealtimeLatencyMs(null);
        deps.setRealtimePacketLossPercent(0);
        deps.latencySamplesMs.length = 0;
        deps.setConnectionState("Realtime bağlantısı koptu", "warn");
        if (detail) {
          deps.setStatus(`Realtime bağlantısı kesildi: ${detail}`, true);
        }

        deps.handleDisconnectedState();
        deps.updateDiagnostics();
        return;
      }

      deps.setRealtimeConnectionStatus("error");
      deps.setRealtimeLatencyMs(null);
      deps.setRealtimePacketLossPercent(0);
      deps.latencySamplesMs.length = 0;
      deps.setConnectionState("Realtime hatası", "error");
      deps.setStatus(`Realtime hatası: ${detail || "bilinmeyen hata"}`, true);
      deps.resetRemoteMediaAnnouncementState();
      deps.updateDiagnostics();
    },
    onConnectionMetrics: (payload) => {
      deps.setRealtimeLatencyMs(payload.connected ? payload.latencyMs : null);
      deps.setRealtimePacketLossPercent(
        payload.connected ? payload.packetLossPercent : 0,
      );
      deps.setRealtimeTransport(payload.transport);
      deps.setRealtimeReconnectAttempts(payload.reconnectAttempts);

      if (payload.connected && typeof payload.latencyMs === "number") {
        deps.latencySamplesMs.push(Math.max(0, Math.round(payload.latencyMs)));
        if (deps.latencySamplesMs.length > 30) {
          deps.latencySamplesMs.shift();
        }
      }

      if (payload.connected) {
        deps.setRealtimeConnectionStatus("connected");
      }

      deps.updateDiagnostics();
    },
    onLobbyState: (members, revision) => {
      if (!deps.shouldApplyLobbyRevision(revision)) {
        return;
      }

      const normalizedMembers = members.map((member) =>
        deps.applySelfLobbyRealtimeOverrides(member),
      );

      deps.syncRemoteMediaAnnouncements(normalizedMembers);
      deps.onLobbyStateApplied(normalizedMembers);
    },
    onMemberJoined: (member, revision) => {
      if (!deps.shouldApplyLobbyRevision(revision)) {
        return;
      }

      const normalizedMember = deps.applySelfLobbyRealtimeOverrides(member);
      deps.setStatus("Lobiye bir üye katıldı", false);

      const selfId = deps.getSelfUserId();
      if (
        deps.isRemoteMediaAnnouncementInitialized() &&
        normalizedMember.userId !== selfId &&
        (normalizedMember.cameraEnabled || normalizedMember.screenSharing)
      ) {
        deps.playUiSound("participant-share-on");
      }

      deps.onMemberJoinedApplied(normalizedMember);
    },
    onMemberUpdated: (member, revision) => {
      if (!deps.shouldApplyLobbyRevision(revision)) {
        return;
      }

      const normalizedMember = deps.applySelfLobbyRealtimeOverrides(member);
      deps.onMemberUpdatedApplied(normalizedMember);
    },
    onMemberLeft: (userId, revision) => {
      if (!deps.shouldApplyLobbyRevision(revision)) {
        return;
      }

      deps.setStatus("Bir üye lobiden ayrıldı", false);
      deps.onMemberLeftApplied(userId);
    },
    onLobbyChatHistory: (messages) => {
      deps.onLobbyChatHistoryApplied(messages);
    },
    onLobbyMessage: (message) => {
      deps.onLobbyMessageApplied(message);
    },
    onAutoRejoin: () => {
      deps.setStatus("Bağlantı geri geldi, lobi üyeliği yenilendi", false);
    },
    onRtcSignal: (payload) => {
      deps.onRtcSignal(payload as RtcSignalPayload);
    },
    onProducerAvailable: (payload) => {
      deps.onProducerAvailable(payload);
    },
    onProducerClosed: (producerId) => {
      deps.onProducerClosed(producerId);
    },
    onSystemError: (message) => {
      deps.setStatus(`Sistem hatası: ${message}`, true);
    },
  });
};
