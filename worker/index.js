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
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      data: { roomId: data.roomId },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const roomId = event.notification.data && event.notification.data.roomId
  const url = '/tools/private-chat'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('/tools/private-chat') && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
