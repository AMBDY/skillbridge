const config = require('./config');
const { providerFor } = require('./provider-router');
const { callLLM } = require('./llm-client');
const { supabase } = require('../../utils/db');

// Real transcription via OpenAI's Whisper endpoint — only runs if a Whisper
// key is configured (falls back to WHISPER_API_KEY, then OPENAI_API_KEY).
// video.video_url must be a publicly reachable URL (from /api/uploads).
async function transcribeWhisper(video) {
  const key = config.providers.whisper.key;
  if (!key || !video?.video_url) return null;
  try {
    const fileRes = await fetch(video.video_url);
    if (!fileRes.ok) return null;
    const blob = await fileRes.blob();
    const form = new FormData();
    form.append('file', blob, 'response.mp4');
    form.append('model', 'whisper-1');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.text || null;
  } catch {
    return null;
  }
}

function wordCountScore(transcript) {
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  return { videoScore: words < 15 ? 30 : words < 40 ? 60 : 85, flags: words < 15 ? ['Very short video response'] : [] };
}

// Real qualitative check: does the transcript actually address the job's
// screening questions, rather than just being long? Falls back to the
// word-count heuristic if no LLM provider is configured or the call fails.
async function qualitativeScore(transcript, job) {
  const provider = providerFor('cv', job.ai_plan); // reuse the LLM-only provider list (video's own list is transcription-first)
  if (provider === 'rules') return null;

  let questions = [];
  try {
    const { data } = await supabase.from('recruitment_questions').select('question').eq('job_id', job.id);
    questions = (data || []).map(q => q.question);
  } catch { /* proceed without questions if this lookup fails */ }

  const prompt = [
    { role: 'system', content: 'You are screening a job applicant\'s video response transcript. Return compact JSON only: {"score": 0-100, "flags": ["..."]}. Score based on relevance, clarity, and substance — not just length. Max 3 flags.' },
    { role: 'user', content: JSON.stringify({ job_title: job.title, questions, transcript }) }
  ];
  const raw = await callLLM(provider, prompt, null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.score === 'number') return { videoScore: Math.max(0, Math.min(100, Math.round(parsed.score))), flags: parsed.flags || [] };
  } catch { /* fall through */ }
  return null;
}

// Scores a video response. Without a configured provider this stays a flat
// placeholder (matches original behavior). With Whisper configured, real
// transcription runs; with an LLM provider also available, scoring checks
// actual relevance to the job's questions rather than just transcript length.
async function analyzeVideo({ video, job = {} }) {
  if (!video) return { videoScore: 0, transcript: '', flags: [] };

  const provider = providerFor('video', job.ai_plan);
  if (provider === 'rules' || provider !== 'whisper') {
    return { videoScore: 60, transcript: video.transcript || '', flags: [] };
  }

  const transcript = video.transcript || await transcribeWhisper(video);
  if (!transcript) return { videoScore: 40, transcript: '', flags: ['Could not transcribe video — scored as incomplete'] };

  const qualitative = await qualitativeScore(transcript, job);
  const { videoScore, flags } = qualitative || wordCountScore(transcript);
  return { videoScore, transcript, flags };
}

module.exports = { analyzeVideo, transcribeWhisper };
