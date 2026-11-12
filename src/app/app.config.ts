import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { connectAuthEmulator, getAuth, provideAuth } from '@angular/fire/auth';
import { connectFirestoreEmulator, getFirestore, provideFirestore } from '@angular/fire/firestore';
import { connectFunctionsEmulator, getFunctions, provideFunctions } from '@angular/fire/functions';
import { connectStorageEmulator, getStorage, provideStorage } from '@angular/fire/storage';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

// Firebase configuration for OmniTask. Production values by default; the
// `local` build configuration swaps in the Emulator Suite (see
// src/environments/environment.local.ts and docs/local-development.md).
const { firebase: firebaseConfig, emulators } = environment;

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideAuth(() => {
      const auth = getAuth();
      if (emulators) {
        // The SDK's own warning strip is replaced by <app-emulator-banner> (brand-styled).
        connectAuthEmulator(auth, `http://${emulators.host}:${emulators.authPort}`, { disableWarnings: true });
      }
      return auth;
    }),
    provideFirestore(() => {
      const firestore = getFirestore();
      if (emulators) {
        connectFirestoreEmulator(firestore, emulators.host, emulators.firestorePort);
      }
      return firestore;
    }),
    provideFunctions(() => {
      const functions = getFunctions();
      if (emulators) {
        connectFunctionsEmulator(functions, emulators.host, emulators.functionsPort);
      }
      return functions;
    }),
    provideStorage(() => {
      const storage = getStorage();
      if (emulators) {
        connectStorageEmulator(storage, emulators.host, emulators.storagePort);
      }
      return storage;
    }),
  ],
};
