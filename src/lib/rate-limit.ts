interface RateLimitOptions {
  interval: number; // in milliseconds (e.g. 60_000 for 1 minute)
  uniqueTokenPerInterval: number; // max active tokens to track (e.g. 500)
}

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export function rateLimit(options: RateLimitOptions) {
  const tokenCache = new Map<string, RateLimitRecord>();
  let lastCleanup = Date.now();

  const cleanup = () => {
    const now = Date.now();
    if (now - lastCleanup < options.interval) return;
    lastCleanup = now;

    for (const [key, record] of tokenCache.entries()) {
      if (now > record.resetAt) {
        tokenCache.delete(key);
      }
    }
  };

  return {
    check: (limit: number, token: string): { success: boolean; limit: number; remaining: number; reset: number } => {
      cleanup();

      const now = Date.now();
      const record = tokenCache.get(token);

      if (!record || now > record.resetAt) {
        // First request or window expired
        tokenCache.set(token, {
          count: 1,
          resetAt: now + options.interval,
        });

        // Limit cache size to prevent memory leaks
        if (tokenCache.size > options.uniqueTokenPerInterval) {
          const oldestKey = tokenCache.keys().next().value;
          if (oldestKey) tokenCache.delete(oldestKey);
        }

        return {
          success: true,
          limit,
          remaining: limit - 1,
          reset: now + options.interval,
        };
      }

      if (record.count >= limit) {
        return {
          success: false,
          limit,
          remaining: 0,
          reset: record.resetAt,
        };
      }

      record.count += 1;
      return {
        success: true,
        limit,
        remaining: limit - record.count,
        reset: record.resetAt,
      };
    },
  };
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}
