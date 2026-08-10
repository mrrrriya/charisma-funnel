/**
 * Storage layer for funnel counters.
 *
 * Supports two connection styles, tried in this order:
 *   1. REDIS_URL — a standard redis:// or rediss:// connection string,
 *      as provisioned by most Vercel Marketplace Redis add-ons. Uses the
 *      official `redis` npm package over a real TCP connection.
 *   2. UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (or the older
 *      KV_REST_API_URL / KV_REST_API_TOKEN names) — Upstash's HTTPS REST
 *      API, used when the integration exposes REST credentials instead
 *      of a raw connection string. No extra dependency needed for this path.
 *
 * If neither is present, falls back to an in-memory Map so local dev and
 * unconfigured deployments still work — just without persistence across
 * serverless instances.
 */

const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_CONNECTION_STRING || '';
const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const hasKV = Boolean(REDIS_URL || (REST_URL && REST_TOKEN));

const mem = new Map();

/* ---------- TCP client (redis npm package), reused across warm invocations ---------- */
let tcpClientPromise = null;
async function getTcpClient() {
  if (!REDIS_URL) return null;
  if (!tcpClientPromise) {
    tcpClientPromise = (async () => {
      const { createClient } = await import('redis');
      const client = createClient({ url: REDIS_URL, socket: { connectTimeout: 5000 } });
      client.on('error', (e) => console.error('redis client error:', e.message));
      await client.connect();
      return client;
    })().catch((e) => {
      tcpClientPromise = null; // allow retry on next call instead of caching a dead promise
      throw e;
    });
  }
  return tcpClientPromise;
}

/* ---------- REST client (Upstash HTTPS API) ---------- */
async function restCmd(args) {
  const r = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error('kv rest ' + r.status);
  return (await r.json()).result;
}

/* ---------- public API ---------- */
export async function incr(key, by = 1) {
  try {
    if (REDIS_URL) {
      const client = await getTcpClient();
      return await client.incrBy(key, by);
    }
    if (REST_URL && REST_TOKEN) return await restCmd(['INCRBY', key, String(by)]);
  } catch (e) {
    console.error('incr failed, falling back to memory:', e.message);
  }
  mem.set(key, (mem.get(key) || 0) + by);
  return mem.get(key);
}

export async function getMany(keys) {
  if (!keys.length) return {};
  try {
    if (REDIS_URL) {
      const client = await getTcpClient();
      const vals = await client.mGet(keys);
      return Object.fromEntries(keys.map((k, i) => [k, Number(vals[i]) || 0]));
    }
    if (REST_URL && REST_TOKEN) {
      const vals = await restCmd(['MGET', ...keys]);
      return Object.fromEntries(keys.map((k, i) => [k, Number(vals[i]) || 0]));
    }
  } catch (e) {
    console.error('getMany failed, falling back to memory:', e.message);
  }
  return Object.fromEntries(keys.map((k) => [k, mem.get(k) || 0]));
}

export async function reset(keys) {
  if (!keys.length) return;
  try {
    if (REDIS_URL) {
      const client = await getTcpClient();
      await client.del(keys);
      return;
    }
    if (REST_URL && REST_TOKEN) {
      await restCmd(['DEL', ...keys]);
      return;
    }
  } catch (e) {
    console.error('reset failed, falling back to memory:', e.message);
  }
  keys.forEach((k) => mem.delete(k));
}
