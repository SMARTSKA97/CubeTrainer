import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { apiBase } from '@core/config';
import { isNative } from '@core/native';
import { AuthStore } from './auth-store';

const isOurApi = (url: string) => url.startsWith(apiBase());
const isAuthCall = (url: string) =>
  /\/auth\/(login|register|refresh|logout|forgot-password|reset-password|verify-email|resend-verification)\b/.test(
    url,
  );

const withToken = (req: HttpRequest<unknown>, token: string | null) =>
  token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

/** Adds the bearer token to API calls and transparently refreshes once when the server answers 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isOurApi(req.url)) return next(req);
  const auth = inject(AuthStore);
  // Tells the API to return the refresh token in the response body instead of setting a cookie.
  if (isNative()) req = req.clone({ setHeaders: { 'X-Client-Type': 'native' } });

  return next(withToken(req, auth.token())).pipe(
    catchError((err: unknown) => {
      if (
        !(err instanceof HttpErrorResponse) ||
        err.status !== 401 ||
        isAuthCall(req.url) ||
        !auth.signedIn()
      )
        return throwError(() => err);
      return from(auth.refresh()).pipe(
        switchMap((ok) => {
          if (!ok) {
            auth.expire();
            return throwError(() => err);
          }
          return next(withToken(req, auth.token()));
        }),
      );
    }),
  );
};
