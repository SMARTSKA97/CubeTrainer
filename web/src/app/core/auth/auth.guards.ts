import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth-store';

/** Route needs a signed-in user; guests are sent to the login page and brought back afterwards. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.init();
  return auth.signedIn()
    ? true
    : router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
};

/** Login/register pages make no sense for someone already signed in. */
export const guestOnlyGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router); // inject() only works before the first await
  await auth.init();
  return auth.signedIn() ? router.createUrlTree(['/settings']) : true;
};
