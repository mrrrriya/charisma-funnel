/** GET /api/stats — aggregates for the dashboard. */
import { getMany, hasKV, reset } from './_store.js';

const STEPS = ['funnel_view','quiz_start','gauge_view','reveal_view','email_view','lead_submitted','success_view'];
const ARMS = { hero:['a','b'], lock:['a','b'] };
const LOCALES = ['en','uk','pl'];

export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    if (process.env.DASHBOARD_TOKEN && req.headers['x-token'] !== process.env.DASHBOARD_TOKEN)
      return res.status(401).json({ ok:false });
    const keys = [...STEPS.map(s=>`ev:${s}`), ...Array.from({length:10},(_,i)=>`q:${i+1}`),
      'ref:shares','ref:arrivals'];
    for (const [n,arms] of Object.entries(ARMS)) for (const a of arms) for (const s of STEPS) keys.push(`ev:${s}:${n}:${a}`);
    for (const l of LOCALES) for (const s of STEPS) keys.push(`ev:${s}:loc:${l}`);
    await reset(keys);
    return res.status(200).json({ ok:true });
  }

  const keys = new Set(STEPS.map(s => `ev:${s}`));
  Array.from({length:10},(_,i)=>keys.add(`q:${i+1}`));
  keys.add('ref:shares'); keys.add('ref:arrivals');
  for (const [n,arms] of Object.entries(ARMS)) for (const a of arms) for (const s of STEPS) keys.add(`ev:${s}:${n}:${a}`);
  for (const l of LOCALES) for (const s of STEPS) keys.add(`ev:${s}:loc:${l}`);

  const v = await getMany([...keys]);
  const pick = pre => Object.fromEntries(STEPS.map(s => [s, v[`${pre}${s}`] || 0]));

  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    persistent: hasKV,
    funnel: STEPS.map(s => ({ step:s, count:v[`ev:${s}`]||0 })),
    questions: Array.from({length:10},(_,i)=>({ n:i+1, count:v[`q:${i+1}`]||0 })),
    arms: Object.fromEntries(Object.entries(ARMS).map(([n,arms]) =>
      [n, Object.fromEntries(arms.map(a => [a, Object.fromEntries(STEPS.map(s => [s, v[`ev:${s}:${n}:${a}`]||0]))]))])),
    locales: Object.fromEntries(LOCALES.map(l => [l, Object.fromEntries(STEPS.map(s => [s, v[`ev:${s}:loc:${l}`]||0]))])),
    referral: { shares: v['ref:shares']||0, arrivals: v['ref:arrivals']||0 },
    _unusedPick: undefined,
  });
}
