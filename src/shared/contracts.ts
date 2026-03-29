export type UserRole = "admin" | "member";

export interface UserProfile {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  inviteCode?: string | undefined;
}

export interface UserSettingsProfile {
  displayName: string;
  email: string | null;
  bio: string | null;
  updatedAt: string;
}

export interface UserDirectoryEntry {
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  appOnline?: boolean;
}

export interface UpdateProfileRequest {
  displayName: string;
  email?: string | null | undefined;
  bio?: string | null | undefined;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface SessionUser {
  userId: string;
  username: string;
}

export interface LobbyMember {
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
  cameraSource?: string | null;
  screenSource?: string | null;
  cameraCodec?: string | null;
  screenCodec?: string | null;
}

export interface LobbyDescriptor {
  id: string;
  name: string;
  room: string;
  createdAt: string;
  createdBy: string;
  memberCount: number;
}

export interface LobbyChatMessage {
  id: string;
  channel: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
}

export type DirectChatMessage = LobbyChatMessage;

export type MediaProducerKind = "audio" | "video";
export type MediaSourceType = "microphone" | "camera" | "screen";

export interface ServerToClientEvents {
  "lobby:state": (members: LobbyMember[]) => void;
  "lobby:member-joined": (member: LobbyMember) => void;
  "lobby:member-left": (payload: { userId: string }) => void;
  "lobby:chat-history": (messages: LobbyChatMessage[]) => void;
  "lobby:message": (message: LobbyChatMessage) => void;
  "rtc:signal": (payload: RtcSignalPayload) => void;
  "media:producer-available": (payload: MediaProducerPayload) => void;
  "media:producer-closed": (payload: MediaProducerPayload) => void;
  "system:error": (payload: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  "lobby:join": () => void;
  "lobby:leave": () => void;
  "lobby:mute": (payload: { muted: boolean }) => void;
  "lobby:deafen": (payload: { deafened: boolean }) => void;
  "lobby:speaking": (payload: { speaking: boolean }) => void;
  "diag:ping": (
    payload: { seq: number; sentAt: number },
    ack: (payload: { seq: number; serverAt: number }) => void,
  ) => void;
  "rtc:signal": (payload: RtcSignalPayload) => void;
}

export type RtcSignalType = "offer" | "answer" | "ice-candidate";

export interface RtcSignalPayload {
  fromUserId: string;
  toUserId: string;
  type: RtcSignalType;
  data: unknown;
}

export interface MediaProducerPayload {
  userId: string;
  producerId: string;
  kind: MediaProducerKind;
  sourceType: MediaSourceType;
}
