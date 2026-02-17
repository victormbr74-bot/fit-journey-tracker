self.addEventListener("install", () => {
  self.skipWaiting();
});

const APP_ICON = "/favicon.png";
const APP_BADGE = "/favicon.png";

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetPath = event.notification?.data?.targetPath || "/chat";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        if (clients.length > 0) {
          const client = clients[0];
          return client.focus().then(() => {
            if ("navigate" in client) {
              return client.navigate(targetPath);
            }
            return undefined;
          });
        }
        return self.clients.openWindow(targetPath);
      })
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {
    title: "FitChat",
    body: "Voce recebeu uma nova mensagem.",
    targetPath: "/chat",
    icon: APP_ICON,
    badge: APP_BADGE,
  };

  try {
    const parsed = event.data.json();
    payload = {
      title: parsed?.title || payload.title,
      body: parsed?.body || payload.body,
      targetPath: parsed?.targetPath || payload.targetPath,
      icon: parsed?.icon || payload.icon,
      badge: parsed?.badge || payload.badge,
    };
  } catch {
    const text = event.data.text();
    if (text) {
      payload.body = text;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      tag: "fitchat-message",
      renotify: true,
      data: {
        targetPath: payload.targetPath,
      },
    })
  );
});
