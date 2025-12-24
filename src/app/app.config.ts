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
  apiKey: "AIzaSyAzNb5uJAOMNv5NMO-jWP2QUuxJXy5TmXc",
  authDomain: "omnitask-475422.firebaseapp.com",
  projectId: "omnitask-475422",
  storageBucket: "omnitask-475422.firebasestorage.app",
  messagingSenderId: "172130002005",
  appId: "1:172130002005:web:bf5ace48b76a7f725260dc",
  measurementId: "G-KJ2YXHPWY6"
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
