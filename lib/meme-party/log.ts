/** Structured, secret-free logging. Never pass tokens, passwords or signed URLs here. */
export function logEvent(event: string, data: Record<string, string | number | boolean | null | undefined> = {}) {
  if (process.env.NODE_ENV === 'test') return
  console.log(JSON.stringify({ event, at: new Date().toISOString(), ...data }))
}
