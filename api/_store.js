/**
 * Tiny event store. Uses Upstash/Vercel KV over REST when the env vars exist,
 * otherwise falls back to an in-memory map so local dev still works.
 * No SDK, no build step — just fetch.
 */
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const hasKV = Boolean(URL_ && TOKEN);

const mem = new Map();

async function cmd(args) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error('kv ' + r.status);
  return (await r.json()).result;
}

export async function incr(key, by = 1) {
  if (!hasKV) { mem.set(key, (mem.get(key) || 0) + by); return mem.get(key); }
  return cmd(['INCRBY', key, String(by)]);
}

export async function getMany(keys) {
  if (!keys.length) return {};
  if (!hasKV) return Object.fromEntries(keys.map(k => [k, mem.get(k) || 0]));
  const vals = await cmd(['MGET', ...keys]);
  return Object.fromEntries(keys.map((k, i) => [k, Number(vals[i]) || 0]));
}

export async function reset(keys) {
  if (!hasKV) { keys.forEach(k => mem.delete(k)); return; }
  if (keys.length) await cmd(['DEL', ...keys]);
}
