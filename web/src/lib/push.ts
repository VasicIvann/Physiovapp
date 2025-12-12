"use client";

import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { doc, setDoc } from "firebase/firestore";
import { auth, db, firebaseApp, isFirebaseConfigured } from "@/lib/firebase";

export type PushSetupResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

const vapidKey = (process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "").trim();

export const isPushAvailable = async () => {
  if (!isFirebaseConfigured) return false;
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;
  if (!("serviceWorker" in navigator)) return false;
  return isSupported();
};

export const requestPermission = async () => {
  if (!("Notification" in window)) return "denied" as NotificationPermission;
  return Notification.requestPermission();
};

export const registerMessagingServiceWorker = async () => {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/firebase-messaging-sw.js");
};

export const enablePushForCurrentUser = async (): Promise<PushSetupResult> => {
  if (!isFirebaseConfigured || !firebaseApp || !db || !auth) {
    return { ok: false, error: "Firebase non configure." };
  }
  const user = auth.currentUser;
  if (!user) return { ok: false, error: "Utilisateur non connecte." };
  if (!vapidKey) return { ok: false, error: "VAPID key manquante (NEXT_PUBLIC_FIREBASE_VAPID_KEY)." };

  const supported = await isPushAvailable();
  if (!supported) return { ok: false, error: "Push non supporte sur cet appareil/navigateur." };

  const permission = await requestPermission();
  if (permission !== "granted") return { ok: false, error: "Permission notifications refusee." };

  const registration = await registerMessagingServiceWorker();
  if (!registration) return { ok: false, error: "Service worker indisponible." };

  const messaging = getMessaging(firebaseApp);
  let token = "";
  try {
    token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  } catch (err) {
    console.error("FCM getToken failed", err);
    const message =
      err && typeof err === "object" && "message" in err && typeof (err as { message?: string }).message === "string"
        ? (err as { message: string }).message
        : "Erreur inconnue";
    return {
      ok: false,
      error:
        `Impossible d activer les notifications (getToken). ${message}. ` +
        "Verifie: VAPID = Web Push certificates (public), et que apiKey/authDomain/projectId/messagingSenderId/appId " +
        "correspondent au MEME projet Firebase (Project settings -> General -> Web app).",
    };
  }

  if (!token) return { ok: false, error: "Impossible d obtenir un token FCM." };

  await setDoc(
    doc(db, "pushTokens", token),
    {
      token,
      userId: user.uid,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    },
    { merge: true },
  );

  return { ok: true, token };
};

export const listenForegroundMessages = async (onPayload: (payload: unknown) => void) => {
  if (!isFirebaseConfigured || !firebaseApp) return () => {};
  const supported = await isPushAvailable();
  if (!supported) return () => {};
  const messaging = getMessaging(firebaseApp);
  return onMessage(messaging, (payload) => onPayload(payload));
};
