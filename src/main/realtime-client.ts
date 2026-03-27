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
  | { type: "lobby-state"; members: LobbyMember[]; revision?: number }
  | { type: "lobby-member-joined"; member: LobbyMember; revision?: number }
  | { type: "lobby-member-updated"; member: LobbyMember; revision?: number }
  | { type: "lobby-member-left"; userId: string; revision?: number }
  | { type: "media-producer-available"; payload: MediaProducerPayload }
  | { type: "media-producer-closed"; payload: MediaProducerPayload }
  | { type: "system-error"; code: string; message: string }
  | { type: "rtc-signal"; payload: RtcSignalPayload };

const STREAM_RECONNECT_BASE_DELAY_MS = 1000;
const STREAM_RECONNECT_MAX_DELAY_MS = 15000;

export class RealtimeClient {
  private connected = false;
  private connecting = false;
  private shouldRun = false;
  private reconnectAttempts = 0;
  private token: string | null = null;
  private onEvent: ((event: RealtimeEvent) => void) | null = null;
  private streamAbortController: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(private readonly baseUrl: string) {}

  private emitConnectionMetrics(): void {
    this.onEvent?.({
      type: "connection-metrics",
      latencyMs: null,
      packetLossPercent: 0,
      transport: this.connected ? "livekit" : "none",
      reconnectAttempts: this.reconnectAttempts,
      connected: this.connected,
    });
  }

  public connect(token: string, onEvent: (event: RealtimeEvent) => void): void {
    this.onEvent = onEvent;
    const normalizedToken = token.trim();
    if (normalizedToken.length === 0) {
      this.onEvent({
        type: "connection",
        status: "error",
        detail: "gecersiz access token",
      });
      return;
    }

    const tokenChanged = this.token !== normalizedToken;
    this.token = normalizedToken;
    this.shouldRun = true;

    if ((this.connected || this.connecting) && tokenChanged) {
      this.abortActiveStream();
      this.connected = false;
      this.connecting = false;
      this.clearReconnectTimer();
    }

    if (this.connected || this.connecting) {
      if (this.connected) {
        this.onEvent({ type: "connection", status: "connected" });
      }
      this.emitConnectionMetrics();
      return;
    }

    void this.openLobbyStream();
  }

  public disconnect(): void {
    const wasActive = this.connected || this.connecting;
    this.shouldRun = false;
    this.clearReconnectTimer();
    this.abortActiveStream();
    this.connecting = false;
    this.connected = false;
    this.token = null;

    if (!wasActive) {
      this.onEvent = null;
      return;
    }

    this.onEvent?.({ type: "connection", status: "disconnected" });
    this.emitConnectionMetrics();
    this.onEvent = null;
  }

  public joinLobby(): void {
    // Lobby membership is synchronized via backend REST and server-side LiveKit integration.
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
    return this.connected || this.connecting;
  }

  private async openLobbyStream(): Promise<void> {
    if (!this.shouldRun || this.connecting || this.token === null) {
      return;
    }

    this.clearReconnectTimer();
    this.connecting = true;

    const controller = new AbortController();
    this.streamAbortController = controller;

    try {
      const response = await fetch(`${this.baseUrl}/lobby/stream`, {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${this.token}`,
          "Cache-Control": "no-cache",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const statusDetail = `lobby stream baglanti hatasi (${response.status})`;
        if (response.status === 401 || response.status === 403) {
          this.shouldRun = false;
          this.connected = false;
          this.connecting = false;
          this.onEvent?.({
            type: "connection",
            status: "error",
            detail: statusDetail,
          });
          this.emitConnectionMetrics();
          return;
        }

        throw new Error(statusDetail);
      }

      if (!response.body) {
        throw new Error("lobby stream body bulunamadi");
      }

      this.connecting = false;
      this.connected = true;
      this.reconnectAttempts = 0;

      this.onEvent?.({ type: "connection", status: "connected" });
      this.emitConnectionMetrics();

      await this.consumeSseStream(response.body, controller.signal);

      if (!controller.signal.aborted) {
        throw new Error("lobby stream baglantisi kapandi");
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      const detail = error instanceof Error ? error.message : "bilinmeyen hata";
      const wasConnected = this.connected;
      this.connected = false;
      this.connecting = false;

      this.onEvent?.({
        type: "connection",
        status: wasConnected ? "disconnected" : "error",
        detail,
      });
      this.emitConnectionMetrics();

      this.scheduleReconnect();
    } finally {
      if (this.streamAbortController === controller) {
        this.streamAbortController = null;
      }
    }
  }

  private async consumeSseStream(
    stream: ReadableStream<Uint8Array>,
    signal: AbortSignal,
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      while (true) {
        const boundaryIndex = buffer.indexOf("\n\n");
        if (boundaryIndex < 0) {
          break;
        }

        const rawEvent = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);
        this.handleRawSseEvent(rawEvent);
      }
    }
  }

  private handleRawSseEvent(rawEvent: string): void {
    if (!rawEvent || rawEvent.startsWith(":")) {
      return;
    }

    let eventType = "message";
    const dataLines: string[] = [];

    for (const line of rawEvent.split("\n")) {
      if (line.startsWith("event:")) {
        eventType = line.slice("event:".length).trim();
        continue;
      }

      if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim());
      }
    }

    if (dataLines.length === 0) {
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(dataLines.join("\n"));
    } catch {
      return;
    }

    this.dispatchLobbyStreamEvent(eventType, payload);
  }

  private dispatchLobbyStreamEvent(eventType: string, payload: unknown): void {
    const source = payload as {
      members?: LobbyMember[];
      member?: LobbyMember;
      userId?: string;
      revision?: number;
    };
    const revision =
      typeof source.revision === "number" && Number.isFinite(source.revision)
        ? Math.max(0, Math.floor(source.revision))
        : undefined;

    if (eventType === "lobby-state" && Array.isArray(source.members)) {
      const event: RealtimeEvent = {
        type: "lobby-state",
        members: source.members,
      };
      if (revision !== undefined) {
        event.revision = revision;
      }
      this.onEvent?.(event);
      return;
    }

    if (eventType === "lobby-member-joined" && source.member) {
      const event: RealtimeEvent = {
        type: "lobby-member-joined",
        member: source.member,
      };
      if (revision !== undefined) {
        event.revision = revision;
      }
      this.onEvent?.(event);
      return;
    }

    if (eventType === "lobby-member-updated" && source.member) {
      const event: RealtimeEvent = {
        type: "lobby-member-updated",
        member: source.member,
      };
      if (revision !== undefined) {
        event.revision = revision;
      }
      this.onEvent?.(event);
      return;
    }

    if (
      eventType === "lobby-member-left" &&
      typeof source.userId === "string"
    ) {
      const event: RealtimeEvent = {
        type: "lobby-member-left",
        userId: source.userId,
      };
      if (revision !== undefined) {
        event.revision = revision;
      }
      this.onEvent?.(event);
      return;
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldRun || this.token === null) {
      return;
    }

    this.clearReconnectTimer();
    this.reconnectAttempts += 1;
    this.emitConnectionMetrics();

    const exponentialDelay =
      STREAM_RECONNECT_BASE_DELAY_MS *
      Math.pow(2, Math.min(this.reconnectAttempts - 1, 4));
    const reconnectDelay = Math.min(
      exponentialDelay,
      STREAM_RECONNECT_MAX_DELAY_MS,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openLobbyStream();
    }, reconnectDelay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private abortActiveStream(): void {
    if (!this.streamAbortController) {
      return;
    }

    this.streamAbortController.abort();
    this.streamAbortController = null;
  }
}
