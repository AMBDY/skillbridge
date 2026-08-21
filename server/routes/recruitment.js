const router = require('express').Router();
const { supabase, createAuthedClient } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');
const { generateQuestions } = require('../services/ai/question-generator');
const { analyzeCVAsync } = require('../services/ai/cv-analysis');
const { analyzeVideo } = require('../services/ai/video-analysis');
const { detectFraud } = require('../services/ai/fraud');
const { weightedCandidateScore, labelForScore, recommendationForScore } = require('../services/ai/scoring');
const { notify } = require('../utils/notify');

function authedClient(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  return createAuthedClient(token);
}

function parseList(value) {
  if (Array.isArray(value)) return value.map(String).map(s => s.trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(',').map(s => s.trim()).filter(Boolean);
}

function isRecruiter(role) { return ['client', 'admin'].includes(role); }
function isAdmin(role) { return role === 'admin'; }

router.get('/jobs', async (req, res) => {
  const { data, error } = await supabase.from('recruitment_jobs').select('*')
    .eq('approval_status', 'approved').order('created_at', { ascending: false }).limit(80);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.get('/jobs/:id', async (req, res) => {
  const { data: job, error } = await supabase.from('recruitment_jobs').select('*').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.approval_status !== 'approved') return res.status(404).json({ error: 'Job not found' });

  const [{ data: documents }, { data: questions }] = await Promise.all([
    supabase.from('recruitment_required_documents').select('*').eq('job_id', job.id),
    supabase.from('recruitment_questions').select('*').eq('job_id', job.id)
  ]);
  res.json({ ...job, documents: documents || [], questions: questions || [] });
});

router.post('/jobs', authMiddleware, async (req, res) => {
  if (!isRecruiter(req.user.role)) return res.status(403).json({ error: 'Only recruiters/clients can create recruitment jobs.' });

  const c = authedClient(req);
  const payload = req.body || {};
  if (!payload.title || !payload.company_name || !payload.description) {
    return res.status(400).json({ error: 'Title, company name, and description are required.' });
  }

  const jobInsert = {
    recruiter_id: req.user.id,
    title: payload.title,
    company_name: payload.company_name,
    description: payload.description,
    responsibilities: parseList(payload.responsibilities),
    required_skills: parseList(payload.required_skills),
    experience_required: Number(payload.experience_required || 0),
    education_requirement: payload.education_requirement || null,
    salary: payload.salary || null,
    location: payload.location || null,
    deadline: payload.deadline || null,
    ai_plan: payload.ai_plan || 'basic',
    approval_status: 'pending',
    video_enabled: payload.video_enabled || 'disabled',
    question_mode: payload.question_mode || 'manual',
    application_fields: Array.isArray(payload.application_fields) ? payload.application_fields : []
  };

  const { data: job, error } = await c.from('recruitment_jobs').insert(jobInsert).select().single();
  if (error) return res.status(400).json({ error: error.message });

  const docs = Array.isArray(payload.documents) ? payload.documents : [];
  if (docs.length) {
    await c.from('recruitment_required_documents').insert(docs.map(d => ({
      job_id: job.id, document_type: d.document_type, required: !!d.required
    })));
  }

  let questions = Array.isArray(payload.questions) ? payload.questions : [];
  if (job.question_mode === 'ai_generated') questions = generateQuestions(job);
  if (questions.length) {
    await c.from('recruitment_questions').insert(questions.map(q => ({
      job_id: job.id, question: q.question,
      duration_limit: Number(q.duration_limit || 120), attempts_allowed: Number(q.attempts_allowed || 1)
    })));
  }

  res.json(job);
});

router.get('/recruiter/jobs', authMiddleware, async (req, res) => {
  if (!isRecruiter(req.user.role)) return res.status(403).json({ error: 'Recruiter access required.' });
  const c = authedClient(req);
  const { data, error } = await c.from('recruitment_jobs').select('*').eq('recruiter_id', req.user.id).order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.put('/recruiter/jobs/:id', authMiddleware, async (req, res) => {
  if (!isRecruiter(req.user.role)) return res.status(403).json({ error: 'Recruiter access required.' });
  const c = authedClient(req);
  const fields = ['title','company_name','description','responsibilities','required_skills','experience_required','education_requirement','salary','location','deadline','ai_plan','video_enabled','question_mode','application_fields'];
  const changes = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => fields.includes(key)));
  if (!Object.keys(changes).length) return res.status(400).json({ error: 'No editable job fields supplied.' });
  const { data, error } = await c.from('recruitment_jobs').update({ ...changes, approval_status: 'pending' }).eq('id', req.params.id).eq('recruiter_id', req.user.id).select().single();
  if (error) return res.status(400).json({ error: error.message }); res.json(data);
});

router.delete('/recruiter/jobs/:id', authMiddleware, async (req, res) => {
  if (!isRecruiter(req.user.role)) return res.status(403).json({ error: 'Recruiter access required.' });
  const { data, error } = await authedClient(req).from('recruitment_jobs').delete().eq('id', req.params.id).eq('recruiter_id', req.user.id).select().single();
  if (error) return res.status(400).json({ error: error.message }); if (!data) return res.status(404).json({ error: 'Recruitment job not found.' }); res.json({ ok: true });
});

router.get('/recruiter/applicants', authMiddleware, async (req, res) => {
  if (!isRecruiter(req.user.role)) return res.status(403).json({ error: 'Recruiter access required.' });
  const c = authedClient(req);
  const { job_id } = req.query;
  let q = c.from('recruitment_applications')
    .select('*, recruitment_jobs!inner(*), recruitment_screening_results(*)')
    .eq('recruitment_jobs.recruiter_id', req.user.id)
    .order('created_at', { ascending: false });
  if (job_id) q = q.eq('job_id', job_id);
  const { data, error } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.post('/apply/:jobId', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data: job } = await supabase.from('recruitment_jobs').select('*').eq('id', req.params.jobId).eq('approval_status', 'approved').maybeSingle();
  if (!job) return res.status(404).json({ error: 'Approved job not found.' });
  if (job.video_enabled === 'mandatory' && !req.body?.video_url) {
    return res.status(400).json({ error: 'This job requires a video response.' });
  }

  const payload = req.body || {};
  const fields = Array.isArray(job.application_fields) ? job.application_fields : [];
  const answers = payload.answers && typeof payload.answers === 'object' ? payload.answers : {};
  const missingField = fields.find(field => field.required && !String(answers[field.key] || '').trim());
  if (missingField) return res.status(400).json({ error: `${missingField.label || missingField.key} is required for this job.` });
  const { data: application, error } = await c.from('recruitment_applications').insert({
    job_id: job.id, applicant_id: req.user.id,
    full_name: payload.full_name, email: payload.email, phone: payload.phone, cover_note: payload.cover_note,
    application_data: answers
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });

  const documents = Array.isArray(payload.documents) ? payload.documents : [];
  if (documents.length) {
    await c.from('recruitment_application_documents').insert(documents.map(d => ({
      application_id: application.id, file_url: d.file_url, file_type: d.file_type, document_type: d.document_type
    })));
  }

  let videoRecord = null;
  if (payload.video_url) {
    const { data } = await c.from('recruitment_application_videos').insert({
      application_id: application.id, video_url: payload.video_url, transcript: payload.transcript || null
    }).select().single();
    videoRecord = data;
  }

  const cv = await analyzeCVAsync({ job, documents });
  const video = await analyzeVideo({ video: videoRecord, job });
  const fraud = detectFraud({ documents, application, job });
  const score = weightedCandidateScore({
    skills: cv.skillsScore, experience: cv.experienceScore, education: cv.educationScore,
    certification: cv.certificationScore, video: video.videoScore
  });

  // Fixed: this used to insert with the anon client (no auth.uid()), which would
  // fail under RLS. Now uses the applicant's own authenticated client `c`.
  await c.from('recruitment_screening_results').insert({
    application_id: application.id,
    score, risk_score: fraud.riskScore, ranking_label: labelForScore(score),
    strengths: cv.strengths, weaknesses: [...cv.weaknesses, ...fraud.flags],
    recommendation: recommendationForScore(score, fraud.riskScore),
    provider_used: cv.provider || 'fallback'
  });

  await notify(c, { userId: job.recruiter_id, type: 'new_application', title: 'New application received', body: `Someone applied to "${job.title}"`, link: `/recruiter-applicants.html?job=${job.id}` });
  res.json({ application });
});

router.get('/applications/mine', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('recruitment_applications').select('*, recruitment_jobs(*)')
    .eq('applicant_id', req.user.id).order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.put('/applications/:id/status', authMiddleware, async (req, res) => {
  if (!isRecruiter(req.user.role)) return res.status(403).json({ error: 'Recruiter access required.' });
  const c = authedClient(req);
  const { status } = req.body;
  if (!['reviewing', 'shortlisted', 'rejected', 'hired'].includes(status)) return res.status(400).json({ error: 'Invalid application status.' });
  const { data, error } = await c.from('recruitment_applications').update({ status }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/applications/:id/interview', authMiddleware, async (req, res) => {
  if (!isRecruiter(req.user.role)) return res.status(403).json({ error: 'Recruiter access required.' });
  const c = authedClient(req);
  const { interview_at, interview_link, interview_notes } = req.body;
  const { data, error } = await c.from('recruitment_applications').update({ interview_at, interview_link, interview_notes }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  if (data) await notify(c, { userId: data.applicant_id, type: 'interview_scheduled', title: 'Interview scheduled', body: interview_at ? `Interview set for ${new Date(interview_at).toLocaleString()}` : 'Your interview details were updated', link: '/dashboard.html' });
  res.json(data);
});

router.get('/admin/jobs', authMiddleware, async (req, res) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin access required.' });
  const c = authedClient(req);
  const { data, error } = await c.from('recruitment_jobs').select('*').order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.put('/admin/jobs/:id', authMiddleware, async (req, res) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin access required.' });
  const c = authedClient(req);
  const allowed = ['title', 'company_name', 'description', 'responsibilities', 'required_skills', 'experience_required', 'education_requirement', 'salary', 'location', 'deadline', 'ai_plan', 'video_enabled', 'question_mode', 'application_fields'];
  const update = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
  if (!Object.keys(update).length) return res.status(400).json({ error: 'No editable job fields supplied.' });
  const { data, error } = await c.from('recruitment_jobs').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/admin/jobs/:id/status', authMiddleware, async (req, res) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin access required.' });
  const c = authedClient(req);
  const { approval_status, reason } = req.body;
  if (!['approved', 'rejected', 'suspended'].includes(approval_status)) return res.status(400).json({ error: 'Invalid approval status.' });
  const { data, error } = await c.from('recruitment_jobs').update({ approval_status }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  if (data) {
    await notify(c, {
      userId: data.recruiter_id, type: `recruitment_job_${approval_status}`, title: `Recruitment job ${approval_status}`,
      body: reason ? `"${data.title}" was ${approval_status}. Reason: ${reason}` : `"${data.title}" was ${approval_status}.`,
      link: '/recruiter-jobs.html'
    });
  }
  res.json(data);
});

module.exports = router;
