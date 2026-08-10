/**
 * POST /api/events — funnel telemetry.
 * Increments counters keyed by event, by arm, and by locale so the dashboard
 * can show drop-off, A/B lift, and language split without storing any PII.
 */
import { incr } from './_store.js';

const ALLOWED = new Set([
  'funnel_view','quiz_start','question_answered','gauge_view','loader_view','micro_answered',
  'reveal_view','email_view','email_invalid','consent_missing','lead_submitted','submit_failed',
  'success_view','share_clicked','retake','theme_toggled','locale_changed',
]);
const clean = v => String(v ?? '').replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 40);

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || !ALLOWED.has(b.event)) return res.status(204).end();

  const ev = b.event;
  const locale = clean(b.locale) || 'xx';
  const hero = clean(b.arms && b.arms.hero) || 'x';
  const lock = clean(b.arms && b.arms.lock) || 'x';

  const keys = [`ev:${ev}`, `ev:${ev}:hero:${hero}`, `ev:${ev}:lock:${lock}`, `ev:${ev}:loc:${locale}`];
  if (ev === 'question_answered' && b.props && b.props.n) keys.push(`q:${clean(b.props.n)}`);
  if (ev === 'share_clicked') keys.push('ref:shares');
  if (ev === 'funnel_view' && b.ref) keys.push('ref:arrivals');

  try { await Promise.all(keys.map(k => incr(k))); } catch (e) { console.error('events', e.message); }
  return res.status(204).end();
}
