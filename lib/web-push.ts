import webpush from 'web-push'

let configured = false

export function getWebPush() {
  if (!configured) {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const privateKey = process.env.VAPID_PRIVATE_KEY
    const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com'
    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey)
    }
    configured = true
  }
  return webpush
}
