/**
 * POST /api/summary — the AI-generated paragraph shown before the email step.
 *
 * Calls Claude with the user's scores and answers. If ANTHROPIC_API_KEY is not
 * set, or the call fails, it returns a deterministic summary instead — the funnel
 * must never show an empty block or stall on a third-party outage.
 */
const MODEL = 'claude-haiku-4-5-20251001';

const DIM = {
  en:{presence:'Presence',warmth:'Warmth',power:'Power',spark:'Spark'},
  uk:{presence:'Присутність',warmth:'Тепло',power:'Сила',spark:'Іскра'},
  pl:{presence:'Obecność',warmth:'Ciepło',power:'Siła',spark:'Iskra'},
};
const LANG = { en:'English', uk:'Ukrainian', pl:'Polish' };

const DIMS = ['presence','warmth','power','spark'];

function deterministic(d, loc) {
  const dim = DIM[loc] || DIM.en;
  const top = DIMS.includes(d.archetype) ? d.archetype : 'presence';
  const low = DIMS.includes(d.edge) ? d.edge : 'warmth';
  const hi = dim[top], lo = dim[low];
  d = { ...d, archetype: top, edge: low, scores: { presence:50, warmth:50, power:50, spark:50, ...(d.scores||{}) } };
  const t = {
    en:`Your strongest signal is ${hi.toLowerCase()} at ${d.scores[d.archetype]}, and ${lo.toLowerCase()} sits lowest at ${d.scores[d.edge]}. That spread is the whole story: people already get something real from you, and one habit is muting the rest of it. Day 1 works on exactly that.`,
    uk:`Ваш найсильніший сигнал — ${hi.toLowerCase()} (${d.scores[d.archetype]}), найнижчий — ${lo.toLowerCase()} (${d.scores[d.edge]}). Саме цей розрив і є суттю: люди вже отримують від вас щось справжнє, але одна звичка приглушує решту. День 1 працює саме з нею.`,
    pl:`Twój najsilniejszy sygnał to ${hi.toLowerCase()} (${d.scores[d.archetype]}), a najniżej wypada ${lo.toLowerCase()} (${d.scores[d.edge]}). Ten rozstrzał to cała historia: ludzie już dostają od ciebie coś prawdziwego, a jeden nawyk wycisza resztę. Dzień 1 pracuje dokładnie nad tym.`,
  };
  return t[loc] || t.en;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }

  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
  if (!d || !d.scores || !d.edge || !d.archetype) return res.status(400).json({ ok:false });
  const loc = ['en','uk','pl'].includes(d.locale) ? d.locale : 'en';

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(200).json({ summary: deterministic(d, loc), source: 'fallback' });

  const prompt = `You write one short paragraph for someone who just finished a charisma self-assessment. Write in ${LANG[loc]}.

Their scores out of 100 — presence ${d.scores.presence}, warmth ${d.scores.warmth}, power ${d.scores.power}, spark ${d.scores.spark}.
Strongest: ${d.archetype}. Weakest: ${d.edge}.
Goal: ${d.goal || 'unstated'}. Situation that matters most: ${d.context || 'unstated'}. Self-reported block: ${d.blocker || 'unstated'}. Person they admire: ${d.model || 'unstated'}.

Rules: 45-70 words, second person, plain confident prose, no lists, no headings, no greeting, no emoji. Name the tension between their strongest and weakest dimension and connect it to their stated goal. Do not flatter and do not diagnose. Do not promise results. Output only the paragraph.`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 300, messages: [{ role:'user', content: prompt }] }),
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error('anthropic ' + r.status);
    const data = await r.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
    if (!text) throw new Error('empty');
    return res.status(200).json({ summary: text, source: 'ai' });
  } catch (e) {
    console.error('summary fallback:', e.message);
    return res.status(200).json({ summary: deterministic(d, loc), source: 'fallback' });
  }
}
