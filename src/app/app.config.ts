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
  apiKey: "AIzaSyDouVaWti7K0ZD8O8ql4gHW7x54CmJHnPE",
  authDomain: "omniflex-b6099.firebaseapp.com",
  projectId: "omniflex-b6099",
  storageBucket: "omniflex-b6099.firebasestorage.app",
  messagingSenderId: "843761856237",
  appId: "1:843761856237:web:f15275ce02da8d26d0e6e4",
  measurementId: "G-TS15N0RE9S"
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
