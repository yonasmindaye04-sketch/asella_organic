import { Request, Response, NextFunction } from 'express';
import { LRUCache } from 'lru-cache';

// Create a cache instance with a 1-minute TTL and max 100 items
const cache = new LRUCache<string, any>({
  max: 100,
  ttl: 1000 * 60, // 1 minute
});

export const apiCache = (req: Request, res: Response, next: NextFunction) => {
  // Only cache GET requests
  if (req.method !== 'GET') {
    return next();
  }

  // Construct a unique cache key based on the URL and query parameters
  const key = `__express__${req.originalUrl || req.url}`;

  // Check if we have a cached response
  const cachedResponse = cache.get(key);
  if (cachedResponse) {
    res.setHeader('X-Cache', 'HIT');
    res.json(cachedResponse);
    return;
  }

  res.setHeader('X-Cache', 'MISS');

  // Intercept res.json to store the response in the cache
  const originalJson = res.json.bind(res);
  
  res.json = (body: any): Response => {
    // Store in cache
    cache.set(key, body);
    // Send the response
    return originalJson(body);
  };

  next();
};
