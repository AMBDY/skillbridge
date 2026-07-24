const router = require('express').Router();
const { createAuthedClient } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');

function authedClient(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  return createAuthedClient(token);
}

// User: create a ticket
router.post('/tickets', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { subject, body, priority } = req.body;
  if (!subject || !body) return res.status(400).json({ error: 'Subject and message are required.' });
  const { data: ticket, error } = await c.from('support_tickets').insert({
    user_id: req.user.id, subject, priority: priority || 'normal'
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });

  await c.from('support_ticket_messages').insert({ ticket_id: ticket.id, sender_id: req.user.id, body });
  res.json(ticket);
});

// User: list own tickets
router.get('/tickets/mine', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('support_tickets').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// User or admin: ticket detail + thread
router.get('/tickets/:id', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data: ticket, error } = await c.from('support_tickets').select('*').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  const { data: messages } = await c.from('support_ticket_messages').select('*').eq('ticket_id', ticket.id).order('created_at', { ascending: true });
  res.json({ ticket, messages: messages || [] });
});

// User or admin: reply on a ticket
router.post('/tickets/:id/messages', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { body } = req.body;
  if (!body) return res.status(400).json({ error: 'Message cannot be empty.' });
  const { data, error } = await c.from('support_ticket_messages').insert({
    ticket_id: req.params.id, sender_id: req.user.id, body
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await c.from('support_tickets').update({ updated_at: new Date().toISOString() }).eq('id', req.params.id);
  res.json(data);
});

module.exports = router;
