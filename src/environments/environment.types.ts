/**
 * Shape shared by src/environments/environment.ts (production) and
 * environment.local.ts (emulators). Kept in its own file because the `local`
 * build configuration replaces environment.ts with environment.local.ts, so
 * the local file cannot import types from the file it replaces.
 */
export interface EmulatorHosts {
  /** Host the Firebase emulators listen on. */
  host: string;
  authPort: number;
  firestorePort: number;
  functionsPort: number;
  storagePort: number;
}

export interface AppEnvironment {
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId?: string;
  };
  /** When set, Auth/Firestore/Functions/Storage connect to the local emulators. */
  emulators: EmulatorHosts | null;
}
