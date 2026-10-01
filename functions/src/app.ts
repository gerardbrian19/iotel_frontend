/** Shared set-up for every function module; imported first so the Admin SDK is initialised before any use. */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();
setGlobalOptions({ region: 'asia-southeast1', maxInstances: 10 });

export const db = getFirestore();
