# Charisma Signature — quiz funnel v2

A 10-question quiz funnel for **Testora's AI Charisma Coach**. Ten questions, five interstitial screens, an AI-written summary, a personalised Day 1, and every lead pushed to Telegram.

Stack: one static `index.html`, one dashboard page, four Vercel serverless functions. No build step, no dependencies, no framework.

---

## Ship it

**1 · Telegram bot**
1. Message [@BotFather](https://t.me/BotFather) → `/newbot`, or `/revoke` if your token has leaked.
2. Send your bot any message — a bot cannot start a chat with you.
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `result[0].message.chat.id`.

**2 · Push and deploy**
Open the folder in Cursor → Source Control → `Publish to GitHub`. Then import the repo at [vercel.com/new](https://vercel.com/new). Framework preset **Other**, no build command.

**3 · Environment variables**

| Name | Required | What it does |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes | Lead delivery |
| `TELEGRAM_CHAT_ID` | yes | Where leads land |
| `ANTHROPIC_API_KEY` | no | Turns on the AI summary. Without it, a written fallback is used |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | no | Persistent analytics. Added automatically by the Upstash integration |
| `DASHBOARD_TOKEN` | no | Protects the stats reset endpoint |

Local dev: `npx vercel dev` with `.env.local` copied from `.env.example`.

---

## What's in it

**Flow.** Hero → Q1–Q3 → social proof → Q4 → typology teaser → Q5–Q6 → research stat → Q7–Q9 → readiness gauge → loader with micro-questions → partial reveal → Q10 email → Day 1.

**Progress bar.** Ten segments for ten questions, labelled with the section name. Interstitials hold the count rather than inventing progress.

**Personalisation.** Age tunes examples; goal is echoed at the gauge, the email step and the dated promise; context sets where Day 1 is practised; the role-model pick is compared against the lowest score to produce the gap line; the blocker adds a tailored note to the plan; the loader's time answer sets the plan length.

**AI summary.** `/api/summary` calls Claude Haiku with the scores and answers and returns 45–70 words in the user's language. Seven-second timeout, and a deterministic per-locale summary if the key is missing or the call fails — the funnel never shows an empty block.

**Localisation.** English, Ukrainian, Polish. Scoring lives in a language-neutral `QUIZ` array; all copy sits in `L.en` / `L.uk` / `L.pl`. Locale comes from `?lang=`, then the browser, then English. Adding a language means adding one object.

**Dark mode.** Follows the system, with a manual toggle. Every colour is a token defined in both schemes.

**Animation and gamification.** Screen transitions, answer confirmation before advancing, the signature drawing itself stroke-by-stroke, an animated readiness gauge, a loader that ticks through real percentages, and confetti on completion. All of it wrapped in `prefers-reduced-motion`.

**Referral.** Each session generates a code. Sharing appends `?ref=CODE`; arrivals with a ref are counted and the referrer's code travels with the lead to Telegram.

**A/B testing.** Two live experiments — hero copy (`?v=a|b`) and locked vs open Day 1 (`?lock=a|b`). Arms are reported with every event and every lead.

**Analytics.** `/api/events` increments counters (no personal data). `/dashboard.html` shows drop-off, answers per question, both experiments with conversion, language split and referral. Falls back to in-memory counters when no KV is configured — the dashboard says so at the top rather than pretending.

---

## Deliberate trade-offs

- **A failed submit blocks the user** rather than letting them through. Losing the lead is worse than the friction; `/api/submit` also writes a `LEAD_FALLBACK` line to the logs. A queue is the real fix.
- **No email is actually sent.** The success screen promises Day 2 tomorrow. Wire an ESP before this sees traffic.
- **Theme choice isn't persisted** across page loads.
- **"128,000 people" is a placeholder.** Replace with a real number or cut it.
- **Rate limiting is best-effort** — an in-memory map on ephemeral instances.
- **Role models are name cards, not photos.** Competitors use celebrity portraits; that is a rights exposure worth avoiding.

## Where to edit

Everything editable sits in the `<script>` blocks of `index.html`: `QUIZ` (scoring), `EXPERIMENTS` (A/B), `FLOW` (screen order), and `L.en` / `L.uk` / `L.pl` (all copy).
