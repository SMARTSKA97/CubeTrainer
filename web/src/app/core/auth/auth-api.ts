import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiBase } from '@core/config';
import {
  AuthPolicy,
  AuthResponse,
  ProfileUpdatePayload,
  RegisterPayload,
  SessionInfo,
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

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(this.url('/auth/login'), { email, password }, this.cookies);
  }

  refresh(): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(this.url('/auth/refresh'), null, {
      ...this.cookies,
      headers: CSRF,
    });
  }

  logout(): Observable<void> {
    return this.http.post<void>(this.url('/auth/logout'), null, { ...this.cookies, headers: CSRF });
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

  deleteAccount(password: string): Observable<void> {
    return this.http.delete<void>(this.url('/me'), { body: { password } });
  }

  sessions(): Observable<SessionInfo[]> {
    return this.http.get<SessionInfo[]>(this.url('/me/sessions'));
  }

  revokeSession(sessionId: string): Observable<void> {
    return this.http.delete<void>(this.url(`/me/sessions/${sessionId}`));
  }
}
