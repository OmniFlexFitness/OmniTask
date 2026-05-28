import { Provider } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import { Functions } from '@angular/fire/functions';
import { Storage } from '@angular/fire/storage';

/** Minimal Firebase DI tokens for unit tests (see issue #120). */
export const FIREBASE_TEST_PROVIDERS: Provider[] = [
  { provide: Auth, useValue: {} },
  { provide: Firestore, useValue: {} },
  { provide: Functions, useValue: {} },
  { provide: Storage, useValue: {} },
];
