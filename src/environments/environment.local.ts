import { AppEnvironment } from './environment.types';

/**
 * Local development environment: everything runs against the Firebase
 * Emulator Suite (see firebase.json "emulators" and docs/local-development.md).
 *
 * The `demo-` project prefix tells Firebase this project is offline-only, so
 * any service that isn't emulated fails loudly instead of reaching
 * production. It must match LOCAL_PROJECT_ID in scripts/local-dev.mjs.
 * Ports must match firebase.json.
 */
export const environment: AppEnvironment = {
  firebase: {
    apiKey: 'demo-api-key',
    authDomain: 'demo-omnitask.firebaseapp.com',
    projectId: 'demo-omnitask',
    storageBucket: 'demo-omnitask.appspot.com',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:0000000000000000000000',
  },
  emulators: {
    host: '127.0.0.1',
    authPort: 9099,
    firestorePort: 8080,
    functionsPort: 5001,
    storagePort: 9199,
  },
};
