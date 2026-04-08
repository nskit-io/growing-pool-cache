export interface CacheOptions {
  onGrowth?: (key: string) => void;
  onHit?: (key: string, mode: 'simple' | 'pool') => void;
  onMiss?: (key: string) => void;
}

export interface SetOptions {
  /** Time-to-live in seconds */
  ttl?: number | null;
  /** Hit count threshold to trigger pool growth. Enables pool mode when set. */
  poolTarget?: number | null;
}

export interface CacheInfo {
  key: string;
  hitCount: number;
  poolTarget: number | null;
  poolSize: number;
  isGrowing: boolean;
  createdAt: number;
  expiresAt: number | null;
  pool?: PoolEntry[];
}

export interface PoolEntry {
  id: string | number;
  hitCount: number;
  createdAt: number;
  response?: string;
}

export interface CacheStats {
  totalKeys: number;
  totalHits: number;
  poolKeys: number;
  simpleKeys: number;
  totalPoolResponses: number;
  expired: number;
}

export interface AdapterMeta {
  response: string;
  hitCount: number;
  poolTarget: number | null;
  poolSize: number;
  isGrowing: boolean;
  createdAt: number;
  expiresAt: number | null;
}

export interface AdapterSetData {
  response: string;
  poolTarget: number | null;
  expiresAt: number | null;
  isGrowing: boolean;
  incrementPoolSize: boolean;
}

export interface AdapterPoolPick {
  id: string | number;
  response: string;
}

export interface AdapterNewest {
  id: string | number;
  hitCount: number;
}

export interface Adapter {
  get(key: string): Promise<AdapterMeta | null>;
  set(key: string, data: AdapterSetData): Promise<void>;
  increment(key: string): Promise<void>;
  setGrowing(key: string, value: boolean): Promise<void>;
  getNewest(key: string): Promise<AdapterNewest | null>;
  getRandom(key: string): Promise<AdapterPoolPick | null>;
  addToPool(key: string, response: string): Promise<void>;
  incrementPoolEntry(key: string, entryId: string | number): Promise<void>;
  getPoolEntries(key: string): Promise<PoolEntry[]>;
  delete(key: string): Promise<void>;
  purgeExpired(): Promise<number>;
  getStats(): Promise<CacheStats>;
}

export class GrowingPoolCache {
  constructor(adapter: Adapter, options?: CacheOptions);
  get(key: string): Promise<any>;
  set(key: string, value: any, options?: SetOptions): Promise<void>;
  del(key: string): Promise<void>;
  info(key: string): Promise<CacheInfo | null>;
  purgeExpired(): Promise<number>;
  stats(): Promise<CacheStats>;
}

export class MemoryAdapter implements Adapter {
  constructor();
  get(key: string): Promise<AdapterMeta | null>;
  set(key: string, data: AdapterSetData): Promise<void>;
  increment(key: string): Promise<void>;
  setGrowing(key: string, value: boolean): Promise<void>;
  getNewest(key: string): Promise<AdapterNewest | null>;
  getRandom(key: string): Promise<AdapterPoolPick | null>;
  addToPool(key: string, response: string): Promise<void>;
  incrementPoolEntry(key: string, entryId: string | number): Promise<void>;
  getPoolEntries(key: string): Promise<PoolEntry[]>;
  delete(key: string): Promise<void>;
  purgeExpired(): Promise<number>;
  getStats(): Promise<CacheStats>;
  clear(): Promise<void>;
}

export class MySQLAdapter implements Adapter {
  constructor(pool: any);
  get(key: string): Promise<AdapterMeta | null>;
  set(key: string, data: AdapterSetData): Promise<void>;
  increment(key: string): Promise<void>;
  setGrowing(key: string, value: boolean): Promise<void>;
  getNewest(key: string): Promise<AdapterNewest | null>;
  getRandom(key: string): Promise<AdapterPoolPick | null>;
  addToPool(key: string, response: string): Promise<void>;
  incrementPoolEntry(key: string, entryId: string | number): Promise<void>;
  getPoolEntries(key: string): Promise<PoolEntry[]>;
  delete(key: string): Promise<void>;
  purgeExpired(): Promise<number>;
  getStats(): Promise<CacheStats>;
}

export class RedisAdapter implements Adapter {
  constructor(client: any, options?: { prefix?: string });
  get(key: string): Promise<AdapterMeta | null>;
  set(key: string, data: AdapterSetData): Promise<void>;
  increment(key: string): Promise<void>;
  setGrowing(key: string, value: boolean): Promise<void>;
  getNewest(key: string): Promise<AdapterNewest | null>;
  getRandom(key: string): Promise<AdapterPoolPick | null>;
  addToPool(key: string, response: string): Promise<void>;
  incrementPoolEntry(key: string, entryId: string | number): Promise<void>;
  getPoolEntries(key: string): Promise<PoolEntry[]>;
  delete(key: string): Promise<void>;
  purgeExpired(): Promise<number>;
  getStats(): Promise<CacheStats>;
}
