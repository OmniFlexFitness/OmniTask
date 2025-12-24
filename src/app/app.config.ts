import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getFunctions, provideFunctions } from '@angular/fire/functions';

import { routes } from './app.routes';

// Firebase configuration for OmniTask
const firebaseConfig = {
  apiKey: "AIzaSyD0ahULd8Yz3Mq5fVqgw06xeEOH535BQQ0",
  authDomain: "omnitask-omniflex.firebaseapp.com",
  projectId: "omnitask-omniflex",
  storageBucket: "omnitask-omniflex.firebasestorage.app",
  messagingSenderId: "636392647098",
  appId: "1:636392647098:web:ace2826a941737dd0f1583"
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideFunctions(() => getFunctions())
  ]
};
