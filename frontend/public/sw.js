// The service worker itself - the one piece of this feature that can't live under src/, since
// browsers require a service worker file to be served from a plain, non-bundled URL at the
// scope it's meant to control (see frontend/src/lib/pushNotifications.ts's registerServiceWorker,
// which registers this exact file). Deliberately tiny: its only two jobs are showing a
// notification when a push arrives, and focusing/opening the app when that notification is
// clicked - everything else about reminders (deciding whether to send one, what it says) lives
// entirely on the backend (see backend/src/lib/reminderScheduler.ts).

self.addEventListener("push", (event) => {
  // The backend always sends a JSON payload (see webPush.ts's sendPushNotification) - falling
  // back to a generic message if a push ever arrives with no payload at all is defensive, not
  // expected to actually happen with this app's own backend.
  let payload = { title: "WellTrack", body: "You have a new reminder." };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      // Not JSON for some reason - keep the generic fallback above rather than crash.
    }
  }

  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Focus an already-open tab showing this app if one exists, rather than always opening a new
  // one - the standard "bring the user to the app" pattern for a notification click.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    }),
  );
});
