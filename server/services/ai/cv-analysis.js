const { providerFor } = require('./provider-router');
const { callLLM } = require('./llm-client');
const { extractText } = require('./ocr');

function keywordScore(required, text) {
  const matched = required.filter(skill => text.includes(skill));
  return { matched, skillsScore: required.length ? Math.round((matched.length / required.length) * 100) : 50 };
}

// Rule-based analysis using only the document type/file-type labels (no OCR).
// Used as the baseline and as the fallback if OCR/AI enhancement fails.
function ruleBasedAnalysis({ job = {}, documents = [] }) {
  const required = (job.required_skills || []).map(s => String(s).toLowerCase());
  const docText = documents.map(d => `${d.document_type || ''} ${d.file_type || ''}`).join(' ').toLowerCase();
  const { matched, skillsScore } = keywordScore(required, docText);
  const experienceScore = Number(job.experience_required || 0) <= 0 ? 70 : 55;
  const educationScore = job.education_requirement ? 60 : 70;
  const certificationScore = documents.some(d => String(d.document_type).toLowerCase().includes('certification')) ? 90 : 50;
  return {
    skillsScore, experienceScore, educationScore, certificationScore,
    strengths: matched.length ? [`Matched skills: ${matched.join(', ')}`] : ['Application submitted successfully'],
    weaknesses: matched.length < required.length ? ['Some required skills were not detected in uploaded document labels'] : [],
    provider: 'rules'
  };
}

// Synchronous wrapper kept for back-compat; does not run OCR or paid AI. Prefer analyzeCVAsync.
function analyzeCV(args) {
  return ruleBasedAnalysis(args);
}

// Full pipeline: OCR the actual document content (if a provider is configured
// and the document has a real, publicly-reachable file_url — which is only
// true now that uploads go through /api/uploads instead of pasted links),
// then optionally enhance with a paid AI provider for standard+ plans.
// Falls back to pure label-based rules at every step on any failure.
async function analyzeCVAsync({ job = {}, documents = [] }) {
  const required = (job.required_skills || []).map(s => String(s).toLowerCase());

  // Step 1: OCR real document content where possible
  let ocrText = '';
  let ocrProvider = 'fallback';
  for (const doc of documents) {
    if (!doc.file_url) continue;
    try {
      const result = await extractText({ url: doc.file_url, file_type: doc.file_type });
      if (result.text) { ocrText += ' ' + result.text.toLowerCase(); ocrProvider = result.provider; }
    } catch { /* ignore, fall back to label matching for this document */ }
  }

  const base = ruleBasedAnalysis({ job, documents });
  if (ocrText) {
    const { matched, skillsScore } = keywordScore(required, ocrText);
    base.skillsScore = Math.max(base.skillsScore, skillsScore);
    if (matched.length) base.strengths = [`Matched skills (from document text): ${matched.join(', ')}`];
    base.provider = ocrProvider;
  }

  // Step 2: optional paid-plan AI enhancement on top of whatever we have so far
  const provider = providerFor('cv', job.ai_plan);
  if (provider === 'rules') return base;

  const docSummary = documents.map(d => `${d.document_type || 'document'} (${d.file_type || 'unknown type'})`).join(', ') || 'no documents uploaded';
  const prompt = [
    { role: 'system', content: 'You are screening a job applicant\'s CV/documents for a recruiter. Return compact JSON only: {"strengths":["..."],"weaknesses":["..."]}. Max 3 items each.' },
    { role: 'user', content: JSON.stringify({ job_title: job.title, required_skills: job.required_skills, experience_required: job.experience_required, documents: docSummary, extracted_text_excerpt: ocrText.slice(0, 2000) }) }
  ];
  const raw = await callLLM(provider, prompt, null);
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw);
    return {
      ...base,
      strengths: parsed.strengths?.length ? parsed.strengths : base.strengths,
      weaknesses: parsed.weaknesses?.length ? parsed.weaknesses : base.weaknesses,
      provider
    };
  } catch {
    return base;
  }
}

module.exports = { analyzeCV, analyzeCVAsync };
