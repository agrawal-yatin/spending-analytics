import { ApplicationConfig, isDevMode } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { PersistenceAdapter } from './core/persistence';
import { LocalStorageAdapter } from './core/local-storage.adapter';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withHashLocation()),
    // Swap this single line for SupabaseAdapter when you add the backend.
    { provide: PersistenceAdapter, useClass: LocalStorageAdapter },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
