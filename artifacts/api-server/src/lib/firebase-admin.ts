import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

const adminApp = getApps()[0] || initializeApp({
    projectId: firebaseConfig.projectId,
    ...(process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      ? { credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) }
      : {}),
  });

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
