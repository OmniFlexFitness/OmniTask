import { AppEnvironment } from './environment.types';

/**
 * Production environment (default build).
 *
 * `ng serve --configuration local` swaps this file for environment.local.ts
 * via fileReplacements in angular.json, so production builds never contain
 * emulator wiring.
 */
export const environment: AppEnvironment = {
  firebase: {
    apiKey: 'AIzaSyAzNb5uJAOMNv5NMO-jWP2QUuxJXy5TmXc',
    authDomain: 'omnitask-475422.firebaseapp.com',
    projectId: 'omnitask-475422',
    storageBucket: 'omnitask-475422.firebasestorage.app',
    messagingSenderId: '172130002005',
    appId: '1:172130002005:web:bf5ace48b76a7f725260dc',
    measurementId: 'G-KJ2YXHPWY6',
  },
  emulators: null,
};
