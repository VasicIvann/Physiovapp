importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");
importScripts("/firebase-config.js");

try {
  firebase.initializeApp(self.FIREBASE_CONFIG);
} catch {
  // ignore if already initialized
}

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || payload?.data?.title || "Physiovapp";
  const body = payload?.notification?.body || payload?.data?.body || "";
  const url = payload?.data?.url || "/";

  self.registration.showNotification(title, {
    body,
    icon: "/physiovapp.png",
    badge: "/physiovapp.png",
    data: { url },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event?.notification?.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});
