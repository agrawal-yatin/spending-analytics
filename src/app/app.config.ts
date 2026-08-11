import { ApplicationConfig, isDevMode } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { PersistenceAdapter } from './core/persistence';
import { SupabaseAdapter } from './core/supabase.adapter';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withHashLocation()),
    // Cloud mode: data syncs to Supabase (requires keys in environment.ts + sign-in).
    // For purely local storage, swap this back to LocalStorageAdapter.
    { provide: PersistenceAdapter, useClass: SupabaseAdapter },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
