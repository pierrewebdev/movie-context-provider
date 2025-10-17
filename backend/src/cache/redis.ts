/**
 * Redis Cache Client
 * Provides a simple interface for caching with automatic fallback
 */

import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL;

let redisClient: Redis | null = null;

/**
 * Initialize Redis connection
 * Falls back gracefully if Redis is not configured
 */
function getRedisClient(): Redis | null {
  if (redisClient !== null) {
    return redisClient;
  }

  if (!REDIS_URL) {
    console.log('ℹ️  Redis caching disabled (REDIS_URL not set)');
    return null;
  }

  try {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      lazyConnect: true, // Don't connect until first command
    });

    redisClient.on('error', (err: Error) => {
      console.error('Redis connection error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis cache connected');
    });

    return redisClient;
  } catch (error) {
    console.error('Failed to initialize Redis:', error);
    return null;
  }
}

/**
 * Get a value from cache
 * @param key Cache key
 * @returns Cached value or null if not found/error
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const cached = await client.get(key);
    if (!cached) return null;

    return JSON.parse(cached) as T;
  } catch (error) {
    console.error(`Cache get error for key ${key}:`, error);
    return null;
  }
}

/**
 * Set a value in cache with TTL
 * @param key Cache key
 * @param value Value to cache (will be JSON stringified)
 * @param ttlSeconds Time to live in seconds
 */
export async function setCached<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.error(`Cache set error for key ${key}:`, error);
    // Don't throw - caching failures shouldn't break the app
  }
}

/**
 * Delete a key from cache
 * @param key Cache key
 */
export async function deleteCached(key: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.del(key);
  } catch (error) {
    console.error(`Cache delete error for key ${key}:`, error);
  }
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

