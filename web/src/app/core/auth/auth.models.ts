export interface UserProfile {
  id: string;
  email: string;
  emailConfirmed: boolean;
  handle: string;
  displayName: string;
  country: string;
  birthYear: number;
  cubeMethod: string | null;
  cubeModel: string | null;
  cubingSinceYear: number | null;
  leaderboardOptIn: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  /** ISO timestamp */
  expiresAt: string;
  user: UserProfile;
}

export interface AuthPolicy {
  minimumAge: number;
  minPasswordLength: number;
  maxPasswordLength: number;
  termsVersion: string;
  requireConfirmedEmail: boolean;
}

export interface RegisterPayload {
  email: string;
  password: string;
  displayName: string;
  handle: string;
  country: string;
  birthYear: number;
  cubeMethod: string | null;
  cubeModel: string | null;
  cubingYears: number | null;
  acceptTerms: boolean;
}

export interface ProfileUpdatePayload {
  displayName?: string;
  country?: string;
  cubeMethod?: string | null;
  cubeModel?: string | null;
  cubingYears?: number | null;
  leaderboardOptIn?: boolean;
  clearCubeMethod?: boolean;
  clearCubeModel?: boolean;
  clearCubingYears?: boolean;
}

export interface SessionInfo {
  sessionId: string;
  signedInAt: string;
  lastActiveAt: string;
  userAgent: string | null;
  ip: string | null;
  isCurrent: boolean;
}

export const CUBE_METHODS: readonly { value: string; label: string }[] = [
  { value: 'cfop', label: 'CFOP' },
  { value: 'roux', label: 'Roux' },
  { value: 'zz', label: 'ZZ' },
  { value: 'petrus', label: 'Petrus' },
  { value: 'mehta', label: 'Mehta' },
  { value: 'beginner', label: 'Beginner (layer by layer)' },
  { value: 'other', label: 'Other' },
];

export interface ProviderInfo {
  id: string;
  name: string;
}

export interface ExternalTicket {
  provider: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface CompleteExternalPayload {
  ticket: string;
  email?: string | null;
  displayName: string;
  handle: string;
  country: string;
  birthYear: number;
  cubeMethod: string | null;
  cubeModel: string | null;
  cubingYears: number | null;
  acceptTerms: boolean;
}

export interface LinkedIdentity {
  provider: string;
  email: string | null;
  linkedAt: string;
}

export interface IdentitiesView {
  hasPassword: boolean;
  linked: LinkedIdentity[];
}
