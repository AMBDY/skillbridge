const config = require('./config');

function hasProvider(name) {
  const p = config.providers[name];
  if (!p) return false;
  if (name === 'textract') return !!(p.enabled && p.accessKeyId && p.secretAccessKey);
  return !!(p.enabled && p.key);
}

function providerFor(task, plan) {
  const normalizedPlan = String(plan || 'basic').toLowerCase();
  if (normalizedPlan === 'basic') return 'rules';

  const priority = {
    cv: ['gemini', 'groq', 'openai'],
    questions: ['gemini', 'groq', 'openai'],
    video: ['whisper', 'groq', 'openai'],
    ocr: ['googleVision', 'textract'],
    fraud: ['gemini', 'groq', 'openai']
  }[task] || ['gemini', 'groq', 'openai'];

  return priority.find(hasProvider) || 'rules';
}

module.exports = { hasProvider, providerFor };
