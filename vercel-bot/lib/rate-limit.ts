type ClientRecord = {
  count: number;
  resetAt: number;
};

const clients = new Map<string, ClientRecord>();

export function rateLimit(identifier: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const record = clients.get(identifier);

  if (!record || now > record.resetAt) {
    clients.set(identifier, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count += 1;
  clients.set(identifier, record);
  return true;
}

// Simple memory-based cleanup every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of Array.from(clients.entries())) {
    if (now > record.resetAt) {
      clients.delete(key);
    }
  }
}, 10 * 60 * 1000);
