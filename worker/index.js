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
      data: { roomId: data.roomId, messageId: data.messageId },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const messageId = event.notification.data && event.notification.data.messageId
  const url = '/tools/private-chat' + (messageId ? `?messageId=${encodeURIComponent(messageId)}` : '')
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (!('focus' in client)) continue
        // Whatever page the app currently has open, navigate it straight into
        // the chat (and to the specific message, if this notification was
        // about one) instead of only focusing it.
        if ('navigate' in client && !client.url.endsWith(url)) {
          return client.navigate(url).then((navigated) => (navigated || client).focus())
        }
        return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
