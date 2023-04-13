import { createClient } from "redis";

export type RedisClientType = ReturnType<typeof createClient>;

interface CacheHolder {
  __redis?: RedisClientType | null;
}

const logger = console as Console & { isVerbose: boolean; verbose: (message?: any, ...optionalParams: any[]) => void };
logger.verbose = 0 === 1 + 0 ? logger.warn : () => {};
logger.isVerbose = false;

const cache = process.env.AWS_EXECUTION_ENV
  ? ({} as CacheHolder)
  : (((global as any).jest ? global : createClient) as unknown as CacheHolder);

export const getRedis = (): Promise<RedisClientType> | undefined => {
  if (!cache.__redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      return undefined;
    }

    let redis = createClient({
      url: process.env.REDIS_TOKEN ? url.replace("$REDIS_TOKEN", process.env.REDIS_TOKEN) : url,
      disableOfflineQueue: true,
    });

    /**
     * https://redis.js.org/#node-redis-usage-events
     *
     * You MUST listen to error events. If a client doesn’t have at least one error listener
     * registered and an error occurs, that error will be thrown and the Node.js process will exit.
     */
    redis.on("error", function (err) {
      console.error("Redis error:", err);
      closeRedis()
    });

    logger.info("Connecting to Redis", url);
    cache.__redis = redis;
    return new Promise(async (resolve, reject) =>
      redis
        .connect()
        .then(() => resolve(redis))
        .catch((err) => {
          logger.info("Redis connection failed", err);
          cache.__redis = undefined;
          reject(err);
        })
    );
  }

  return Promise.resolve(cache.__redis);
};

export const closeRedis = () => {
  if (cache.__redis) {
    logger.info("Disconnecting from Redis", process.env.REDIS_URL);
    cache.__redis.disconnect();
    cache.__redis = undefined;
  }
};

const CacheUtil = {
  prefix: process.env.CACHE_PREFIX || "",
  timeoutMs: 3 * 3600 * 1000, // 3 hours
  replacer: (key: string, value: any) => {
    if (
      (key.endsWith("Date") || key.endsWith("_at") || key.endsWith("At")) &&
      typeof value != "string" &&
      value.toISOString
    ) {
      return value.toISOString();
    }
    return value;
  },
  reviver: (key: string, value: any) => {
    if ((key.endsWith("Date") || key.endsWith("_at") || key.endsWith("At")) && value) {
      return new Date(value);
    }
    return value;
  },
  unjson: (str: string) => {
    return JSON.parse(str, CacheUtil.reviver);
  },
  json: (data: SettableValue): string => {
    return JSON.stringify(data, CacheUtil.replacer);
  },
};

type SettableValue = NonNullable<unknown>;
type Value = SettableValue | null;

interface ICache {
  redis?: RedisClientType;
  /**
   * Returns value if found, or null if not found
   */
  get: <T extends Value>(key: string) => Promise<T | null>;

  /**
   * Returns cached, or updates cache with new value by specifed def() creator function
   */
  getset: <T extends Value>(key: string, def: () => Promise<T>, timeoutMs?: number) => Promise<T | null>;

  /** Sets value, if data is null, removes value */
  set: <T extends Value>(key: string, data: T, timeoutMs?: number) => Promise<boolean>;
}

const createRedisCache = (redis: RedisClientType): ICache => ({
  redis,
  get: async <T extends Value>(key: string): Promise<T | null> => {
    const reply = await redis.get(CacheUtil.prefix + key);
    if (reply != null) {
      const data = CacheUtil.unjson(reply);
      if (logger.isVerbose) logger.verbose("Returning cached", key);
      return data;
    } else {
      if (logger.isVerbose) logger.verbose("Cache not found", key);
      return null;
    }
  },
  getset: async <T extends Value>(key: string, def: () => Promise<T>, timeoutMs?: number): Promise<T | null> => {
    const reply = await redis.get(CacheUtil.prefix + key);
    if (reply === null) {
      if (logger.isVerbose) logger.verbose("Cache not found", key);
      const value = await def();
      if (value !== null && value !== undefined) {
        await redis.set(CacheUtil.prefix + key, CacheUtil.json(value), {
          PX: timeoutMs ? timeoutMs : CacheUtil.timeoutMs,
        });
      } else {
        await redis.del(CacheUtil.prefix + key);
      }
      return value;
    } else {
      const data = CacheUtil.unjson(reply);
      if (logger.isVerbose) logger.verbose("Returning cached", key);
      return data;
    }
  },
  set: async <T extends Value>(key: string, data: T, timeoutMs?: number): Promise<boolean> => {
    if (data === null || data === undefined) {
      if (logger.isVerbose) logger.verbose("Removing cached value for " + data, key);
      const reply = await redis.del(key);
      return reply > 0;
    }

    if (logger.isVerbose) logger.verbose("Caching", key);
    if (data !== null && data !== undefined) {
      const reply = await redis.set(CacheUtil.prefix + key, CacheUtil.json(data), {
        PX: timeoutMs ? timeoutMs : CacheUtil.timeoutMs,
      });
      return reply === "OK";
    } else {
      const reply = await redis.del(CacheUtil.prefix + key);
      return reply > 0;
    }
  },
});

export const createNoneCache = (): ICache => ({
  get: <T extends Value>(_key: string): Promise<T | null> => Promise.resolve(null),
  getset: <T extends Value>(_key: string, def: () => Promise<T>) => Promise.resolve(def()),
  set: <T extends Value>(_key: string, _data: T) => Promise.resolve(false),
});

export const getCache = (): Promise<ICache> => {
  const redis = getRedis();
  return redis ? redis.then((client) => createRedisCache(client)) : Promise.resolve(createNoneCache());
};
