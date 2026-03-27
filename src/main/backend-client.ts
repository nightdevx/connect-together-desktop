import type {
  ChangePasswordRequest,
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
    return this.request<LobbyStateResponse>("/lobby/state", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  public async joinLobby(accessToken: string): Promise<LobbyActionResponse> {
    return this.request<LobbyActionResponse>("/lobby/join", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  public async leaveLobby(accessToken: string): Promise<LobbyActionResponse> {
    return this.request<LobbyActionResponse>("/lobby/leave", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  public async setLobbyMute(
    accessToken: string,
    muted: boolean,
  ): Promise<LobbyActionResponse> {
    return this.request<LobbyActionResponse>("/lobby/mute", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ muted }),
    });
  }

  public async setLobbyDeafen(
    accessToken: string,
    deafened: boolean,
  ): Promise<LobbyActionResponse> {
    return this.request<LobbyActionResponse>("/lobby/deafen", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ deafened }),
    });
  }

  public async setLobbySpeaking(
    accessToken: string,
    speaking: boolean,
  ): Promise<LobbyActionResponse> {
    return this.request<LobbyActionResponse>("/lobby/speaking", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ speaking }),
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
