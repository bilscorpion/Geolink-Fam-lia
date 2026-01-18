
const CACHE_NAME = 'geolink-v17-final';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  notification.close();

  // Ao clicar na notificação, apenas focamos no app se ele já estiver aberto, 
  // pois a ação do link já foi feita de forma invisível pelo app principal.
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        clientList[0].focus();
        return;
      }
      return clients.openWindow('./');
    })
  );
});
