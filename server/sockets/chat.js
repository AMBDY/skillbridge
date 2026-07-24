const { supabase, createAuthedClient } = require('../utils/db');

function initChatSockets(io, supabaseDefault) {
  const sb = supabaseDefault || supabase;
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (token) {
      socket.authedClient = createAuthedClient(token);
    }
    next();
  });

  io.on('connection', (socket) => {
    socket.on('join', (userId) => {
      socket.join(`user:${userId}`);
    });

    socket.on('typing', ({ conversationId, userId, isTyping }) => {
      socket.to(`conversation:${conversationId}`).emit('typing', { userId, isTyping });
    });

    socket.on('join_conversation', (conversationId) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('message', async (msg) => {
      try {
        const client = socket.authedClient || sb;
        const { conversation_id, sender_id, body, message_type, file_url, original_language, translated_body } = msg;
        const { data, error } = await client.from('chat_messages').insert({
          conversation_id, sender_id, body, message_type: message_type || 'text',
          file_url, original_language, translated_body
        }).select('*').single();
        if (error) return socket.emit('error', { message: 'Message failed to send: ' + error.message });
        const { data: sender } = await sb.from('profiles').select('display_name, profile_image').eq('user_id', sender_id).maybeSingle();
        const msgWithSender = { ...data, sender };
        io.to(`conversation:${conversation_id}`).emit('message', msgWithSender);
        const { data: conv } = await sb.from('chat_conversations').select('user_a, user_b').eq('id', conversation_id).maybeSingle();
        if (conv) {
          const recipient = conv.user_a === sender_id ? conv.user_b : conv.user_a;
          io.to(`user:${recipient}`).emit('notification', { type: 'message', data });
        }
      } catch (e) {
        socket.emit('error', { message: e.message });
      }
    });

    socket.on('seen', async ({ messageId, conversationId }) => {
      const client = socket.authedClient || sb;
      await client.from('chat_messages').update({ seen: true }).eq('id', messageId);
      io.to(`conversation:${conversationId}`).emit('seen', { messageId });
    });
  });
}

module.exports = { initChatSockets };
