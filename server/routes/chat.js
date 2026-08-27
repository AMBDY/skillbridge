const router = require('express').Router();
const { supabase, createAuthedClient } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');

function authedClient(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  return createAuthedClient(token);
}
async function isConversationMember(c, conversationId, userId) {
  const { data } = await c.from('chat_conversations').select('id').eq('id', conversationId).or(`user_a.eq.${userId},user_b.eq.${userId}`).maybeSingle();
  return !!data;
}

// List conversations
router.get('/conversations', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('chat_conversations')
    .select('*')
    .or(`user_a.eq.${req.user.id},user_b.eq.${req.user.id}`)
    .order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  const userIds = [...new Set((data || []).flatMap(c => [c.user_a, c.user_b]))];
  let profileMap = new Map();
  if (userIds.length) {
    const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, profile_image').in('user_id', userIds);
    profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
  }
  const enriched = (data || []).map(c => ({
    ...c,
    user_a: profileMap.get(c.user_a) || null,
    user_b: profileMap.get(c.user_b) || null
  }));
  res.json(enriched);
});

// A small, privacy-safe people picker for starting a new conversation.
router.get('/people', authMiddleware, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const { data, error } = await supabase.from('profiles').select('user_id,display_name,profile_image,role,profile_sections').neq('user_id', req.user.id).ilike('display_name', `%${q}%`).limit(12);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// Create or get conversation
router.post('/conversations', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { other_user_id, related_job_id, related_listing_id } = req.body;
  if (!other_user_id || other_user_id === req.user.id) return res.status(400).json({ error: 'Choose another account to start a conversation.' });
  const a = [req.user.id, other_user_id].sort()[0];
  const b = [req.user.id, other_user_id].sort()[1];
  let existingQuery = c.from('chat_conversations').select('*').eq('user_a', a).eq('user_b', b);
  existingQuery = related_job_id ? existingQuery.eq('related_job_id', related_job_id) : existingQuery.is('related_job_id', null);
  existingQuery = related_listing_id ? existingQuery.eq('related_listing_id', related_listing_id) : existingQuery.is('related_listing_id', null);
  const { data: existing } = await existingQuery.maybeSingle();
  if (existing) return res.json(existing);
  const { data, error } = await c.from('chat_conversations').insert({
    user_a: a, user_b: b, related_job_id: related_job_id || null, related_listing_id: related_listing_id || null
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Messages for a conversation
router.get('/conversations/:id/messages', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('chat_messages')
    .select('*')
    .eq('conversation_id', req.params.id)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) return res.status(400).json({ error: error.message });
  const senderIds = [...new Set((data || []).map(m => m.sender_id).filter(Boolean))];
  let profileMap = new Map();
  if (senderIds.length) {
    const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, profile_image').in('user_id', senderIds);
    profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
  }
  const enriched = (data || []).map(m => ({ ...m, sender: profileMap.get(m.sender_id) || null }));
  res.json(enriched);
});

// Send message (REST fallback; primary path is socket)
router.post('/conversations/:id/messages', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  if (!(await isConversationMember(c, req.params.id, req.user.id))) return res.status(403).json({ error: 'You are not a participant in this conversation.' });
  const { body, message_type, file_url, original_language, translated_body } = req.body;
  const { data, error } = await c.from('chat_messages').insert({
    conversation_id: req.params.id, sender_id: req.user.id, body, message_type, file_url, original_language, translated_body
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Mark seen
router.put('/messages/:id/seen', authMiddleware, async (req, res) => {
  const c = authedClient(req);
  const { data, error } = await c.from('chat_messages').update({ seen: true }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = router;
