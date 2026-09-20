export const environment = {
  production: false,
  // Firebase Console → Project settings → General → Your apps → Web app → SDK config.
  // This config is not a secret; Firestore security rules are what protect the data.
  firebase: {
    apiKey: 'AIzaSyBPe6F8CH1F21jaPgeOZhmSj1-aklYNSBk',
    authDomain: 'iotel-e9a72.firebaseapp.com',
    projectId: 'iotel-e9a72',
    storageBucket: 'iotel-e9a72.firebasestorage.app',
    messagingSenderId: '308754467269',
    appId: '1:308754467269:web:54a098eae0bceab1f7a3ac',
    measurementId: 'G-F8SNB6HXRS',
  },
  // Set to true to talk to `firebase emulators:start` (Firestore on localhost:8080) instead of the cloud project.
  useEmulators: false,
};
