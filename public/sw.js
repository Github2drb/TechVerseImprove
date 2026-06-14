// public/sw.js  ← place in the /public folder of your project root
// This service worker receives push events and shows notifications on the engineer's phone

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'DRB TechVerse', body: event.data.text() }; }

  const options = {
    body:    data.body    || 'You have a new update',
    icon:    data.icon    || '/favicon.ico',
    badge:   '/favicon.ico',
    tag:     data.tag     || 'drb-notification',
    data:    { url: data.url || '/' },
    actions: [{ action: 'open', title: 'Open App' }],
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(self.registration.showNotification(data.title || 'DRB TechVerse', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client)
          return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
