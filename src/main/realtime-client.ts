import type {
  LobbyMember,
  MediaProducerPayload,
  RtcSignalPayload,
} from "../shared/contracts";

export type RealtimeEvent =
  | {
      type: "connection";
      status: "connected" | "disconnected" | "error";
      detail?: string;
    }
  | {
      type: "connection-metrics";
      latencyMs: number | null;
      packetLossPercent: number;
      transport: string;
      reconnectAttempts: number;
      connected: boolean;
    }
  | { type: "lobby-state"; members: LobbyMember[] }
  | { type: "lobby-member-joined"; member: LobbyMember }
  | { type: "lobby-member-left"; userId: string }
  | { type: "media-producer-available"; payload: MediaProducerPayload }
  | { type: "media-producer-closed"; payload: MediaProducerPayload }
  | { type: "system-error"; code: string; message: string }
  | { type: "rtc-signal"; payload: RtcSignalPayload };

export class RealtimeClient {
  private connected = false;
  private token: string | null = null;
  private onEvent: ((event: RealtimeEvent) => void) | null = null;

  public constructor(private readonly baseUrl: string) {}

  private emitConnectionMetrics(): void {
    this.onEvent?.({
      type: "connection-metrics",
      latencyMs: null,
      packetLossPercent: 0,
      transport: this.connected ? "livekit" : "none",
      reconnectAttempts: 0,
      connected: this.connected,
    });
  }

  public connect(token: string, onEvent: (event: RealtimeEvent) => void): void {
    this.onEvent = onEvent;

    if (this.connected && this.token === token) {
      this.onEvent({ type: "connection", status: "connected" });
      this.emitConnectionMetrics();
      return;
    }

    this.connected = true;
    this.token = token;
    this.onEvent({ type: "connection", status: "connected" });
    this.emitConnectionMetrics();
  }

  public disconnect(): void {
    if (!this.connected) {
      return;
    }

    this.connected = false;
    this.token = null;
    this.onEvent?.({ type: "connection", status: "disconnected" });
    this.emitConnectionMetrics();
    this.onEvent = null;
  }

  public joinLobby(): void {
    // Lobby membership is synchronized via LiveKit webhooks + REST polling.
  }

  public leaveLobby(): void {
    // no-op
  }

  public setMute(muted: boolean): void {
    void muted;
  }

  public setDeafened(deafened: boolean): void {
    void deafened;
  }

  public setSpeaking(speaking: boolean): void {
    void speaking;
  }

  public sendSignal(payload: RtcSignalPayload): void {
    void payload;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public isConnectedOrConnecting(): boolean {
    return this.connected;
  }
}
