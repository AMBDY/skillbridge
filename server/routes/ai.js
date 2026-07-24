const router = require('express').Router();
const { callLLM } = require('../services/ai/llm-client');
const { providerFor } = require('../services/ai/provider-router');
const { deterministicRiskScore } = require('../services/ai/fraud-score');

async function bestEffortLLM(task, messages, fallback) {
  const provider = providerFor(task, 'standard'); // 'standard'+ so it actually looks for a configured provider, not gated by a specific job's paid plan
  if (provider === 'rules') return fallback;
  return callLLM(provider, messages, fallback);
}

router.post('/search/rank', (req, res) => {
  const { candidates, location } = req.body;
  const tierWeight = { elite: 4, featured: 3, pro: 2, free: 1 };
  const ranked = (candidates || []).map(c => {
    const tierScore = tierWeight[c.subscription_tier] || 1;
    const ratingScore = (c.rating || 0) / 5;
    const completionScore = (c.completion_rate || 100) / 100;
    const reviewScore = Math.min((c.review_count || 0) / 50, 1);
    const responseScore = 1 - Math.min((c.response_time_hours || 24) / 48, 1);
    const locationScore = location && c.state && c.state.toLowerCase() === location.toLowerCase() ? 1 : 0.5;
    const score = (tierScore * 0.3) + (ratingScore * 0.25) + (completionScore * 0.15) + (reviewScore * 0.1) + (responseScore * 0.1) + (locationScore * 0.1);
    return { ...c, ai_score: +score.toFixed(3) };
  }).sort((a, b) => b.ai_score - a.ai_score);
  res.json({ ranked });
});

router.post('/recommend', (req, res) => {
  const { candidates } = req.body;
  res.json({ recommendation: candidates?.[0] || null });
});

router.post('/translate', async (req, res) => {
  const { text, target_lang } = req.body;
  if (!text || !target_lang) return res.status(400).json({ error: 'text and target_lang are required.' });
  const config = require('../services/ai/config');
  const key = config.providers.googleTranslate.key;

  if (key) {
    try {
      const params = new URLSearchParams({ q: text, target: target_lang, key });
      const response = await fetch(`https://translation.googleapis.com/language/translate/v2?${params}`, { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        const result = data.data?.translations?.[0];
        if (result) {
          return res.json({ original: text, translated: result.translatedText, detected_lang: result.detectedSourceLanguage || 'auto', provider: 'googleTranslate' });
        }
      }
    } catch { /* fall through to placeholder */ }
  }

  res.json({
    original: text,
    translated: `[${target_lang}] ${text}`,
    detected_lang: 'auto',
    provider: 'placeholder',
    note: key ? 'Google Translate call failed — showing placeholder.' : 'Set GOOGLE_TRANSLATE_KEY for real translation.'
  });
});

router.post('/fraud-check', async (req, res) => {
  const fallback = deterministicRiskScore(req.body);
  const aiText = await bestEffortLLM('fraud', [
    { role: 'system', content: 'You are a strict fraud risk analyst for an escrow marketplace. Return compact JSON only with risk, score, and flags.' },
    { role: 'user', content: JSON.stringify(req.body) }
  ], JSON.stringify(fallback));
  try { res.json(JSON.parse(aiText)); } catch { res.json(fallback); }
});

router.post('/profile-suggestions', async (req, res) => {
  const { profile } = req.body;
  const fallback = {
    suggestions: [
      !profile?.headline ? 'Add a clear professional headline.' : null,
      !profile?.about ? 'Add an about section that explains your experience.' : null,
      !profile?.skills?.length ? 'Add at least 5 skills.' : null,
      !profile?.profile_image ? 'Upload a profile picture.' : null
    ].filter(Boolean)
  };
  const aiText = await bestEffortLLM('cv', [
    { role: 'system', content: 'Return compact JSON only: {"suggestions":["..."]}' },
    { role: 'user', content: JSON.stringify(profile || {}) }
  ], JSON.stringify(fallback));
  try { res.json(JSON.parse(aiText)); } catch { res.json(fallback); }
});

router.post('/price-suggest', async (req, res) => {
  const { category, description } = req.body;
  const fallbackAmount = category === 'jobs' ? 50000 : category === 'shop' ? 15000 : 25000;
  const fallback = { suggestedPrice: fallbackAmount, range: { min: fallbackAmount * 0.7, max: fallbackAmount * 1.3 } };
  const aiText = await bestEffortLLM('cv', [
    { role: 'system', content: 'Return compact JSON only with suggestedPrice and range {min,max}. Currency is NGN.' },
    { role: 'user', content: JSON.stringify({ category, description }) }
  ], JSON.stringify(fallback));
  try { res.json(JSON.parse(aiText)); } catch { res.json(fallback); }
});

router.post('/improve-message', async (req, res) => {
  const { text } = req.body;
  const improved = await bestEffortLLM('cv', [
    { role: 'system', content: 'Improve this marketplace message. Keep it concise and professional.' },
    { role: 'user', content: text || '' }
  ], text || '');
  res.json({ improved });
});

module.exports = router;
