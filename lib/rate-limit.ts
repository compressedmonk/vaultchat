/**
 * Basic in-memory rate limit for MVP (e.g. forgot-password).
 * Do not reveal whether email exists; always return same timing/response shape.
 */

const store = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = store.get(key)
  if (!entry) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= maxAttempts) return false
  entry.count++
  return true
}

/**
 * Best-effort client IP extraction for rate-limiting keys.
 * Uses first x-forwarded-for hop when present.
 */
export function getClientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const xrip = headers.get('x-real-ip')?.trim()
  if (xrip) return xrip
  return 'unknown'
}

/**
 * Returns a coarse IP prefix key for abuse controls.
 * - IPv4: first 3 octets (e.g. 203.0.113.*)
 * - IPv6: first 4 hextets (e.g. 2001:db8:abcd:0012::*)
 */
export function getClientIpPrefix(ip: string): string {
  if (!ip || ip === 'unknown') return 'unknown'
  if (ip.includes(':')) {
    const parts = ip.split(':').filter(Boolean)
    return `ipv6:${parts.slice(0, 4).join(':') || 'unknown'}`
  }
  const parts = ip.split('.')
  if (parts.length === 4) {
    return `ipv4:${parts[0]}.${parts[1]}.${parts[2]}`
  }
  return `ip:${ip}`
}
