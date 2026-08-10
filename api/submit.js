/**
 * POST /api/submit — validates a completed funnel run and pushes it to Telegram.
 * The bot token is read server-side only and never reaches the browser.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const seen = new Map();
const WINDOW_MS = 60_000, MAX_PER_WINDOW = 6;

const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').slice(0, 500);

function throttled(ip) {
  const now = Date.now();
  const hits = (seen.get(ip) || []).filter(t => now - t < WINDOW_MS);
  hits.push(now); seen.set(ip, hits);
  if (seen.size > 500) seen.clear();
  return hits.length > MAX_PER_WINDOW;
}

function buildMessage(d) {
  const s = d.scores || {}, m = d.meta || {}, u = m.utm || {}, x = d.extra || {};
  const source = u.source ? `${u.source} / ${u.medium || '—'} / ${u.campaign || '—'}` : (m.referrer || 'direct');
  const answers = (Array.isArray(d.answers) ? d.answers : [])
    .map(a => `${a.n}. <b>${esc(a.question)}</b>\n    ↳ ${esc(a.answer)}`).join('\n');
  return [
    '✨ <b>New Charisma Coach lead</b>',
    '',
    `📧 <code>${esc(d.email)}</code>`,
    `🏷 ${esc(d.archetype)} · growth edge: <b>${esc(d.edge)}</b>`,
    `📊 Presence ${s.presence ?? '—'} · Warmth ${s.warmth ?? '—'} · Power ${s.power ?? '—'} · Spark ${s.spark ?? '—'}`,
    '',
    '<b>Answers</b>', answers || '—',
    '',
    `⏱ ${x.time || '—'} min/day · 🔔 nudge: ${x.nudge || '—'}`,
    d.aiSummary ? `<b>AI summary</b> (${esc(d.aiSource)})\n<i>${esc(d.aiSummary)}</i>` : null,
    '',
    `🌍 ${esc(d.locale)} · 🧪 hero ${esc(m.arms && m.arms.hero)} / lock ${esc(m.arms && m.arms.lock)}`,
    `⏳ ${m.secondsToComplete ?? '—'}s · 📱 ${esc(m.device)}${m.ref ? ` · 🤝 referred by ${esc(m.ref)}` : ''}`,
    `🔗 ${esc(source)}`,
    `🕒 ${new Date().toISOString().replace('T',' ').slice(0,16)} UTC`,
  ].filter(x => x !== null).join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({ ok:false, error:'Method not allowed' }); }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (throttled(ip)) return res.status(429).json({ ok:false, error:'Too many submissions' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || !EMAIL_RE.test(String(body.email || '')))
    return res.status(400).json({ ok:false, error:'A valid email is required' });

  const token = process.env.TELEGRAM_BOT_TOKEN, chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return res.status(500).json({ ok:false, error:'Notifications are not configured' });
  }

  try {
    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: buildMessage(body), parse_mode:'HTML', disable_web_page_preview: true }),
    });
    const result = await tg.json();
    if (!result.ok) {
      console.error('Telegram rejected:', result.description);
      console.info('LEAD_FALLBACK', JSON.stringify(body));
      return res.status(502).json({ ok:false, error:'Could not deliver notification' });
    }
    return res.status(200).json({ ok:true });
  } catch (err) {
    console.error('submit failed:', err);
    console.info('LEAD_FALLBACK', JSON.stringify(body));
    return res.status(500).json({ ok:false, error:'Something went wrong' });
  }
}
