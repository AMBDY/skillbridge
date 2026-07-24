const router = require('express').Router();
const { supabase, createAuthedClient } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');

function authedClient(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  return createAuthedClient(token);
}

router.post('/', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { job_id, payment_id, reason } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'Please describe the issue.' });
  if (!job_id && !payment_id) return res.status(400).json({ error: 'A dispute must reference a job or a payment.' });

  // Sanity check: only someone actually party to the job/payment can open a dispute on it
  let involved = false;
  if (job_id) {
    const { data: job } = await supabase.from('jobs').select('user_id, assigned_to').eq('id', job_id).maybeSingle();
    if (job && (job.user_id === req.user.id || job.assigned_to === req.user.id)) involved = true;
  }
  if (payment_id) {
    const { data: payment } = await supabase.from('payments').select('client_id, worker_id').eq('id', payment_id).maybeSingle();
    if (payment && (payment.client_id === req.user.id || payment.worker_id === req.user.id)) involved = true;
  }
  if (!involved) return res.status(403).json({ error: 'You can only raise a dispute on a job or payment you are part of.' });

  const { data: dispute, error } = await c.from('disputes').insert({
    job_id: job_id || null, payment_id: payment_id || null, raised_by: req.user.id, reason
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });

  if (payment_id) await c.from('payments').update({ status: 'disputed' }).eq('id', payment_id);
  res.json(dispute);
});

router.get('/mine', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('disputes').select('*, jobs(title), payments(amount)').order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

module.exports = router;
