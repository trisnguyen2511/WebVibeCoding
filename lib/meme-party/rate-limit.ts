// Best-effort sliding-window limiter. On serverless each instance keeps its
// own window, so this slows abuse but is not a hard global guarantee.
const hits = new Map<string, number[]>()

export function rateLimited(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= max) {
    hits.set(key, recent)
    return true
  }
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) for (const k of Array.from(hits.keys()).slice(0, 1000)) hits.delete(k)
  return false
}

export function resetRateLimits() {
  hits.clear()
}
