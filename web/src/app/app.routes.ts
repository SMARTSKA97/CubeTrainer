import { Routes } from '@angular/router';
import { authGuard, guestOnlyGuard } from '@core/auth/auth.guards';

const title = (name: string) => `${name} · CubeTrainer`;

/** Every feature is a lazy chunk: the first load only ships the shell. */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'today' },
  {
    path: 'today',
    title: title('Today'),
    loadComponent: () => import('@features/today/today-page').then((m) => m.TodayPage),
  },
  {
    path: 'timer',
    title: title('Timer'),
    loadComponent: () => import('@features/timer/timer-page').then((m) => m.TimerPage),
  },
  {
    path: 'trainer',
    title: title('Case trainer'),
    loadComponent: () => import('@features/trainer/trainer-page').then((m) => m.TrainerPage),
  },
  {
    path: 'algorithms',
    title: title('Algorithms'),
    loadComponent: () => import('@features/algorithms/algorithms-page').then((m) => m.AlgsPage),
  },
  {
    path: 'drill',
    title: title('Recognition drill'),
    loadComponent: () => import('@features/drill/drill-page').then((m) => m.DrillPage),
  },
  {
    path: 'progress',
    title: title('Progress'),
    loadComponent: () => import('@features/progress/progress-page').then((m) => m.ProgressPage),
  },
  {
    path: 'cross',
    title: title('Cross solver'),
    loadComponent: () => import('@features/cross/cross-page').then((m) => m.CrossPage),
  },
  {
    path: 'history',
    title: title('History'),
    loadComponent: () => import('@features/history/history-page').then((m) => m.HistoryPage),
  },
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        title: title('Sign in'),
        canActivate: [guestOnlyGuard],
        loadComponent: () => import('@features/auth/login-page').then((m) => m.LoginPage),
      },
      {
        path: 'register',
        title: title('Create account'),
        canActivate: [guestOnlyGuard],
        loadComponent: () => import('@features/auth/register-page').then((m) => m.RegisterPage),
      },
      {
        path: 'external/done',
        title: title('Signing in'),
        loadComponent: () =>
          import('@features/auth/external-done-page').then((m) => m.ExternalDonePage),
      },
      {
        path: 'external/complete',
        title: title('Finish sign-up'),
        loadComponent: () =>
          import('@features/auth/external-complete-page').then((m) => m.ExternalCompletePage),
      },
      {
        path: 'verify-email',
        title: title('Confirm email'),
        loadComponent: () =>
          import('@features/auth/verify-email-page').then((m) => m.VerifyEmailPage),
      },
      {
        path: 'forgot-password',
        title: title('Forgot password'),
        loadComponent: () =>
          import('@features/auth/forgot-password-page').then((m) => m.ForgotPasswordPage),
      },
      {
        path: 'reset-password',
        title: title('Reset password'),
        loadComponent: () =>
          import('@features/auth/reset-password-page').then((m) => m.ResetPasswordPage),
      },
    ],
  },
  {
    path: 'settings',
    title: title('Settings'),
    canActivate: [authGuard],
    loadComponent: () => import('@features/settings/settings-page').then((m) => m.SettingsPage),
  },
  {
    path: 'legal/terms',
    title: title('Terms'),
    data: { kind: 'terms' },
    loadComponent: () => import('@features/legal/legal-page').then((m) => m.LegalPage),
  },
  {
    path: 'legal/privacy',
    title: title('Privacy'),
    data: { kind: 'privacy' },
    loadComponent: () => import('@features/legal/legal-page').then((m) => m.LegalPage),
  },
  { path: '**', redirectTo: 'today' },
];
