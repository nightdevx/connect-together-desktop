import type {
  ChangePasswordRequest,
  LobbyChatMessage,
  LobbyDescriptor,
  LoginRequest,
  MediaProducerKind,
  MediaSourceType,
  RegisterRequest,
  UpdateProfileRequest,
  UserDirectoryEntry,
  UserProfile,
  UserSettingsProfile,
} from "../shared/contracts";

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthResponse {
  user: UserProfile;
  tokens: Tokens;
}

interface ErrorResponse {
  code?: string;
  error?: string;
}

export interface LobbyStateResponse {
  lobbyId?: string;
  members: Array<{
    userId: string;
    username: string;
    joinedAt: string;
    muted: boolean;
    deafened: boolean;
    speaking: boolean;
    cameraEnabled: boolean;
    screenSharing: boolean;
    cameraProducerId: string | null;
    screenProducerId: string | null;
  }>;
  size: number;
  revision?: number;
}

export interface LobbyActionResponse {
  accepted: boolean;
  lobbyId?: string;
}

export interface LobbyListResponse {
  lobbies: LobbyDescriptor[];
}

export interface LobbyCreateResponse {
  lobby: LobbyDescriptor;
}

export interface LobbyUpdateResponse {
  lobby: LobbyDescriptor;
}

export interface LobbyDeleteResponse {
  deleted: boolean;
  lobbyId?: string;
}

export interface LobbyChatListResponse {
  messages: LobbyChatMessage[];
}

export interface LobbyChatSendResponse {
  message: LobbyChatMessage;
}

export interface MediaTransportResponse {
  transport: {
    id: string;
    iceParameters: unknown;
    iceCandidates: unknown[];
    dtlsParameters: unknown;
  };
}

export interface MediaProducerResponse {
  producerId: string;
  kind: MediaProducerKind;
  sourceType: MediaSourceType;
}

export interface MediaProducerListResponse {
  producers: Array<{
    peerId: string;
    producerId: string;
    kind: MediaProducerKind;
    sourceType: MediaSourceType;
  }>;
}

export interface MediaConsumerResponse {
  consumer: {
    id: string;
    producerId: string;
    kind: "audio" | "video";
    rtpParameters: unknown;
    type: string;
    producerPaused: boolean;
  };
}

export interface LiveKitTokenResponse {
  serverUrl: string;
  room: string;
  identity: string;
  name: string;
  token: string;
  expiresAt: string;
  mediaPolicy?: {
    qualityProfile?: "balanced" | "high" | "low-bandwidth";
    preferredVideoCodec: string;
    backupVideoCodec: string;
    cameraMaxBitrate: number;
    cameraMaxFps: number;
    screenMaxBitrate: number;
    screenMaxFps: number;
    simulcast: boolean;
    dynacast: boolean;
  };
}

export interface ProfileResponse {
  profile: UserSettingsProfile;
}

export interface UserDirectoryResponse {
  users: UserDirectoryEntry[];
}

export class DesktopApiError extends Error {
  public constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "DesktopApiError";
  }
}

export class BackendClient {
  public constructor(private readonly baseUrl: string) {}

  public async register(payload: RegisterRequest): Promise<AuthResponse> {
    return this.request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async login(payload: LoginRequest): Promise<AuthResponse> {
    return this.request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async refresh(refreshToken: string): Promise<AuthResponse> {
    return this.request<AuthResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  }

  public async getMe(accessToken: string): Promise<{ user: UserProfile }> {
    return this.request<{ user: UserProfile }>("/auth/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  public async getProfile(accessToken: string): Promise<ProfileResponse> {
    return this.request<ProfileResponse>("/auth/profile", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  public async getRegisteredUsers(
    accessToken: string,
  ): Promise<UserDirectoryResponse> {
    return this.request<UserDirectoryResponse>("/auth/users", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  public async updateProfile(
    accessToken: string,
    payload: UpdateProfileRequest,
  ): Promise<ProfileResponse> {
    return this.request<ProfileResponse>("/auth/profile", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
  }

  public async changePassword(
    accessToken: string,
    payload: ChangePasswordRequest,
  ): Promise<{ changed: boolean }> {
    return this.request<{ changed: boolean }>("/auth/change-password", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
  }

  public async getLobbyState(accessToken: string): Promise<LobbyStateResponse> {
    return this.getLobbyStateFor(accessToken, undefined);
  }

  public async getLobbyStateFor(
    accessToken: string,
    lobbyId?: string,
  ): Promise<LobbyStateResponse> {
    const path = new URL("/lobby/state", this.baseUrl);
    if (lobbyId && lobbyId.trim().length > 0) {
      path.searchParams.set("lobbyId", lobbyId.trim());
    }

    return this.request<LobbyStateResponse>(`${path.pathname}${path.search}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  public async listLobbies(accessToken: string): Promise<LobbyListResponse> {
    return this.request<LobbyListResponse>("/lobby/rooms", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  public async createLobby(
    accessToken: string,
    name: string,
  ): Promise<LobbyCreateResponse> {
    return this.request<LobbyCreateResponse>("/lobby/rooms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ name }),
    });
  }

  public async updateLobby(
    accessToken: string,
    lobbyId: string,
    name: string,
  ): Promise<LobbyUpdateResponse> {
    const normalizedLobbyID = lobbyId.trim();
    return this.request<LobbyUpdateResponse>(
      `/lobby/rooms/${encodeURIComponent(normalizedLobbyID)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ name }),
      },
    );
  }

  public async deleteLobby(
    accessToken: string,
    lobbyId: string,
  ): Promise<LobbyDeleteResponse> {
    const normalizedLobbyID = lobbyId.trim();
    return this.request<LobbyDeleteResponse>(
      `/lobby/rooms/${encodeURIComponent(normalizedLobbyID)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  }

  public async listLobbyMessages(
    accessToken: string,
    lobbyId: string,
    limit?: number,
  ): Promise<LobbyChatListResponse> {
    const normalizedLobbyID = lobbyId.trim();
    const path = new URL(
      `/chat/lobbies/${encodeURIComponent(normalizedLobbyID)}/messages`,
      this.baseUrl,
    );
    if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
      path.searchParams.set("limit", `${Math.floor(limit)}`);
    }

    return this.request<LobbyChatListResponse>(
      `${path.pathname}${path.search}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  }

  public async sendLobbyMessage(
    accessToken: string,
    lobbyId: string,
    body: string,
  ): Promise<LobbyChatSendResponse> {
    const normalizedLobbyID = lobbyId.trim();
    return this.request<LobbyChatSendResponse>(
      `/chat/lobbies/${encodeURIComponent(normalizedLobbyID)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ body }),
      },
    );
  }

  public async listDirectMessages(
    accessToken: string,
    peerUserId: string,
    limit?: number,
  ): Promise<LobbyChatListResponse> {
    const normalizedPeerID = peerUserId.trim();
    const path = new URL(
      `/chat/direct/${encodeURIComponent(normalizedPeerID)}/messages`,
      this.baseUrl,
    );
    if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
      path.searchParams.set("limit", `${Math.floor(limit)}`);
    }

    return this.request<LobbyChatListResponse>(
      `${path.pathname}${path.search}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  }

  public async sendDirectMessage(
    accessToken: string,
    peerUserId: string,
    body: string,
  ): Promise<LobbyChatSendResponse> {
    const normalizedPeerID = peerUserId.trim();
    return this.request<LobbyChatSendResponse>(
      `/chat/direct/${encodeURIComponent(normalizedPeerID)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ body }),
      },
    );
  }

  public async joinLobby(
    accessToken: string,
    lobbyId?: string,
  ): Promise<LobbyActionResponse> {
    return this.request<LobbyActionResponse>("/lobby/join", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(
        lobbyId && lobbyId.trim().length > 0 ? { lobbyId: lobbyId.trim() } : {},
      ),
    });
  }

  public async leaveLobby(
    accessToken: string,
    lobbyId?: string,
  ): Promise<LobbyActionResponse> {
    return this.request<LobbyActionResponse>("/lobby/leave", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(
        lobbyId && lobbyId.trim().length > 0 ? { lobbyId: lobbyId.trim() } : {},
      ),
    });
  }

  public async setLobbyMute(
    accessToken: string,
    muted: boolean,
    lobbyId?: string,
  ): Promise<LobbyActionResponse> {
    return this.request<LobbyActionResponse>("/lobby/mute", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        muted,
        ...(lobbyId && lobbyId.trim().length > 0
          ? { lobbyId: lobbyId.trim() }
          : {}),
      }),
    });
  }

  public async setLobbyDeafen(
    accessToken: string,
    deafened: boolean,
    lobbyId?: string,
  ): Promise<LobbyActionResponse> {
    return this.request<LobbyActionResponse>("/lobby/deafen", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        deafened,
        ...(lobbyId && lobbyId.trim().length > 0
          ? { lobbyId: lobbyId.trim() }
          : {}),
      }),
    });
  }

  public async setLobbySpeaking(
    accessToken: string,
    speaking: boolean,
    lobbyId?: string,
  ): Promise<LobbyActionResponse> {
    return this.request<LobbyActionResponse>("/lobby/speaking", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        speaking,
        ...(lobbyId && lobbyId.trim().length > 0
          ? { lobbyId: lobbyId.trim() }
          : {}),
      }),
    });
  }

  public async getMediaRtpCapabilities(
    accessToken: string,
  ): Promise<{ rtpCapabilities: unknown }> {
    return this.request<{ rtpCapabilities: unknown }>(
      "/media/rtp-capabilities",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  }

  public async createMediaTransport(
    accessToken: string,
    direction: "send" | "recv",
  ): Promise<MediaTransportResponse> {
    return this.request<MediaTransportResponse>("/media/transports", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ direction }),
    });
  }

  public async connectMediaTransport(
    accessToken: string,
    transportId: string,
    dtlsParameters: unknown,
  ): Promise<{ connected: boolean }> {
    return this.request<{ connected: boolean }>(
      `/media/transports/${transportId}/connect`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ dtlsParameters }),
      },
    );
  }

  public async createMediaProducer(
    accessToken: string,
    payload: {
      transportId: string;
      kind: MediaProducerKind;
      sourceType?: MediaSourceType;
      rtpParameters: unknown;
    },
  ): Promise<MediaProducerResponse> {
    return this.request<MediaProducerResponse>("/media/producers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
  }

  public async listMediaProducers(
    accessToken: string,
  ): Promise<MediaProducerListResponse> {
    return this.request<MediaProducerListResponse>("/media/producers", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  public async createMediaConsumer(
    accessToken: string,
    payload: {
      transportId: string;
      producerId: string;
      rtpCapabilities: unknown;
    },
  ): Promise<MediaConsumerResponse> {
    return this.request<MediaConsumerResponse>("/media/consumers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
  }

  public async resumeMediaConsumer(
    accessToken: string,
    consumerId: string,
  ): Promise<{ resumed: boolean }> {
    return this.request<{ resumed: boolean }>(
      `/media/consumers/${consumerId}/resume`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  }

  public async createLiveKitToken(
    accessToken: string,
    room?: string,
  ): Promise<LiveKitTokenResponse> {
    return this.request<LiveKitTokenResponse>("/media/livekit/token", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(
        room && room.trim().length > 0 ? { room: room.trim() } : {},
      ),
    });
  }

  private async request<T>(path: string, options: RequestInit): Promise<T> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), 8000);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers ?? {}),
        },
        signal: timeoutController.signal,
      });

      const raw = (await response
        .json()
        .catch(() => ({}))) as Partial<ErrorResponse> & T;
      if (!response.ok) {
        const code = raw.code ?? "HTTP_ERROR";
        const message = raw.error ?? `Request failed: ${response.status}`;
        throw new DesktopApiError(code, response.status, message);
      }

      return raw as T;
    } catch (error) {
      if (error instanceof DesktopApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new DesktopApiError(
          "REQUEST_TIMEOUT",
          408,
          "Backend request timed out",
        );
      }

      throw new DesktopApiError("NETWORK_ERROR", 503, "Backend is unreachable");
    } finally {
      clearTimeout(timeout);
    }
  }
}
