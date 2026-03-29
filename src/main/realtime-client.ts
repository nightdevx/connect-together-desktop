import type {
  LobbyChatMessage,
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
  | {
      type: "lobby-state";
      lobbyId?: string;
      members: LobbyMember[];
      revision?: number;
    }
  | {
      type: "lobby-member-joined";
      lobbyId?: string;
      member: LobbyMember;
      revision?: number;
    }
  | {
      type: "lobby-member-updated";
      lobbyId?: string;
      member: LobbyMember;
      revision?: number;
    }
  | {
      type: "lobby-member-left";
      lobbyId?: string;
      userId: string;
      revision?: number;
    }
  | { type: "lobby-chat-history"; messages: LobbyChatMessage[] }
  | { type: "lobby-message"; chatMessage: LobbyChatMessage }
  | { type: "media-producer-available"; payload: MediaProducerPayload }
  | { type: "media-producer-closed"; payload: MediaProducerPayload }
  | { type: "system-error"; code: string; message: string }
  | { type: "rtc-signal"; payload: RtcSignalPayload };

const SOCKET_RECONNECT_BASE_DELAY_MS = 1000;
const SOCKET_RECONNECT_MAX_DELAY_MS = 15000;

export class RealtimeClient {
  private connected = false;
  private connecting = false;
  private shouldRun = false;
  private reconnectAttempts = 0;
  private token: string | null = null;
  private lobbyId: string | null = null;
  private onEvent: ((event: RealtimeEvent) => void) | null = null;
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSocketErrorDetail: string | null = null;

  public constructor(private readonly baseUrl: string) {}

  private emitConnectionMetrics(): void {
    this.onEvent?.({
      type: "connection-metrics",
      latencyMs: null,
      packetLossPercent: 0,
      transport: this.connected ? "backend-livekit-ws" : "none",
      reconnectAttempts: this.reconnectAttempts,
      connected: this.connected,
    });
  }

  public connect(
    token: string,
    lobbyId: string,
    onEvent: (event: RealtimeEvent) => void,
  ): void {
    this.onEvent = onEvent;
    const normalizedToken = token.trim();
    const normalizedLobbyID = lobbyId.trim();
    if (normalizedToken.length === 0) {
      this.onEvent({
        type: "connection",
        status: "error",
        detail: "gecersiz access token",
      });
      return;
    }

    if (normalizedLobbyID.length === 0) {
      this.onEvent({
        type: "connection",
        status: "error",
        detail: "gecersiz lobby id",
      });
      return;
    }

    const tokenChanged = this.token !== normalizedToken;
    const lobbyChanged = this.lobbyId !== normalizedLobbyID;
    this.token = normalizedToken;
    this.lobbyId = normalizedLobbyID;
    this.shouldRun = true;

    if ((this.connected || this.connecting) && (tokenChanged || lobbyChanged)) {
      this.closeActiveSocket(1000, "token-updated");
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

    this.openLobbySocket();
  }

  public disconnect(): void {
    const wasActive = this.connected || this.connecting;
    this.shouldRun = false;
    this.clearReconnectTimer();
    this.closeActiveSocket(1000, "client-disconnect");
    this.connecting = false;
    this.connected = false;
    this.token = null;
    this.lobbyId = null;
    this.lastSocketErrorDetail = null;

    if (!wasActive) {
      this.onEvent = null;
      return;
    }

    this.onEvent?.({ type: "connection", status: "disconnected" });
    this.emitConnectionMetrics();
    this.onEvent = null;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public isConnectedOrConnecting(): boolean {
    return this.connected || this.connecting;
  }

  private openLobbySocket(): void {
    if (
      !this.shouldRun ||
      this.connecting ||
      this.token === null ||
      this.lobbyId === null
    ) {
      return;
    }

    this.clearReconnectTimer();
    this.connecting = true;

    const socketUrl = this.buildLobbySocketUrl(this.token, this.lobbyId);
    const socket = new WebSocket(socketUrl);
    this.socket = socket;
    this.lastSocketErrorDetail = null;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) {
        return;
      }

      this.connecting = false;
      this.connected = true;
      this.reconnectAttempts = 0;

      this.onEvent?.({ type: "connection", status: "connected" });
      this.emitConnectionMetrics();
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) {
        return;
      }

      this.handleRawLobbySocketMessage(event.data);
    });

    socket.addEventListener("error", () => {
      if (this.socket !== socket) {
        return;
      }

      this.lastSocketErrorDetail = "lobby websocket baglantisi hataya dustu";
    });

    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) {
        return;
      }

      this.socket = null;

      const wasConnected = this.connected;
      this.connected = false;
      this.connecting = false;

      if (!this.shouldRun) {
        return;
      }

      const detail = this.describeSocketClose(event);
      this.onEvent?.({
        type: "connection",
        status: wasConnected ? "disconnected" : "error",
        detail,
      });
      this.emitConnectionMetrics();

      this.scheduleReconnect();
    });
  }

  private buildLobbySocketUrl(token: string, lobbyId: string): string {
    const parsedBase = new URL(this.baseUrl);
    parsedBase.protocol = parsedBase.protocol === "https:" ? "wss:" : "ws:";
    parsedBase.pathname = "/media/livekit/lobby/ws";
    parsedBase.search = "";
    parsedBase.searchParams.set("access_token", token);
    parsedBase.searchParams.set("lobbyId", lobbyId);
    return parsedBase.toString();
  }

  private describeSocketClose(event: CloseEvent): string {
    const reason = event.reason?.trim();
    if (reason) {
      return reason;
    }

    if (this.lastSocketErrorDetail) {
      return this.lastSocketErrorDetail;
    }

    if (event.code > 0) {
      return `lobby websocket kapandi (kod: ${event.code})`;
    }

    return "lobby websocket baglantisi kapandi";
  }

  private handleRawLobbySocketMessage(rawData: unknown): void {
    if (typeof rawData !== "string" || rawData.trim() === "") {
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawData);
    } catch {
      return;
    }

    this.dispatchLobbySocketEvent(payload);
  }

  private dispatchLobbySocketEvent(payload: unknown): void {
    const source = payload as {
      type?: string;
      members?: LobbyMember[];
      member?: LobbyMember;
      messages?: LobbyChatMessage[];
      message?: unknown;
      userId?: string;
      revision?: number;
      code?: string;
    };

    const eventType = typeof source.type === "string" ? source.type : "";
    const currentLobbyID = this.lobbyId;
    const revision =
      typeof source.revision === "number" && Number.isFinite(source.revision)
        ? Math.max(0, Math.floor(source.revision))
        : undefined;

    if (eventType === "lobby-state" && Array.isArray(source.members)) {
      this.onEvent?.({
        type: "lobby-state",
        ...(currentLobbyID ? { lobbyId: currentLobbyID } : {}),
        members: source.members,
        ...(revision !== undefined ? { revision } : {}),
      });
      return;
    }

    if (eventType === "lobby-member-joined" && source.member) {
      this.onEvent?.({
        type: "lobby-member-joined",
        ...(currentLobbyID ? { lobbyId: currentLobbyID } : {}),
        member: source.member,
        ...(revision !== undefined ? { revision } : {}),
      });
      return;
    }

    if (eventType === "lobby-member-updated" && source.member) {
      this.onEvent?.({
        type: "lobby-member-updated",
        ...(currentLobbyID ? { lobbyId: currentLobbyID } : {}),
        member: source.member,
        ...(revision !== undefined ? { revision } : {}),
      });
      return;
    }

    if (
      eventType === "lobby-member-left" &&
      typeof source.userId === "string"
    ) {
      this.onEvent?.({
        type: "lobby-member-left",
        ...(currentLobbyID ? { lobbyId: currentLobbyID } : {}),
        userId: source.userId,
        ...(revision !== undefined ? { revision } : {}),
      });
      return;
    }

    if (eventType === "lobby-chat-history" && Array.isArray(source.messages)) {
      this.onEvent?.({
        type: "lobby-chat-history",
        messages: source.messages,
      });
      return;
    }

    if (
      eventType === "lobby-message" &&
      typeof source.message === "object" &&
      source.message !== null
    ) {
      this.onEvent?.({
        type: "lobby-message",
        chatMessage: source.message as LobbyChatMessage,
      });
      return;
    }

    if (eventType === "system-error") {
      this.onEvent?.({
        type: "system-error",
        code:
          typeof source.code === "string" && source.code.length > 0
            ? source.code
            : "LIVEKIT_STREAM_ERROR",
        message:
          typeof source.message === "string" && source.message.length > 0
            ? source.message
            : "LiveKit stream error",
      });
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldRun || this.token === null || this.lobbyId === null) {
      return;
    }

    this.clearReconnectTimer();
    this.reconnectAttempts += 1;
    this.emitConnectionMetrics();

    const exponentialDelay =
      SOCKET_RECONNECT_BASE_DELAY_MS *
      Math.pow(2, Math.min(this.reconnectAttempts - 1, 4));
    const reconnectDelay = Math.min(
      exponentialDelay,
      SOCKET_RECONNECT_MAX_DELAY_MS,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openLobbySocket();
    }, reconnectDelay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private closeActiveSocket(code: number, reason: string): void {
    if (!this.socket) {
      return;
    }

    const socket = this.socket;
    this.socket = null;

    try {
      socket.close(code, reason);
    } catch {
      // no-op
    }
  }
}
