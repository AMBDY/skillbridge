// Minimal in-memory rate limiter. Good enough for a single-process deployment;
// if you scale to multiple server instances behind a load balancer, replace
// the Map below with a shared store (Redis) so limits are consistent across
// instances.
function rateLimit({ windowMs, max, message }) {
  const hits = new Map(); // ip -> { count, resetAt }

  // Periodically clear stale entries so this Map doesn't grow forever
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) if (entry.resetAt < now) hits.delete(ip);
  }, windowMs).unref?.();

  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = hits.get(ip);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }
    entry.count++;
    if (entry.count > max) {
      return res.status(429).json({ error: message || 'Too many requests, please try again shortly.' });
    }
    next();
  };
}

module.exports = { rateLimit };
