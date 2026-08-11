import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: 'Dashboard',
    loadComponent: () => import('./features/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'accounts',
    title: 'Accounts',
    loadComponent: () => import('./features/accounts.component').then((m) => m.AccountsComponent),
  },
  {
    path: 'cards',
    title: 'Credit Cards',
    loadComponent: () => import('./features/cards.component').then((m) => m.CardsComponent),
  },
  {
    path: 'spending',
    title: 'Spending',
    loadComponent: () => import('./features/spending.component').then((m) => m.SpendingComponent),
  },
  {
    path: 'assets',
    title: 'Investments & Assets',
    loadComponent: () => import('./features/assets.component').then((m) => m.AssetsComponent),
  },
  {
    path: 'people',
    title: 'People & PANs',
    loadComponent: () => import('./features/people.component').then((m) => m.PeopleComponent),
  },
  {
    path: 'settings',
    title: 'Settings',
    loadComponent: () => import('./features/settings.component').then((m) => m.SettingsComponent),
  },
  { path: '**', redirectTo: 'dashboard' },
];
