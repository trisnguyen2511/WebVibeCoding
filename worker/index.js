self.addEventListener('push', (event) => {
  if (!event.data) return
  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { title: 'Tin nhắn mới', body: event.data.text() }
  }
  const title = data.title || 'Tin nhắn mới'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      data: { roomId: data.roomId },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = '/tools/private-chat'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (!('focus' in client)) continue
        // Whatever page the app currently has open, navigate it straight into
        // the chat instead of only focusing it (it may be sitting on the
        // home page or another tool).
        if ('navigate' in client && !client.url.includes('/tools/private-chat')) {
          return client.navigate(url).then((navigated) => (navigated || client).focus())
        }
        return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
