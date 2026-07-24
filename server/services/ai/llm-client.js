// Multi-provider LLM client. Fixed a real bug: this used to be a single
// callOpenAI() function that every "paid AI escalation" path called
// regardless of which provider provider-router.js actually resolved to —
// meaning Gemini/Groq were selected as the provider but silently never
// called, and the feature only worked if you specifically had an OpenAI
// key. Now callLLM(provider, ...) dispatches to the right API for real.

const config = require('./config');

async function callOpenAI(messages, fallback) {
  const key = config.providers.openai.key;
  if (!key) return fallback;
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages, temperature: 0.2 })
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    return data.choices?.[0]?.message?.content || fallback;
  } catch {
    return fallback;
  }
}

// Groq's API is OpenAI-compatible — same request/response shape, different
// base URL, key, and model name.
async function callGroq(messages, fallback) {
  const key = config.providers.groq.key;
  if (!key) return fallback;
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', messages, temperature: 0.2 })
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    return data.choices?.[0]?.message?.content || fallback;
  } catch {
    return fallback;
  }
}

// Gemini's REST API has a different shape — no separate system/user roles in
// the basic call, so system+user messages are combined into one prompt.
async function callGemini(messages, fallback) {
  const key = config.providers.gemini.key;
  if (!key) return fallback;
  try {
    const combined = messages.map(m => m.content).join('\n\n');
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: combined }] }] })
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || fallback;
  } catch {
    return fallback;
  }
}

// Dispatches to whichever provider was actually resolved by provider-router.js.
async function callLLM(provider, messages, fallback) {
  if (provider === 'gemini') return callGemini(messages, fallback);
  if (provider === 'groq') return callGroq(messages, fallback);
  if (provider === 'openai') return callOpenAI(messages, fallback);
  return fallback;
}

module.exports = { callLLM, callOpenAI, callGroq, callGemini };
