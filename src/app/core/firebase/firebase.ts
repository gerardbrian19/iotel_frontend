import { InjectionToken, inject } from '@angular/core';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import { Firestore, connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP', {
  providedIn: 'root',
  factory: () => (getApps().length ? getApp() : initializeApp(environment.firebase)),
});

/** Points an Auth instance at the local emulator when `environment.useEmulators` is set. */
export function useAuthEmulatorIfEnabled(auth: Auth): Auth {
  if (environment.useEmulators) {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  }
  return auth;
}

export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH', {
  providedIn: 'root',
  factory: () => useAuthEmulatorIfEnabled(getAuth(inject(FIREBASE_APP))),
});

export const FIRESTORE = new InjectionToken<Firestore>('FIRESTORE', {
  providedIn: 'root',
  factory: () => {
    const firestore = getFirestore(inject(FIREBASE_APP));
    if (environment.useEmulators) {
      connectFirestoreEmulator(firestore, 'localhost', 8080);
    }
    return firestore;
  },
});
