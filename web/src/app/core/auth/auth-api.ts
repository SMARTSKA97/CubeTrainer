import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiBase } from '@core/config';
import {
  AuthPolicy,
  AuthResponse,
  CompleteExternalPayload,
  ExternalTicket,
  IdentitiesView,
  ProfileUpdatePayload,
  ProviderInfo,
  RecoveryCodeSet,
  RegisterPayload,
  SessionInfo,
  TwoFactorRequired,
  TwoFactorSetup,
  TwoFactorStatus,
  UserProfile,
} from './auth.models';

/** Header the API requires on cookie-based calls: a cross-site form post cannot add it (CSRF defence). */
const CSRF = new HttpHeaders({ 'X-Requested-With': 'CubeTrainer' });

/** Thin typed wrapper over the /auth and /me endpoints. No state here: see AuthStore. */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly cookies = { withCredentials: true } as const;

  private url(path: string): string {
    return `${apiBase()}${path}`;
  }

  policy(): Observable<AuthPolicy> {
    return this.http.get<AuthPolicy>(this.url('/auth/policy'));
  }

  register(body: RegisterPayload): Observable<void> {
    return this.http.post<void>(this.url('/auth/register'), body);
  }

  handleAvailable(handle: string): Observable<{ available: boolean }> {
    return this.http.get<{ available: boolean }>(this.url('/auth/handle-available'), {
      params: { handle },
    });
  }

  verifyEmail(token: string): Observable<void> {
    return this.http.post<void>(this.url('/auth/verify-email'), { token });
  }

  resendVerification(email: string): Observable<void> {
    return this.http.post<void>(this.url('/auth/resend-verification'), { email });
  }

  login(email: string, password: string): Observable<AuthResponse | TwoFactorRequired> {
    return this.http.post<AuthResponse | TwoFactorRequired>(
      this.url('/auth/login'),
      { email, password },
      this.cookies,
    );
  }

  /** Second sign-in step: the challenge from login (or the social redirect) plus an app code or a recovery code. */
  loginTwoFactor(challenge: string, code: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      this.url('/auth/login/2fa'),
      { challenge, code },
      this.cookies,
    );
  }

  twoFactorStatus(): Observable<TwoFactorStatus> {
    return this.http.get<TwoFactorStatus>(this.url('/auth/2fa'));
  }

  twoFactorSetup(password: string | null): Observable<TwoFactorSetup> {
    return this.http.post<TwoFactorSetup>(this.url('/auth/2fa/setup'), { password });
  }

  twoFactorEnable(code: string): Observable<RecoveryCodeSet> {
    return this.http.post<RecoveryCodeSet>(this.url('/auth/2fa/enable'), { code });
  }

  twoFactorDisable(password: string | null, code: string): Observable<void> {
    return this.http.post<void>(this.url('/auth/2fa/disable'), { password, code });
  }

  twoFactorRecoveryCodes(code: string): Observable<RecoveryCodeSet> {
    return this.http.post<RecoveryCodeSet>(this.url('/auth/2fa/recovery-codes'), { code });
  }

  /** Browsers rely on the cookie; the native app sends its stored refresh token in the body. */
  refresh(refreshToken?: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      this.url('/auth/refresh'),
      refreshToken ? { refreshToken } : null,
      { ...this.cookies, headers: CSRF },
    );
  }

  logout(refreshToken?: string): Observable<void> {
    return this.http.post<void>(this.url('/auth/logout'), refreshToken ? { refreshToken } : null, {
      ...this.cookies,
      headers: CSRF,
    });
  }

  logoutEverywhere(): Observable<void> {
    return this.http.post<void>(this.url('/auth/logout-all'), null, this.cookies);
  }

  forgotPassword(email: string): Observable<void> {
    return this.http.post<void>(this.url('/auth/forgot-password'), { email });
  }

  resetPassword(token: string, newPassword: string): Observable<void> {
    return this.http.post<void>(this.url('/auth/reset-password'), { token, newPassword });
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(this.url('/auth/change-password'), {
      currentPassword,
      newPassword,
    });
  }

  me(): Observable<UserProfile> {
    return this.http.get<UserProfile>(this.url('/me'));
  }

  updateProfile(body: ProfileUpdatePayload): Observable<UserProfile> {
    return this.http.patch<UserProfile>(this.url('/me'), body);
  }

  deleteAccount(password: string | null, confirmHandle: string | null = null): Observable<void> {
    return this.http.delete<void>(this.url('/me'), { body: { password, confirmHandle } });
  }

  /** Everything stored about the account, as a JSON file body. */
  exportData(): Observable<Blob> {
    return this.http.get(this.url('/me/export'), { responseType: 'blob' });
  }

  sessions(): Observable<SessionInfo[]> {
    return this.http.get<SessionInfo[]>(this.url('/me/sessions'));
  }

  revokeSession(sessionId: string): Observable<void> {
    return this.http.delete<void>(this.url(`/me/sessions/${sessionId}`));
  }

  // ---- social login

  providers(): Observable<ProviderInfo[]> {
    return this.http.get<ProviderInfo[]>(this.url('/auth/providers'));
  }

  /** A full-page navigation target: the API sends the browser on to the provider. */
  externalStartUrl(provider: string, returnUrl: string): string {
    return `${apiBase()}/auth/external/${provider}/start?returnUrl=${encodeURIComponent(returnUrl)}`;
  }

  externalTicket(ticket: string): Observable<ExternalTicket> {
    return this.http.get<ExternalTicket>(this.url('/auth/external/ticket'), { params: { ticket } });
  }

  /** 200 with a session, or 202 {verifyEmail:true} when the address still needs confirming. */
  externalComplete(
    body: CompleteExternalPayload,
  ): Observable<HttpResponse<AuthResponse | { verifyEmail: boolean }>> {
    return this.http.post<AuthResponse | { verifyEmail: boolean }>(
      this.url('/auth/external/complete'),
      body,
      {
        ...this.cookies,
        observe: 'response',
      },
    );
  }

  identities(): Observable<IdentitiesView> {
    return this.http.get<IdentitiesView>(this.url('/me/identities'));
  }

  linkStart(provider: string): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(this.url(`/me/identities/${provider}/link-start`), null);
  }

  unlink(provider: string): Observable<void> {
    return this.http.delete<void>(this.url(`/me/identities/${provider}`));
  }
}
