import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'billing',
    loadComponent: () =>
      import('./pages/billing/billing').then((m) => m.Billing),
  },
  {
    path: 'customer/:id',
    loadComponent: () =>
      import('./pages/customer-detail/customer-detail').then((m) => m.CustomerDetail),
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./pages/admin/admin').then((m) => m.Admin),
  },
  { path: '**', redirectTo: '' },
];
