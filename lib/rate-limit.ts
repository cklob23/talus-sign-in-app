/**
 * Process-local sliding window limiter.
 * Fine for a single Render instance. Not shared across replicas.
 */

interface Bucket {
  timestamps: number[]
}

const buckets = new Map<string, Bucket>()

export function rateLimit(key: string, limit: number, windowMs: number): {
  allowed: boolean
  remaining: number
} {
  const now = Date.now()
  const bucket = buckets.get(key) ?? { timestamps: [] }
  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowMs)

  if (bucket.timestamps.length >= limit) {
    buckets.set(key, bucket)
    return { allowed: false, remaining: 0 }
  }

  bucket.timestamps.push(now)
  buckets.set(key, bucket)
  return { allowed: true, remaining: limit - bucket.timestamps.length }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return request.headers.get("x-real-ip") || "unknown"
}
